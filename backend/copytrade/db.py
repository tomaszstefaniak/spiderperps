"""SQLite persistence. One short-lived connection per operation keeps it thread-safe."""
from __future__ import annotations

import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    address      TEXT NOT NULL,
    network      TEXT NOT NULL,
    multiplier   REAL NOT NULL DEFAULT 1.0,   -- scales the equity-proportional copy size
    max_usd      REAL NOT NULL DEFAULT 500,   -- cap on the notional of one copied trade
    max_leverage INTEGER NOT NULL DEFAULT 10,
    sl_pct       REAL DEFAULT 5,              -- stop-loss attached to every copy (price move %)
    tp_pct       REAL,                        -- optional take-profit (price move %)
    notify_info  INTEGER NOT NULL DEFAULT 0,  -- also push alerts that need no action
    created_at   INTEGER NOT NULL,
    PRIMARY KEY (address, network)
);
-- What each follower actually holds *because of* copying each leader. Decreases and closes
-- only ever touch this amount, never positions the follower opened on their own.
CREATE TABLE IF NOT EXISTS copied (
    follower   TEXT NOT NULL,
    network    TEXT NOT NULL,
    leader     TEXT NOT NULL,
    coin       TEXT NOT NULL,
    szi        REAL NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (follower, network, leader, coin)
);
CREATE TABLE IF NOT EXISTS challenges (
    nonce      TEXT PRIMARY KEY,
    address    TEXT NOT NULL,
    network    TEXT NOT NULL,
    message    TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    address    TEXT NOT NULL,
    network    TEXT NOT NULL,
    signer     TEXT NOT NULL,
    role       TEXT NOT NULL,                 -- 'wallet' (main key) or 'agent'
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS links (
    agent      TEXT NOT NULL,                 -- agent key generated on a phone
    network    TEXT NOT NULL,
    address    TEXT NOT NULL,                 -- account that approved it
    created_at INTEGER NOT NULL,
    PRIMARY KEY (agent, network)
);
CREATE TABLE IF NOT EXISTS devices (
    push_token TEXT PRIMARY KEY,
    address    TEXT NOT NULL,
    network    TEXT NOT NULL,
    platform   TEXT,
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS follows (
    follower   TEXT NOT NULL,
    network    TEXT NOT NULL,
    leader     TEXT NOT NULL,
    label      TEXT,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (follower, network, leader)
);
CREATE TABLE IF NOT EXISTS leader_snapshots (
    leader        TEXT PRIMARY KEY,
    positions     TEXT NOT NULL,              -- JSON {coin: {szi, entryPx, leverage}}
    account_value REAL NOT NULL,
    updated_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS proposals (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    follower    TEXT NOT NULL,
    network     TEXT NOT NULL,
    leader      TEXT NOT NULL,
    coin        TEXT NOT NULL,
    event       TEXT NOT NULL,                -- open | increase | decrease | close | flip
    is_buy      INTEGER NOT NULL,
    size        REAL NOT NULL,                -- 0 for alert-only proposals
    reduce_only INTEGER NOT NULL,
    leverage    INTEGER,
    ref_px      REAL,                         -- follower-network mid when proposed
    notional    REAL,
    leader_from REAL NOT NULL,                -- leader position before/after the move
    leader_to   REAL NOT NULL,
    leader_px   REAL,
    sl_pct      REAL,
    tp_pct      REAL,
    note        TEXT,                         -- why it isn't actionable, if it isn't
    status      TEXT NOT NULL,                -- pending | info | approved | rejected | expired | superseded | failed
    result      TEXT,                         -- JSON reported by the phone after execution
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS proposals_by_follower ON proposals (follower, network, status, created_at);
CREATE INDEX IF NOT EXISTS proposals_open ON proposals (follower, network, leader, coin, status);
CREATE TABLE IF NOT EXISTS push_log (
    follower     TEXT NOT NULL,
    network      TEXT NOT NULL,
    leader       TEXT NOT NULL,
    last_push_at INTEGER NOT NULL,
    PRIMARY KEY (follower, network, leader)
);
CREATE TABLE IF NOT EXISTS leaders (
    address    TEXT PRIMARY KEY,
    stage      INTEGER NOT NULL,              -- 1 = leaderboard screen only, 2 = deep scored
    score      REAL,
    metrics    TEXT NOT NULL,                 -- JSON
    updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS kv (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def now() -> int:
    return int(time.time())


_db_path: Path = config.DB_PATH


def configure(path: Path) -> None:
    """Point the module at another database (tests)."""
    global _db_path
    _db_path = path


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(_db_path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init() -> None:
    with connect() as c:
        c.executescript(SCHEMA)
        _add_missing_columns(c, "users", {"notify_info": "INTEGER NOT NULL DEFAULT 0"})


def _add_missing_columns(c: sqlite3.Connection, table: str, columns: dict[str, str]) -> None:
    """Bring databases created by an older schema up to date."""
    have = {r["name"] for r in c.execute(f"PRAGMA table_info({table})")}
    for name, decl in columns.items():
        if name not in have:
            c.execute(f"ALTER TABLE {table} ADD COLUMN {name} {decl}")


def copied_szi(follower: str, network: str, leader: str, coin: str) -> float:
    with connect() as c:
        row = c.execute(
            "SELECT szi FROM copied WHERE follower = ? AND network = ? AND leader = ? AND coin = ?",
            (follower, network, leader, coin),
        ).fetchone()
    return row["szi"] if row else 0.0


def record_fill(follower: str, network: str, leader: str, coin: str, signed_size: float, reduce_only: bool) -> float:
    """Apply an executed copy to the ledger. Returns the new copied size."""
    with connect() as c:
        row = c.execute(
            "SELECT szi FROM copied WHERE follower = ? AND network = ? AND leader = ? AND coin = ?",
            (follower, network, leader, coin),
        ).fetchone()
        before = row["szi"] if row else 0.0
        after = before + signed_size
        if reduce_only and before != 0 and (after == 0 or (after > 0) != (before > 0)):
            after = 0.0  # a reduce can flatten the copied size but never flip it
        if abs(after) < 1e-12:
            c.execute(
                "DELETE FROM copied WHERE follower = ? AND network = ? AND leader = ? AND coin = ?",
                (follower, network, leader, coin),
            )
        else:
            c.execute(
                "INSERT INTO copied (follower, network, leader, coin, szi, updated_at) VALUES (?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(follower, network, leader, coin) DO UPDATE SET szi = excluded.szi, "
                "updated_at = excluded.updated_at",
                (follower, network, leader, coin, after, now()),
            )
    return after


def kv_get(key: str) -> str | None:
    with connect() as c:
        row = c.execute("SELECT value FROM kv WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else None


def kv_set(key: str, value: str) -> None:
    with connect() as c:
        c.execute(
            "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
