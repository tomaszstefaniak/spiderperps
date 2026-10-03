from copytrade.positions import classify, diff, parse_positions

from conftest import state


def test_classify():
    assert classify(0, 1) == "open"
    assert classify(1, 0) == "close"
    assert classify(1, 2) == "increase"
    assert classify(-2, -1) == "decrease"
    assert classify(1, -1) == "flip"
    assert classify(1, 1) is None


def test_parse_positions_skips_flat_and_reads_leverage():
    p = parse_positions(state({"BTC": (0.5, 20), "ETH": (0, 5)}))
    assert list(p) == ["BTC"]
    assert p["BTC"].szi == 0.5 and p["BTC"].leverage == 20


def test_diff_reports_open_close_flip():
    moves, ref = diff({"BTC": 1.0, "ETH": -2.0}, {"BTC": -1.0, "SOL": 10.0})
    assert {(m.coin, m.event) for m in moves} == {("BTC", "flip"), ("ETH", "close"), ("SOL", "open")}
    assert ref == {"BTC": -1.0, "SOL": 10.0}


def test_small_steps_accumulate_until_reported():
    ref = {"BTC": 1.0}
    for size in (1.005, 1.01, 1.015):  # each step < 2% of the reference
        moves, ref = diff(ref, {"BTC": size})
        assert moves == []
        assert ref == {"BTC": 1.0}  # reference holds the last *reported* size
    moves, ref = diff(ref, {"BTC": 1.03})
    assert [(m.event, m.from_szi, m.to_szi) for m in moves] == [("increase", 1.0, 1.03)]
    assert ref == {"BTC": 1.03}
