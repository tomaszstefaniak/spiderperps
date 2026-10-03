"""Find wallets worth following: screen the public leaderboard, then deep-score the best.

Run once by hand with `python -m copytrade.discovery`; the service also refreshes it in the
background every COPY_DISCOVERY_REFRESH_S.
"""
from __future__ import annotations

import json
import logging
import threading
import time

from . import config, db, scoring
from .hlapi import HLClient

log = logging.getLogger("copytrade.discovery")

FILL_WINDOW_MS = 14 * scoring.DAY_MS


def analyze(hl: HLClient, address: str, screen: dict | None = None) -> dict:
    """Deep-score one wallet (~45 request weight) and store the result."""
    address = address.lower()
    portfolio = hl.portfolio(address)
    fills = hl.user_fills_by_time(address, int(time.time() * 1000) - FILL_WINDOW_MS)
    state = hl.clearinghouse_state(address, "mainnet")
    metrics = scoring.leader_metrics(portfolio, fills, state)
    score, reasons = scoring.copyability_score(metrics)
    payload = metrics.as_dict() | {"reasons": reasons}
    if screen:
        payload["name"] = screen.get("name")
        payload["leaderboard"] = {k: screen[k] for k in ("month_roi", "week_roi", "month_pnl", "all_time_pnl")}
    with db.connect() as c:
        c.execute(
            "INSERT INTO leaders (address, stage, score, metrics, updated_at) VALUES (?, 2, ?, ?, ?) "
            "ON CONFLICT(address) DO UPDATE SET stage = 2, score = excluded.score, "
            "metrics = excluded.metrics, updated_at = excluded.updated_at",
            (address, score, json.dumps(payload), db.now()),
        )
    return {"address": address, "score": score, "metrics": payload, "updated_at": db.now()}


def refresh(hl: HLClient, deep_n: int = config.DISCOVERY_DEEP_N) -> int:
    started = time.monotonic()
    rows = hl.leaderboard()
    screened = scoring.screen_leaderboard(rows)
    log.info("leaderboard: %d accounts, %d pass the screen; deep-scoring top %d", len(rows), len(screened), deep_n)
    db.kv_set("discovery", json.dumps({"accounts": len(rows), "screened": len(screened), "started_at": db.now()}))
    done = 0
    for row in screened[:deep_n]:
        try:
            analyze(hl, row["address"], row)
            done += 1
        except Exception:
            log.warning("deep score failed for %s", row["address"], exc_info=True)
    db.kv_set(
        "discovery",
        json.dumps({"accounts": len(rows), "screened": len(screened), "scored": done, "refreshed_at": db.now()}),
    )
    log.info("discovery refreshed: %d scored in %.0fs", done, time.monotonic() - started)
    return done


def status() -> dict:
    raw = db.kv_get("discovery")
    return json.loads(raw) if raw else {}


def ranked(limit: int = 50, offset: int = 0) -> list[dict]:
    with db.connect() as c:
        rows = c.execute(
            "SELECT address, score, metrics, updated_at FROM leaders WHERE stage = 2 "
            "ORDER BY score DESC LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
    return [_row(r) for r in rows]


def get(hl: HLClient, address: str, max_age_s: int = 3600) -> dict:
    """Stored score if fresh, otherwise analyze on demand - so any address can be looked up."""
    with db.connect() as c:
        r = c.execute("SELECT address, score, metrics, updated_at FROM leaders WHERE address = ?", (address,)).fetchone()
    if r and r["updated_at"] > db.now() - max_age_s:
        return _row(r)
    return analyze(hl, address)


def _row(r) -> dict:
    return {"address": r["address"], "score": r["score"], "metrics": json.loads(r["metrics"]), "updated_at": r["updated_at"]}


class DiscoveryThread(threading.Thread):
    def __init__(self, hl: HLClient):
        super().__init__(name="copytrade-discovery", daemon=True)
        self.hl = hl
        self.stop_event = threading.Event()

    def run(self) -> None:
        while not self.stop_event.is_set():
            last = status().get("refreshed_at", 0)
            if db.now() - last >= config.DISCOVERY_REFRESH_S:
                try:
                    refresh(self.hl)
                except Exception:
                    log.exception("discovery refresh failed")
            self.stop_event.wait(600)


if __name__ == "__main__":
    import argparse

    from .hlapi import client

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    p = argparse.ArgumentParser(description="Refresh leader discovery scores")
    p.add_argument("--deep", type=int, default=config.DISCOVERY_DEEP_N, help="how many wallets to deep-score")
    args = p.parse_args()
    db.init()
    refresh(client, args.deep)
    for item in ranked(15):
        m = item["metrics"]
        print(f"{item['score']:5.1f}  {item['address']}  " + " · ".join(m["reasons"]))
