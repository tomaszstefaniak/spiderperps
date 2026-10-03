"""Copyability scoring for leader wallets. Pure functions over Hyperliquid data.

Why not just rank the leaderboard by ROI: Hyperliquid's leaderboard ROI is measured against
the equity at the start of the window, so a wallet that deposits into a near-empty account
shows absurd returns, and the top PnL rows are mostly market makers nobody can copy. Here
returns are time-weighted from the portfolio PnL history (which excludes deposits and
withdrawals), and wallets are also scored on whether a human approving each trade on a
phone can realistically follow them.
"""
from __future__ import annotations

import math
import statistics
from dataclasses import asdict, dataclass

EPS = 1e-9
DAY_MS = 86_400_000


# ---------------------------------------------------------------- stage 1: leaderboard screen

def _windows(row: dict) -> dict[str, dict[str, float]]:
    return {name: {k: float(v[k]) for k in ("pnl", "roi", "vlm")} for name, v in row["windowPerformances"]}


def screen_leaderboard(rows: list[dict], *, min_equity: float = 25_000) -> list[dict]:
    """Cheap first pass over the full leaderboard (~50k rows).

    Keeps accounts with real equity, positive PnL over week/month/all-time, a plausible
    monthly ROI, and turnover typical of a discretionary trader - market makers turn over
    their equity hundreds of times a month and idle wallets barely trade.
    """
    out = []
    for r in rows:
        equity = float(r["accountValue"])
        if equity < min_equity:
            continue
        w = _windows(r)
        week, month, all_time = w["week"], w["month"], w["allTime"]
        if not (week["pnl"] > 0 and month["pnl"] > 0 and all_time["pnl"] > 0):
            continue
        if not (0.05 <= month["roi"] <= 5):
            continue
        turnover = month["vlm"] / equity
        if not (1 <= turnover <= 60):
            continue
        out.append({
            "address": r["ethAddress"].lower(),
            "name": r.get("displayName"),
            "equity": equity,
            "month_pnl": month["pnl"],
            "month_roi": month["roi"],
            "week_roi": week["roi"],
            "all_time_pnl": all_time["pnl"],
            "month_turnover": turnover,
            # Rank for deep scoring: profitable relative to size, damped so ROI artefacts
            # from deposits don't dominate.
            "screen_score": min(month["roi"], 1.0) * math.log10(equity),
        })
    out.sort(key=lambda x: x["screen_score"], reverse=True)
    return out


# ---------------------------------------------------------------- stage 2: deep metrics

def time_weighted_return(pnl_hist: list, av_hist: list, *, min_base: float = 1_000) -> tuple[float, float]:
    """(time-weighted return, max drawdown) from portfolio history series.

    Each interval's return is its PnL change over the equity at the start of the interval,
    so deposits/withdrawals (which move equity but not PnL) don't count as performance.
    Intervals starting below `min_base` equity are skipped - they're pre-deposit noise.
    """
    growth, peak, max_dd = 1.0, 1.0, 0.0
    for i in range(1, min(len(pnl_hist), len(av_hist))):
        base = float(av_hist[i - 1][1])
        if base < min_base:
            continue
        r = (float(pnl_hist[i][1]) - float(pnl_hist[i - 1][1])) / base
        growth *= max(1.0 + r, 0.0)
        peak = max(peak, growth)
        if peak > 0:
            max_dd = max(max_dd, 1.0 - growth / peak)
    return growth - 1.0, max_dd


def positive_week_share(pnl_hist: list) -> float | None:
    """Share of 7-day buckets in the series that made money."""
    if len(pnl_hist) < 2:
        return None
    start = pnl_hist[0][0]
    buckets: dict[int, list[float]] = {}
    for t, v in pnl_hist:
        buckets.setdefault((t - start) // (7 * DAY_MS), []).append(float(v))
    keys = sorted(buckets)
    results = []
    prev_close = float(pnl_hist[0][1])
    for k in keys:
        close = buckets[k][-1]
        results.append(close - prev_close)
        prev_close = close
    results = [r for r in results if abs(r) > EPS]
    return sum(r > 0 for r in results) / len(results) if results else None


def is_copyable_coin(coin: str) -> bool:
    """Main-dex perps only: HIP-3 markets look like 'xyz:AVGO', spot like '@151' or 'PURR/USDC'."""
    return ":" not in coin and not coin.startswith("@") and "/" not in coin


@dataclass
class FillStats:
    round_trips: int
    win_rate: float | None
    median_hold_h: float | None
    copyable_share: float | None
    top_coins: list[str]


def fill_stats(fills: list[dict]) -> FillStats:
    """Round trips reconstructed from fills (each fill carries the position size before it)."""
    fills = sorted(fills, key=lambda f: f["time"])
    open_since: dict[str, int] = {}
    trip_pnl: dict[str, float] = {}
    holds_ms: list[int] = []
    wins = trips = 0
    notional_all = notional_copyable = 0.0
    coin_notional: dict[str, float] = {}

    for f in fills:
        coin = f["coin"]
        sz, px = float(f["sz"]), float(f["px"])
        notional = sz * px
        notional_all += notional
        coin_notional[coin] = coin_notional.get(coin, 0.0) + notional
        if is_copyable_coin(coin):
            notional_copyable += notional
        if f.get("dir") in ("Buy", "Sell"):  # spot fills have no position lifecycle
            continue
        start = float(f["startPosition"])
        signed = sz if f["side"] == "B" else -sz
        end = start + signed
        trip_pnl[coin] = trip_pnl.get(coin, 0.0) + float(f.get("closedPnl") or 0) - float(f.get("fee") or 0)
        flat_before, flat_after = abs(start) < EPS, abs(end) < EPS
        flipped = not flat_before and not flat_after and (start > 0) != (end > 0)
        if flat_before and not flat_after:
            open_since[coin] = f["time"]
            trip_pnl[coin] = -float(f.get("fee") or 0)
        elif flat_after or flipped:
            if coin in open_since:  # only trips that started inside the window
                holds_ms.append(f["time"] - open_since[coin])
                trips += 1
                wins += trip_pnl[coin] > 0
            open_since.pop(coin, None)
            trip_pnl[coin] = 0.0
            if flipped:
                open_since[coin] = f["time"]

    top = sorted(coin_notional, key=coin_notional.get, reverse=True)[:5]
    return FillStats(
        round_trips=trips,
        win_rate=wins / trips if trips else None,
        median_hold_h=statistics.median(holds_ms) / 3_600_000 if holds_ms else None,
        copyable_share=notional_copyable / notional_all if notional_all > 0 else None,
        top_coins=top,
    )


@dataclass
class LeaderMetrics:
    equity: float
    month_return: float
    month_max_dd: float
    all_time_return: float
    positive_weeks: float | None
    round_trips_14d: int
    win_rate: float | None
    median_hold_h: float | None
    copyable_share: float | None
    top_coins: list[str]
    open_positions: int
    leverage_now: float

    def as_dict(self) -> dict:
        return asdict(self)


def leader_metrics(portfolio: dict, fills: list[dict], state: dict) -> LeaderMetrics:
    month = portfolio.get("perpMonth") or portfolio.get("month") or {}
    all_time = portfolio.get("perpAllTime") or portfolio.get("allTime") or {}
    m_ret, m_dd = time_weighted_return(month.get("pnlHistory", []), month.get("accountValueHistory", []))
    a_ret, _ = time_weighted_return(all_time.get("pnlHistory", []), all_time.get("accountValueHistory", []))
    fs = fill_stats(fills)
    margin = (state or {}).get("marginSummary") or {}
    equity = float(margin.get("accountValue") or 0)
    ntl = float(margin.get("totalNtlPos") or 0)
    return LeaderMetrics(
        equity=equity,
        month_return=m_ret,
        month_max_dd=m_dd,
        all_time_return=a_ret,
        positive_weeks=positive_week_share(month.get("pnlHistory", [])),
        round_trips_14d=fs.round_trips,
        win_rate=fs.win_rate,
        median_hold_h=fs.median_hold_h,
        copyable_share=fs.copyable_share,
        top_coins=fs.top_coins,
        open_positions=len((state or {}).get("assetPositions") or []),
        leverage_now=ntl / equity if equity > 0 else 0.0,
    )


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


MIN_TRIPS_FOR_WIN_RATE = 5


def copyability_score(m: LeaderMetrics) -> tuple[float, list[str]]:
    """0-100 score plus short human-readable reasons.

    Quality (weights): return 25%, return/drawdown 20%, drawdown 20%, positive weeks 15%,
    holding time 20%. Holding time matters because every copy waits for a human to approve
    it - scalpers who are in and out within minutes can't be followed that way.

    Then multiplied by gates that make a wallet un-followable regardless of how good it
    looks: the share of its volume in markets we can copy (main-dex perps), a drawdown
    penalty past 30% (nobody keeps approving copies through an 80% drawdown), and how much
    recent trading we've actually seen (few round trips = low confidence).
    """
    ret, dd = m.month_return, m.month_max_dd
    s_ret = _clamp(math.log1p(max(ret, -0.99)) / math.log1p(1.0))  # +100%/month saturates
    s_calmar = _clamp((ret / max(dd, 0.05)) / 5.0) if ret > 0 else 0.0  # 5:1 return/drawdown saturates
    s_risk = 1.0 - _clamp(dd / 0.5)  # 50%+ drawdown scores 0
    s_cons = m.positive_weeks if m.positive_weeks is not None else 0.5
    s_hold = 0.5 if m.median_hold_h is None else _clamp(m.median_hold_h / 4.0)  # >= 4h is easy to follow
    quality = 0.25 * s_ret + 0.20 * s_calmar + 0.20 * s_risk + 0.15 * s_cons + 0.20 * s_hold

    copyable = m.copyable_share if m.copyable_share is not None else 0.7
    drawdown_gate = 1.0 - 0.7 * _clamp((dd - 0.3) / 0.5)  # 1.0 up to 30% drawdown, 0.3 at 80%+
    confidence = _clamp(0.6 + 0.04 * m.round_trips_14d)  # 10+ round trips in 14 days -> full confidence
    score = 100 * quality * copyable * drawdown_gate * confidence
    if ret <= 0:
        score *= 0.5

    reasons = [f"{ret:+.0%} 30d (deposit-adjusted)", f"max drawdown {dd:.0%}"]
    if m.median_hold_h is not None:
        hold = f"{m.median_hold_h:.0f}h" if m.median_hold_h >= 1 else f"{m.median_hold_h * 60:.0f}m"
        reasons.append(f"holds ~{hold}")
    if m.win_rate is not None and m.round_trips_14d >= MIN_TRIPS_FOR_WIN_RATE:
        reasons.append(f"win rate {m.win_rate:.0%} ({m.round_trips_14d} trades)")
    elif m.round_trips_14d == 0:
        reasons.append("no closed trades in 14d")
    else:
        reasons.append(f"only {m.round_trips_14d} closed trade{'s' if m.round_trips_14d > 1 else ''} in 14d")
    if m.copyable_share is not None and m.copyable_share < 0.95:
        reasons.append(f"{m.copyable_share:.0%} copyable markets")
    return round(score, 1), reasons
