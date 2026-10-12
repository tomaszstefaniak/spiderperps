"""Watch followed leaders and turn each of their moves into a proposal for every follower.

Every tick polls each followed leader's positions (clearinghouseState, weight 2), diffs them
against the last reported sizes and, for each move, sizes a copy for every follower on the
follower's own network. The first time a leader is seen we only record a baseline:
positions opened before you followed someone are not proposed.

Reductions only ever touch what the follower holds *from copying that leader* (the `copied`
ledger, updated when the phone reports a fill) - never positions they opened on their own.
Pushes are batched: one notification per follower and leader per tick.
"""
from __future__ import annotations

import json
import logging
import threading
import time
from dataclasses import dataclass

from . import config, db, push
from .hlapi import HLClient
from .positions import Move, Position, account_value, classify, diff, parse_positions
from .sizing import Settings, Sizing, size_move

log = logging.getLogger("copytrade.watcher")

MIN_MOVE = config.MIN_MOVE_PCT / 100

_VERBS = {"open": "opened", "increase": "added to", "decrease": "reduced", "close": "closed", "flip": "flipped"}
_NOTES = {
    "no_position": "You hold nothing copied from them in {coin}, so there's nothing to reduce.",
    "unavailable": "{coin} isn't tradable on {network}.",
    "no_equity": "Your {network} account has no margin to copy with.",
    "too_small": "Your copy rounds to zero. Raise your multiplier to follow this size.",
    "reverted": "They reversed it before you answered the previous alert.",
}


def short(addr: str) -> str:
    return f"{addr[:6]}…{addr[-4:]}"


@dataclass(frozen=True)
class Prefs:
    settings: Settings
    notify_info: bool


def prefs_for(address: str, network: str) -> Prefs:
    with db.connect() as c:
        row = c.execute("SELECT * FROM users WHERE address = ? AND network = ?", (address, network)).fetchone()
    if not row:
        return Prefs(Settings(), False)
    return Prefs(
        Settings(
            multiplier=row["multiplier"],
            max_usd=row["max_usd"],
            max_leverage=row["max_leverage"],
            sl_pct=row["sl_pct"],
            tp_pct=row["tp_pct"],
        ),
        bool(row["notify_info"]),
    )


def settings_for(address: str, network: str) -> Settings:
    return prefs_for(address, network).settings


def followers_by_leader() -> dict[str, list[tuple[str, str, str | None]]]:
    with db.connect() as c:
        rows = c.execute("SELECT follower, network, leader, label FROM follows").fetchall()
    out: dict[str, list[tuple[str, str, str | None]]] = {}
    for r in rows:
        out.setdefault(r["leader"], []).append((r["follower"], r["network"], r["label"]))
    return out


def load_reference(leader: str) -> dict[str, float] | None:
    with db.connect() as c:
        row = c.execute("SELECT positions FROM leader_snapshots WHERE leader = ?", (leader,)).fetchone()
    return json.loads(row["positions"])["ref"] if row else None


def save_snapshot(leader: str, ref: dict[str, float], positions: dict[str, Position], equity: float) -> None:
    payload = {
        "ref": ref,
        "positions": {c: {"szi": p.szi, "entryPx": p.entry_px, "leverage": p.leverage} for c, p in positions.items()},
    }
    with db.connect() as c:
        c.execute(
            "INSERT INTO leader_snapshots (leader, positions, account_value, updated_at) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(leader) DO UPDATE SET positions = excluded.positions, "
            "account_value = excluded.account_value, updated_at = excluded.updated_at",
            (leader, json.dumps(payload), equity, db.now()),
        )


def expire_stale() -> int:
    with db.connect() as c:
        cur = c.execute(
            "UPDATE proposals SET status = 'expired', updated_at = ? WHERE status = 'pending' AND expires_at < ?",
            (db.now(), db.now()),
        )
        return cur.rowcount


def copied_position(follower: str, network: str, leader: str, coin: str, actual_szi: float) -> float:
    """What the follower holds from copying `leader`, capped by what they actually still hold."""
    copied = db.copied_szi(follower, network, leader, coin)
    if copied == 0 or actual_szi == 0 or (copied > 0) != (actual_szi > 0):
        return 0.0
    return copied if abs(copied) <= abs(actual_szi) else actual_szi


class _TickCache:
    """Per-tick memo of follower states, mids and meta so N followers cost one call each."""

    def __init__(self, hl: HLClient):
        self.hl = hl
        self._states: dict[tuple[str, str], dict] = {}

    def state(self, address: str, network: str) -> dict:
        key = (address, network)
        if key not in self._states:
            try:
                self._states[key] = self.hl.clearinghouse_state(address, network)
            except Exception:
                log.warning("could not load %s state on %s", address, network)
                self._states[key] = {}
        return self._states[key]

    def szi(self, address: str, network: str, coin: str) -> float:
        p = parse_positions(self.state(address, network)).get(coin)
        return p.szi if p else 0.0

    def mids(self, network: str) -> dict[str, float]:
        return self.hl.all_mids(network)

    def meta(self, network: str) -> dict[str, dict]:
        return self.hl.perp_meta(network)


@dataclass
class Created:
    proposal_id: int
    follower: str
    network: str
    leader: str
    label: str | None
    coin: str
    actionable: bool
    title: str
    body: str


class Watcher:
    def __init__(self, hl: HLClient):
        self.hl = hl

    def tick(self) -> int:
        """One polling pass. Returns the number of proposals created."""
        expire_stale()
        follows = followers_by_leader()
        if not follows:
            return 0
        cache = _TickCache(self.hl)
        created: list[Created] = []
        for leader, followers in follows.items():
            try:
                state = self.hl.clearinghouse_state(leader, config.leader_network(leader))
            except Exception:
                log.warning("could not load leader %s", leader)
                continue
            positions = parse_positions(state)
            current = {c: p.szi for c, p in positions.items()}
            reference = load_reference(leader)
            if reference is None:
                save_snapshot(leader, current, positions, account_value(state))
                continue
            moves, new_ref = diff(reference, current, MIN_MOVE)
            save_snapshot(leader, new_ref, positions, account_value(state))
            for move in moves:
                log.info("leader %s %s %s %s -> %s", short(leader), move.event, move.coin, move.from_szi, move.to_szi)
                for follower, network, label in followers:
                    try:
                        created.append(self.propose(leader, label, state, positions, move, follower, network, cache))
                    except Exception:
                        log.exception("proposal for %s failed", follower)
        self.notify(created)
        return len(created)

    def propose(
        self,
        leader: str,
        label: str | None,
        leader_state: dict,
        leader_positions: dict[str, Position],
        move: Move,
        follower: str,
        network: str,
        cache: _TickCache,
    ) -> Created:
        coin = move.coin
        # If the follower hasn't answered an earlier proposal for this coin yet, replace it with
        # one for the combined move, measured from where the leader was before that proposal.
        with db.connect() as c:
            prev = c.execute(
                "SELECT id, leader_from FROM proposals WHERE follower = ? AND network = ? AND leader = ? "
                "AND coin = ? AND status = 'pending' ORDER BY id DESC LIMIT 1",
                (follower, network, leader, coin),
            ).fetchone()
            if prev:
                c.execute(
                    "UPDATE proposals SET status = 'superseded', updated_at = ? WHERE id = ?", (db.now(), prev["id"])
                )
        from_szi = prev["leader_from"] if prev else move.from_szi
        event = classify(from_szi, move.to_szi)
        settings = settings_for(follower, network)

        if event is None:
            sizing = Sizing(is_buy=move.delta > 0, size=0.0, reduce_only=False, leverage=None, notional=0.0, note="reverted")
            combined = move
        else:
            combined = Move(coin, event, from_szi, move.to_szi)
            meta = cache.meta(network).get(coin)
            tradable = meta is not None and not meta["isDelisted"]
            lp = leader_positions.get(coin)
            sizing = size_move(
                combined,
                leader_equity=account_value(leader_state),
                follower_equity=account_value(cache.state(follower, network)),
                follower_szi=copied_position(follower, network, leader, coin, cache.szi(follower, network, coin)),
                mark_px=cache.mids(network).get(coin) if tradable else None,
                sz_decimals=meta["szDecimals"] if meta else 0,
                coin_max_leverage=meta["maxLeverage"] if meta else 1,
                leader_leverage=lp.leverage if lp else None,
                settings=settings,
            )

        status = "pending" if sizing.size > 0 else "info"
        leader_px = self.hl.all_mids(config.leader_network(leader)).get(coin)
        ref_px = sizing.notional / sizing.size if sizing.size > 0 else None
        ts = db.now()
        with db.connect() as c:
            cur = c.execute(
                "INSERT INTO proposals (follower, network, leader, coin, event, is_buy, size, reduce_only, leverage, "
                "ref_px, notional, leader_from, leader_to, leader_px, sl_pct, tp_pct, note, status, created_at, "
                "expires_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    follower, network, leader, coin, combined.event, int(sizing.is_buy), sizing.size,
                    int(sizing.reduce_only), sizing.leverage, ref_px, sizing.notional, combined.from_szi,
                    combined.to_szi, leader_px,
                    None if sizing.reduce_only else settings.sl_pct,
                    None if sizing.reduce_only else settings.tp_pct,
                    sizing.note, status, ts, ts + config.PROPOSAL_TTL_S, ts,
                ),
            )
            proposal_id = cur.lastrowid

        title, body = describe(combined, sizing, leader, label, network, settings)
        return Created(proposal_id, follower, network, leader, label, coin, status == "pending", title, body)

    def notify(self, created: list[Created]) -> None:
        """Push new proposals, batched and rate-limited.

        One push per follower and leader per tick, at most one per PUSH_COOLDOWN_S (the rest
        wait in the in-app inbox), and alert-only moves only if the user opted in.
        """
        groups: dict[tuple[str, str, str], list[Created]] = {}
        for c in created:
            groups.setdefault((c.follower, c.network, c.leader), []).append(c)
        for (follower, network, leader), items in groups.items():
            if not any(i.actionable for i in items) and not prefs_for(follower, network).notify_info:
                continue
            tokens = push.tokens_for(follower, network)
            if not tokens or not _claim_push_slot(follower, network, leader):
                continue
            actionable = [i for i in items if i.actionable]
            if len(items) == 1:
                i = items[0]
                push.send(tokens, i.title, i.body, {"kind": "proposal", "proposalId": i.proposal_id},
                          category="proposal" if i.actionable else None)
            else:
                who = items[0].label or short(leader)
                coins = ", ".join(dict.fromkeys(i.coin for i in items))
                body = f"{len(actionable)} to review: {coins}" if actionable else coins
                push.send(tokens, f"{who} made {len(items)} moves", body, {"kind": "proposals", "leader": leader})


def _claim_push_slot(follower: str, network: str, leader: str) -> bool:
    """True (and records the push) unless this leader already pushed this follower within the cooldown."""
    now = db.now()
    with db.connect() as c:
        row = c.execute(
            "SELECT last_push_at FROM push_log WHERE follower = ? AND network = ? AND leader = ?",
            (follower, network, leader),
        ).fetchone()
        if row and now - row["last_push_at"] < config.PUSH_COOLDOWN_S:
            return False
        c.execute(
            "INSERT INTO push_log (follower, network, leader, last_push_at) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(follower, network, leader) DO UPDATE SET last_push_at = excluded.last_push_at",
            (follower, network, leader, now),
        )
    return True


def describe(move: Move, sizing: Sizing, leader: str, label: str | None, network: str, settings: Settings) -> tuple[str, str]:
    who = label or short(leader)
    if move.event == "flip":
        what = f"flipped {move.coin} to {'LONG' if move.to_szi > 0 else 'SHORT'}"
    else:
        side = "LONG" if (move.to_szi if move.event in ("open", "increase") else move.from_szi) > 0 else "SHORT"
        what = f"{_VERBS[move.event]} {move.coin} {side}"
    title = f"{who} {what}"
    if sizing.size <= 0:
        return title, _NOTES.get(sizing.note or "", "No copy proposed.").format(coin=move.coin, network=network)
    side = "BUY" if sizing.is_buy else "SELL"
    body = f"Copy: {side} {sizing.size:g} {move.coin} (~${sizing.notional:,.0f})"
    if sizing.note == "below_min":
        body += " — below Hyperliquid's $10 minimum, tap to adjust"
    elif not sizing.reduce_only and settings.sl_pct:
        body += f" · SL {settings.sl_pct:g}%"
    return title, body


class WatcherThread(threading.Thread):
    def __init__(self, hl: HLClient):
        super().__init__(name="copytrade-watcher", daemon=True)
        self.watcher = Watcher(hl)
        self.stop_event = threading.Event()

    def run(self) -> None:
        log.info("watcher started (every %ss)", config.WATCH_INTERVAL_S)
        while not self.stop_event.is_set():
            started = time.monotonic()
            try:
                n = self.watcher.tick()
                if n:
                    log.info("created %d proposal(s)", n)
            except Exception:
                log.exception("watcher tick failed")
            self.stop_event.wait(max(0.5, config.WATCH_INTERVAL_S - (time.monotonic() - started)))
