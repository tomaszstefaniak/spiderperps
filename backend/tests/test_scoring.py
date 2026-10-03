import pytest

from copytrade.scoring import (
    DAY_MS,
    LeaderMetrics,
    copyability_score,
    fill_stats,
    is_copyable_coin,
    positive_week_share,
    screen_leaderboard,
    time_weighted_return,
)


def series(*values, step=DAY_MS):
    return [[i * step, str(v)] for i, v in enumerate(values)]


def test_deposits_do_not_count_as_returns():
    # $10k account makes $1k (+10%), then deposits $90k (equity jumps, PnL doesn't), then makes $10.1k (+10%)
    av = series(10_000, 11_000, 101_000, 111_100)
    pnl = series(0, 1_000, 1_000, 11_100)
    ret, dd = time_weighted_return(pnl, av)
    assert ret == pytest.approx(1.1 * 1.1 - 1)  # 21%, not 1000%+ like a naive ROI
    assert dd == 0


def test_pre_deposit_intervals_are_skipped_and_drawdown_measured():
    av = series(0, 50_000, 40_000, 44_000)
    pnl = series(0, 0, -10_000, -6_000)
    ret, dd = time_weighted_return(pnl, av)
    assert ret == pytest.approx(0.8 * 1.1 - 1)
    assert dd == pytest.approx(0.2)


def test_positive_week_share():
    # daily cumulative PnL: week 1 up (0 -> 6), week 2 down (6 -> 1), last 2 days up (1 -> 2)
    pnl = series(*[0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 0, 2])
    assert positive_week_share(pnl) == pytest.approx(2 / 3)


def fill(t, coin, side, sz, start, closed=0.0, fee=0.0, px=100.0, d="Open Long"):
    return {"time": t, "coin": coin, "side": side, "sz": str(sz), "px": str(px), "startPosition": str(start),
            "closedPnl": str(closed), "fee": str(fee), "dir": d}


def test_fill_stats_round_trips_holds_and_wins():
    h = 3_600_000
    fills = [
        fill(0, "BTC", "B", 1, 0),                       # open long
        fill(1 * h, "BTC", "B", 1, 1),                   # add
        fill(5 * h, "BTC", "A", 2, 2, closed=50),        # close: +50, held 5h -> win
        fill(6 * h, "ETH", "A", 2, 2, closed=-10),       # ETH was open before the window: not a trip
        fill(7 * h, "SOL", "A", 1, 0),                   # open short
        fill(8 * h, "SOL", "B", 2, -1, closed=-5),       # flip short -> long: trip closes at a loss, held 1h
        fill(11 * h, "SOL", "A", 1, 1, closed=1, fee=2), # close long: 1 - 2 fee = loss, held 3h
        fill(12 * h, "xyz:AVGO", "B", 1, 0, px=200),     # HIP-3 market: not copyable
    ]
    s = fill_stats(fills)
    assert s.round_trips == 3
    assert s.win_rate == pytest.approx(1 / 3)
    assert s.median_hold_h == pytest.approx(3)
    total = 100 * (1 + 1 + 2 + 2 + 1 + 2 + 1) + 200
    assert s.copyable_share == pytest.approx((total - 200) / total)


def test_copyable_coins():
    assert is_copyable_coin("BTC") and is_copyable_coin("kPEPE") and is_copyable_coin("0G")
    assert not is_copyable_coin("xyz:AVGO") and not is_copyable_coin("@151") and not is_copyable_coin("PURR/USDC")


def metrics(**kw):
    base = dict(equity=100_000, month_return=0.2, month_max_dd=0.1, all_time_return=1.0, positive_weeks=0.75,
                round_trips_14d=20, win_rate=0.6, median_hold_h=6, copyable_share=1.0, top_coins=["BTC"],
                open_positions=2, leverage_now=3.0)
    return LeaderMetrics(**(base | kw))


def test_score_prefers_steady_slow_traders():
    good, reasons = copyability_score(metrics())
    scalper, _ = copyability_score(metrics(median_hold_h=0.05))
    reckless, _ = copyability_score(metrics(month_max_dd=0.45))
    loser, _ = copyability_score(metrics(month_return=-0.1))
    assert 0 <= loser < reckless < good <= 100 and scalper < good
    assert reasons[:3] == ["+20% 30d (deposit-adjusted)", "max drawdown 10%", "holds ~6h"]
    assert "win rate 60% (20 trades)" in reasons


def test_gates_sink_wallets_we_cannot_follow():
    good, _ = copyability_score(metrics())
    # trades mostly HIP-3/spot markets we can't copy, even with great returns
    uncopyable, reasons = copyability_score(metrics(month_return=1.5, copyable_share=0.19))
    assert uncopyable < good / 3 and "19% copyable markets" in reasons
    # huge drawdown can't be bought back with huge returns
    gambler, _ = copyability_score(metrics(month_return=2.0, month_max_dd=0.89))
    assert gambler < good
    # nothing closed recently: lower confidence, and no win rate from a tiny sample
    quiet, reasons = copyability_score(metrics(round_trips_14d=1, win_rate=1.0))
    assert quiet < good and "only 1 closed trade in 14d" in reasons
    assert not any(r.startswith("win rate") for r in reasons)
    # +1400% on a $6.5k account ranks below a steady $100k trader
    tiny, reasons = copyability_score(metrics(month_return=14.0, equity=6_500, round_trips_14d=3))
    assert tiny < good and "small account ($6.5k)" in reasons


def lb_row(addr, equity, month=(1000, 0.2, 50_000), week=(100, 0.02, 1), all_time=(5000, 1.0, 1)):
    w = lambda p, r, v: {"pnl": str(p), "roi": str(r), "vlm": str(v)}  # noqa: E731
    return {"ethAddress": addr, "accountValue": str(equity), "displayName": None,
            "windowPerformances": [["day", w(0, 0, 0)], ["week", w(*week)], ["month", w(*month)], ["allTime", w(*all_time)]]}


def test_screen_excludes_market_makers_small_and_unprofitable():
    rows = [
        lb_row("0xA", 100_000, month=(20_000, 0.2, 500_000)),          # keeps: 5x turnover
        lb_row("0xMM", 100_000, month=(20_000, 0.2, 50_000_000)),      # market maker: 500x turnover
        lb_row("0xSMALL", 5_000, month=(2_000, 0.4, 20_000)),          # too small
        lb_row("0xLOSS", 100_000, week=(-1, -0.01, 1)),                # losing week
    ]
    assert [r["address"] for r in screen_leaderboard(rows)] == ["0xa"]
