import pytest

from copytrade import db, push
from copytrade.watcher import Watcher, expire_stale

from conftest import state

LEADER = "0x" + "1" * 40
FOLLOWER = "0x" + "2" * 40


@pytest.fixture
def setup(fresh_db, hl, monkeypatch):
    sent = []
    monkeypatch.setattr(push, "send", lambda tokens, title, body, data, category=None: sent.append(
        {"tokens": tokens, "title": title, "body": body, "data": data, "category": category}))
    with db.connect() as c:
        c.execute("INSERT INTO users (address, network, max_usd, created_at) VALUES (?, 'testnet', 100000, 0)", (FOLLOWER,))
        c.execute("INSERT INTO follows (follower, network, leader, created_at) VALUES (?, 'testnet', ?, 0)", (FOLLOWER, LEADER))
        c.execute("INSERT INTO devices (push_token, address, network, created_at) VALUES ('ExponentPushToken[x]', ?, 'testnet', 0)",
                  (FOLLOWER,))
    hl.states[(LEADER, "mainnet")] = state({"BTC": (1.0, 20)}, equity=1_000_000)
    hl.states[(FOLLOWER, "testnet")] = state(equity=10_000)
    return Watcher(hl), sent


def leader_holds(hl, positions):
    hl.states[(LEADER, "mainnet")] = state(positions, equity=1_000_000)


def follower_holds(hl, positions):
    hl.states[(FOLLOWER, "testnet")] = state(positions, equity=10_000)


def proposals():
    with db.connect() as c:
        return [dict(r) for r in c.execute("SELECT * FROM proposals ORDER BY id")]


def test_full_copy_cycle(setup, hl):
    w, sent = setup
    assert w.tick() == 0, "positions held before following are only a baseline"

    leader_holds(hl, {"BTC": (1.0, 20), "ETH": (10.0, 5)})
    assert w.tick() == 1
    p = proposals()[-1]
    # 1% of the leader's equity -> 0.1 ETH (~$400) at the leader's 5x, with the default 5% stop-loss
    assert (p["coin"], p["event"], p["is_buy"], p["size"], p["reduce_only"], p["leverage"], p["sl_pct"], p["status"]) == \
        ("ETH", "open", 1, 0.1, 0, 5, 5.0, "pending")
    assert p["notional"] == pytest.approx(400)
    assert sent[-1]["title"] == "0x1111…1111 opened ETH LONG"
    assert sent[-1]["body"].startswith("Copy: BUY 0.1 ETH (~$400)") and "SL 5%" in sent[-1]["body"]
    assert sent[-1]["category"] == "proposal" and sent[-1]["tokens"] == ["ExponentPushToken[x]"]

    # the leader adds before we answered: one combined proposal 0 -> 15 replaces the first
    leader_holds(hl, {"BTC": (1.0, 20), "ETH": (15.0, 5)})
    assert w.tick() == 1
    first, second = proposals()[-2:]
    assert first["status"] == "superseded"
    assert (second["event"], second["leader_from"], second["leader_to"], second["size"]) == ("open", 0.0, 15.0, 0.15)

    # we approve and get filled (what POST /v1/proposals/{id}/decision does)
    with db.connect() as c:
        c.execute("UPDATE proposals SET status = 'approved' WHERE id = ?", (second["id"],))
    db.record_fill(FOLLOWER, "testnet", LEADER, "ETH", 0.15, reduce_only=False)
    follower_holds(hl, {"ETH": (0.15, 5)})
    leader_holds(hl, {"BTC": (1.0, 20)})
    assert w.tick() == 1
    p = proposals()[-1]
    assert (p["event"], p["is_buy"], p["size"], p["reduce_only"], p["sl_pct"], p["status"]) == ("close", 0, 0.15, 1, None, "pending")

    # the leader closes BTC, which we never copied: an alert in the feed, but no push by default
    pushes_before = len(sent)
    leader_holds(hl, {})
    assert w.tick() == 1
    p = proposals()[-1]
    assert (p["coin"], p["event"], p["status"], p["note"], p["size"]) == ("BTC", "close", "info", "no_position", 0.0)
    assert len(sent) == pushes_before


def test_alert_only_moves_are_pushed_when_opted_in(setup, hl):
    w, sent = setup
    with db.connect() as c:
        c.execute("UPDATE users SET notify_info = 1")
    w.tick()
    leader_holds(hl, {})
    w.tick()
    assert sent[-1]["title"] == "0x1111…1111 closed BTC LONG" and sent[-1]["category"] is None
    assert "nothing copied from them" in sent[-1]["body"]


def test_never_touches_positions_the_follower_opened_themselves(setup, hl):
    w, _ = setup
    follower_holds(hl, {"BTC": (5.0, 3)})  # the follower's own BTC, not from copying
    w.tick()
    leader_holds(hl, {"BTC": (0.5, 20)})   # leader cuts BTC by half
    w.tick()
    p = proposals()[-1]
    assert (p["event"], p["status"], p["note"], p["size"]) == ("decrease", "info", "no_position", 0.0)


def test_reductions_are_capped_by_what_is_still_held(setup, hl):
    w, _ = setup
    db.record_fill(FOLLOWER, "testnet", LEADER, "BTC", 0.04, reduce_only=False)  # copied 0.04 BTC earlier
    follower_holds(hl, {"BTC": (0.01, 20)})  # ...but the follower closed most of it by hand since
    w.tick()
    leader_holds(hl, {})
    w.tick()
    p = proposals()[-1]
    assert (p["event"], p["size"], p["reduce_only"]) == ("close", 0.01, 1)


def test_copy_ledger(fresh_db):
    assert db.record_fill(FOLLOWER, "testnet", LEADER, "ETH", 0.3, reduce_only=False) == 0.3
    assert db.record_fill(FOLLOWER, "testnet", LEADER, "ETH", -0.1, reduce_only=True) == pytest.approx(0.2)
    assert db.record_fill(FOLLOWER, "testnet", LEADER, "ETH", -0.5, reduce_only=True) == 0.0  # clamps, never flips
    assert db.copied_szi(FOLLOWER, "testnet", LEADER, "ETH") == 0.0
    # a flip copy (not reduce-only) does move the ledger to the other side
    db.record_fill(FOLLOWER, "testnet", LEADER, "SOL", 2.0, reduce_only=False)
    assert db.record_fill(FOLLOWER, "testnet", LEADER, "SOL", -3.0, reduce_only=False) == -1.0


def test_several_moves_in_one_tick_send_one_push(setup, hl):
    w, sent = setup
    w.tick()
    pushes_before = len(sent)
    leader_holds(hl, {"BTC": (2.0, 20), "ETH": (10.0, 5)})  # adds to BTC and opens ETH at once
    assert w.tick() == 2
    assert len(sent) == pushes_before + 1
    assert sent[-1]["title"] == "0x1111…1111 made 2 moves" and sent[-1]["body"] == "2 to review: BTC, ETH"


def test_push_cooldown_per_leader(setup, hl):
    w, sent = setup
    w.tick()
    pushes_before = len(sent)
    leader_holds(hl, {"BTC": (1.0, 20), "ETH": (10.0, 5)})
    w.tick()
    leader_holds(hl, {"BTC": (1.0, 20), "ETH": (10.0, 5), "SOL": (100.0, 5)})
    hl.meta["testnet"]["SOL"] = {"szDecimals": 2, "maxLeverage": 20, "isDelisted": False}
    hl.mids["testnet"]["SOL"] = 200.0
    w.tick()
    assert len(sent) == pushes_before + 1, "second move within the cooldown waits in the inbox"
    assert [p["status"] for p in proposals()[-2:]] == ["pending", "pending"]
    with db.connect() as c:
        c.execute("UPDATE push_log SET last_push_at = last_push_at - 3600")
    leader_holds(hl, {"BTC": (1.0, 20), "ETH": (20.0, 5), "SOL": (100.0, 5)})
    w.tick()
    assert len(sent) == pushes_before + 2


def test_round_trip_before_answer_becomes_an_alert(setup, hl):
    w, _ = setup
    w.tick()
    leader_holds(hl, {"BTC": (1.0, 20), "ETH": (10.0, 5)})
    w.tick()
    leader_holds(hl, {"BTC": (1.0, 20)})
    w.tick()
    opened, closed = proposals()[-2:]
    assert opened["status"] == "superseded"
    assert (closed["status"], closed["note"]) == ("info", "reverted")


def test_small_size_changes_are_ignored(setup, hl):
    w, _ = setup
    w.tick()
    leader_holds(hl, {"BTC": (1.04, 20)})  # +4%: under the 5% threshold
    assert w.tick() == 0


def test_unlisted_coin_on_follower_network(setup, hl):
    w, _ = setup
    w.tick()
    hl.meta["mainnet"]["kPEPE"] = {"szDecimals": 0, "maxLeverage": 10, "isDelisted": False}
    leader_holds(hl, {"BTC": (1.0, 20), "kPEPE": (1_000_000.0, 3)})
    w.tick()
    p = proposals()[-1]
    assert (p["coin"], p["status"], p["note"]) == ("kPEPE", "info", "unavailable")


def test_stale_proposals_expire(setup, hl):
    w, _ = setup
    w.tick()
    leader_holds(hl, {"BTC": (1.0, 20), "ETH": (10.0, 5)})
    w.tick()
    with db.connect() as c:
        c.execute("UPDATE proposals SET expires_at = 0")
    assert expire_stale() == 1
    assert proposals()[-1]["status"] == "expired"
