"""Leader position snapshots and the moves between them. Pure functions."""
from __future__ import annotations

from dataclasses import dataclass

EPS = 1e-12


@dataclass(frozen=True)
class Position:
    coin: str
    szi: float  # signed size: > 0 long, < 0 short
    entry_px: float
    leverage: int | None


def parse_positions(state: dict) -> dict[str, Position]:
    """Open positions from a clearinghouseState response, keyed by coin."""
    out: dict[str, Position] = {}
    for ap in (state or {}).get("assetPositions") or []:
        p = ap.get("position") or {}
        coin = p.get("coin")
        szi = float(p.get("szi") or 0)
        if not coin or abs(szi) < EPS:
            continue
        lev = (p.get("leverage") or {}).get("value")
        out[coin] = Position(coin, szi, float(p.get("entryPx") or 0), int(lev) if lev else None)
    return out


def account_value(state: dict) -> float:
    return float(((state or {}).get("marginSummary") or {}).get("accountValue") or 0)


def classify(from_szi: float, to_szi: float) -> str | None:
    if abs(to_szi - from_szi) < EPS:
        return None
    if abs(from_szi) < EPS:
        return "open"
    if abs(to_szi) < EPS:
        return "close"
    if (from_szi > 0) != (to_szi > 0):
        return "flip"
    return "increase" if abs(to_szi) > abs(from_szi) else "decrease"


@dataclass(frozen=True)
class Move:
    coin: str
    event: str  # open | increase | decrease | close | flip
    from_szi: float
    to_szi: float

    @property
    def delta(self) -> float:
        return self.to_szi - self.from_szi


def diff(
    reference: dict[str, float], current: dict[str, float], min_rel_change: float = 0.02
) -> tuple[list[Move], dict[str, float]]:
    """Moves between the last reported sizes and the current ones.

    Size changes under `min_rel_change` (partial fills, small rebalances) are not reported,
    and the reference keeps the old size for those coins so that many small steps still add
    up to a reported move once they cross the threshold.

    Returns (moves, new_reference).
    """
    moves: list[Move] = []
    new_ref = dict(reference)
    for coin in sorted(set(reference) | set(current)):
        f, t = reference.get(coin, 0.0), current.get(coin, 0.0)
        event = classify(f, t)
        if event is None:
            continue
        if event in ("increase", "decrease") and abs(t - f) < min_rel_change * max(abs(f), abs(t)):
            continue
        moves.append(Move(coin, event, f, t))
        if abs(t) < EPS:
            new_ref.pop(coin, None)
        else:
            new_ref[coin] = t
    return moves, new_ref
