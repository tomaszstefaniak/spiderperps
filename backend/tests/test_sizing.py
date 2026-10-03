import pytest

from copytrade.positions import Move
from copytrade.sizing import Settings, round_down, size_move

BTC = dict(mark_px=100_000.0, sz_decimals=5, coin_max_leverage=40)


def size(move, follower_szi=0.0, leader_equity=1_000_000.0, follower_equity=10_000.0, leader_leverage=10, **settings):
    return size_move(
        move,
        leader_equity=leader_equity,
        follower_equity=follower_equity,
        follower_szi=follower_szi,
        leader_leverage=leader_leverage,
        settings=Settings(**settings),
        **BTC,
    )


def test_open_is_proportional_to_equity():
    # leader buys 2 BTC with $1M equity; follower has $10k -> 1% -> 0.02 BTC ($2,000)
    s = size(Move("BTC", "open", 0, 2), max_usd=1e9)
    assert (s.is_buy, s.size, s.reduce_only, s.note) == (True, 0.02, False, None)
    assert s.notional == pytest.approx(2_000)
    assert s.leverage == 10


def test_open_is_capped_at_max_usd_and_multiplied():
    s = size(Move("BTC", "open", 0, 2), multiplier=2, max_usd=500)
    assert s.size == 0.005 and s.notional == pytest.approx(500)


def test_short_open_sells():
    s = size(Move("BTC", "open", 0, -2), max_usd=1e9)
    assert (s.is_buy, s.size) == (False, 0.02)


def test_leverage_is_capped_by_settings_and_coin():
    assert size(Move("BTC", "open", 0, 2), leader_leverage=50, max_leverage=10).leverage == 10
    assert size(Move("BTC", "open", 0, 2), leader_leverage=None, max_leverage=7).leverage == 7


def test_decrease_mirrors_fraction_of_followers_position():
    # leader cuts 4 -> 1 BTC (75% off); follower holds 0.04 -> sell 0.03, reduce-only
    s = size(Move("BTC", "decrease", 4, 1), follower_szi=0.04)
    assert (s.is_buy, s.size, s.reduce_only, s.leverage) == (False, 0.03, True, None)


def test_close_closes_everything_follower_holds_on_that_side():
    s = size(Move("BTC", "close", -3, 0), follower_szi=-0.012)
    assert (s.is_buy, s.size, s.reduce_only) == (True, 0.012, True)


def test_close_without_matching_position_is_alert_only():
    s = size(Move("BTC", "close", 3, 0), follower_szi=0.0)
    assert (s.size, s.note, s.actionable) == (0.0, "no_position", False)
    # holding the opposite side doesn't count either
    assert size(Move("BTC", "close", 3, 0), follower_szi=-0.01).note == "no_position"


def test_flip_closes_old_side_and_opens_new():
    # follower long 0.02; leader flips 2 -> -1 BTC; new side at 1% = 0.01 -> sell 0.03
    s = size(Move("BTC", "flip", 2, -1), follower_szi=0.02, max_usd=1e9)
    assert (s.is_buy, s.size, s.reduce_only) == (False, 0.03, False)


def test_tiny_copies_are_flagged():
    s = size(Move("BTC", "open", 0, 0.5), follower_equity=1_000.0, max_usd=1e9)  # $500 notional * 0.1% = $50
    assert s.note is None
    s = size(Move("BTC", "open", 0, 0.05), follower_equity=1_000.0, max_usd=1e9)  # $5 -> below $10 minimum
    assert s.note == "below_min" and s.size == 0.00005
    s = size(Move("BTC", "open", 0, 0.001), follower_equity=1_000.0)  # rounds to 0 at 5 decimals
    assert (s.size, s.note) == (0.0, "too_small")


def test_unavailable_market_and_empty_account_are_alerts():
    s = size_move(Move("XYZ", "open", 0, 1), leader_equity=1, follower_equity=1, follower_szi=0, mark_px=None,
                  sz_decimals=0, coin_max_leverage=1, leader_leverage=1, settings=Settings())
    assert s.note == "unavailable"
    assert size(Move("BTC", "open", 0, 2), follower_equity=0).note == "no_equity"


def test_round_down_never_rounds_up():
    assert round_down(0.123459, 5) == 0.12345
    assert round_down(-0.123459, 5) == 0.12345
    assert round_down(1.0, 0) == 1.0
