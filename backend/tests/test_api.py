import time

import pytest
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi import FastAPI
from fastapi.testclient import TestClient

from copytrade import api, db


@pytest.fixture
def client(fresh_db, hl, monkeypatch):
    monkeypatch.setattr(api, "hl", hl)
    app = FastAPI()
    app.include_router(api.router)
    return TestClient(app)


def sign_in(client, account, address=None, network="testnet"):
    ch = client.post("/v1/auth/challenge", json={"address": address or account.address, "network": network}).json()
    sig = Account.sign_message(encode_defunct(text=ch["message"]), private_key=account.key).signature.to_0x_hex()
    r = client.post("/v1/auth/verify", json={"nonce": ch["nonce"], "signature": sig})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_requires_session(client):
    assert client.get("/v1/me").status_code == 401
    assert client.get("/v1/me", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_settings_follows_and_proposals(client):
    wallet = Account.create()
    h = sign_in(client, wallet)
    me = client.get("/v1/me", headers=h).json()
    assert me["settings"] == {"multiplier": 1.0, "max_usd": 500.0, "max_leverage": 10, "sl_pct": 5.0, "tp_pct": None,
                              "notify_info": False}

    s = client.put("/v1/me/settings", json={"sl_pct": 0, "tp_pct": 12, "multiplier": 2, "notify_info": True}, headers=h).json()
    assert (s["sl_pct"], s["tp_pct"], s["multiplier"], s["notify_info"]) == (None, 12.0, 2.0, True)
    assert client.put("/v1/me/settings", json={"multiplier": 50}, headers=h).status_code == 422

    leader = "0x" + "a" * 40
    assert client.post("/v1/follows", json={"leader": leader, "label": "whale"}, headers=h).status_code == 200
    assert client.post("/v1/follows", json={"leader": wallet.address}, headers=h).status_code == 400
    assert [f["leader"] for f in client.get("/v1/follows", headers=h).json()["follows"]] == [leader]

    me_addr = wallet.address.lower()
    with db.connect() as c:
        c.execute(
            "INSERT INTO proposals (follower, network, leader, coin, event, is_buy, size, reduce_only, leader_from, "
            "leader_to, status, created_at, expires_at, updated_at) VALUES (?, 'testnet', ?, 'ETH', 'open', 1, 0.1, 0, "
            "0, 10, 'pending', ?, ?, ?)",
            (me_addr, leader, db.now(), db.now() + 600, db.now()),
        )
    pending = client.get("/v1/proposals?status=pending", headers=h).json()["proposals"]
    assert len(pending) == 1 and pending[0]["is_buy"] is True
    pid = pending[0]["id"]

    # only 0.08 of the proposed 0.1 filled: the copy ledger records what really happened
    r = client.post(f"/v1/proposals/{pid}/decision",
                    json={"decision": "approved", "filled_size": 0.08, "result": {"oid": 1}}, headers=h).json()
    assert (r["status"], r["copied_szi"]) == ("approved", 0.08)
    assert client.post(f"/v1/proposals/{pid}/decision", json={"decision": "rejected"}, headers=h).status_code == 409
    assert client.get(f"/v1/proposals/{pid}", headers=h).json()["result"] == {"oid": 1, "filled_size": 0.08}
    assert client.get("/v1/follows", headers=h).json()["follows"][0]["copied"] == {"ETH": 0.08}

    # someone else can't see or decide it
    other = sign_in(client, Account.create())
    assert client.get(f"/v1/proposals/{pid}", headers=other).status_code == 404

    client.delete(f"/v1/follows/{leader}", headers=h)
    assert client.get("/v1/follows", headers=h).json()["follows"] == []


def test_phone_link_flow(client, hl):
    master, agent = Account.create(), Account.create()
    body = {"agent": agent.address, "address": master.address, "network": "testnet"}
    assert client.post("/v1/links", json=body).status_code == 409  # not approved on Hyperliquid yet
    assert client.get(f"/v1/links/{agent.address}?network=testnet").status_code == 404

    far = int(time.time() * 1000) + 86_400_000
    hl.agents[(master.address.lower(), "testnet")] = [{"address": agent.address, "name": "phone", "validUntil": far}]
    assert client.post("/v1/links", json=body).status_code == 200
    assert client.get(f"/v1/links/{agent.address}?network=testnet").json() == {"address": master.address.lower()}

    # the phone then signs in with its agent key on behalf of the account
    h = sign_in(client, agent, address=master.address)
    me = client.get("/v1/me", headers=h).json()
    assert (me["address"], me["role"]) == (master.address.lower(), "agent")
