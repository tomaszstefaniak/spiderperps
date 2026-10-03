"""Size a follower's copy of one leader move. Pure functions.

Opens and increases are copied in proportion to the two accounts' equity (times the
follower's multiplier), capped at the follower's max notional per trade. Decreases and
closes mirror the *fraction* the leader took off, applied to what the follower holds on the
same side - so a follower who skipped the entry isn't asked to sell something they don't own.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_DOWN, Decimal

from .positions import Move

# Hyperliquid rejects new orders below $10 notional (reduce-only closes are exempt).
MIN_NOTIONAL_USD = 10.0


@dataclass(frozen=True)
class Settings:
    multiplier: float = 1.0
    max_usd: float = 500.0
    max_leverage: int = 10
    sl_pct: float | None = 5.0
    tp_pct: float | None = None


@dataclass(frozen=True)
class Sizing:
    is_buy: bool
    size: float  # base units rounded to the coin's szDecimals; 0 => alert only
    reduce_only: bool
    leverage: int | None
    notional: float
    note: str | None = None  # why it isn't actionable as proposed

    @property
    def actionable(self) -> bool:
        return self.size > 0 and self.note is None


def round_down(x: float, decimals: int) -> float:
    q = Decimal(1).scaleb(-decimals)
    return float(Decimal(str(abs(x))).quantize(q, rounding=ROUND_DOWN))


def size_move(
    move: Move,
    *,
    leader_equity: float,
    follower_equity: float,
    follower_szi: float,
    mark_px: float | None,
    sz_decimals: int,
    coin_max_leverage: int,
    leader_leverage: int | None,
    settings: Settings,
) -> Sizing:
    def alert(note: str, is_buy: bool = move.delta > 0, reduce_only: bool = False) -> Sizing:
        return Sizing(is_buy=is_buy, size=0.0, reduce_only=reduce_only, leverage=None, notional=0.0, note=note)

    if not mark_px or mark_px <= 0:
        return alert("unavailable")  # coin isn't listed on the follower's network

    leverage = max(1, min(leader_leverage or settings.max_leverage, settings.max_leverage, coin_max_leverage))
    ratio = (follower_equity / leader_equity) * settings.multiplier if leader_equity > 0 else 0.0
    same_side = follower_szi != 0 and (follower_szi > 0) == (move.from_szi > 0)

    def capped(raw: float) -> float:
        notional = abs(raw) * mark_px
        if settings.max_usd > 0 and notional > settings.max_usd:
            raw *= settings.max_usd / notional
        return raw

    if move.event in ("open", "increase"):
        if ratio <= 0:
            return alert("no_equity")
        raw = capped(move.delta * ratio)
        size, is_buy, reduce_only = round_down(raw, sz_decimals), raw > 0, False
    elif move.event in ("decrease", "close"):
        if not same_side:
            return alert("no_position", is_buy=move.delta > 0, reduce_only=True)
        frac = 1.0 if move.event == "close" else (abs(move.from_szi) - abs(move.to_szi)) / abs(move.from_szi)
        size, is_buy, reduce_only = round_down(abs(follower_szi) * frac, sz_decimals), follower_szi < 0, True
        leverage = None
    elif move.event == "flip":
        close_part = abs(follower_szi) if same_side else 0.0
        open_part = abs(capped(move.to_szi * ratio)) if ratio > 0 else 0.0
        size, is_buy, reduce_only = round_down(close_part + open_part, sz_decimals), move.to_szi > 0, False
    else:
        raise ValueError(f"unknown event {move.event}")

    if size <= 0:
        return alert("too_small", is_buy=is_buy, reduce_only=reduce_only)
    notional = size * mark_px
    note = "below_min" if not reduce_only and notional < MIN_NOTIONAL_USD else None
    return Sizing(is_buy=is_buy, size=size, reduce_only=reduce_only, leverage=leverage, notional=notional, note=note)
