import time

import pytest
from eth_account import Account
from eth_account.messages import encode_defunct

from copytrade import auth, db


def sign(account, message: str) -> str:
    return Account.sign_message(encode_defunct(text=message), private_key=account.key).signature.to_0x_hex()


def login(hl, signer, address, network="testnet"):
    nonce, message = auth.issue_challenge(address, network)
    assert address.lower() in message and network in message
    return auth.verify(hl, nonce, sign(signer, message))


def test_main_wallet_signs_in(fresh_db, hl):
    wallet = Account.create()
    token, s = login(hl, wallet, wallet.address)
    assert (s.address, s.role) == (wallet.address.lower(), "wallet")
    assert auth.session_for(token).address == wallet.address.lower()
    with db.connect() as c:
        assert c.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1


def test_named_agent_signs_in_for_its_account(fresh_db, hl):
    master, agent = Account.create(), Account.create()
    far = int(time.time() * 1000) + 86_400_000
    hl.agents[(master.address.lower(), "testnet")] = [{"address": agent.address, "name": "phone", "validUntil": far}]
    _, s = login(hl, agent, master.address)
    assert (s.address, s.signer, s.role) == (master.address.lower(), agent.address.lower(), "agent")


def test_unnamed_agent_is_checked_with_user_role(fresh_db, hl):
    master, agent = Account.create(), Account.create()
    hl.roles[(agent.address.lower(), "testnet")] = {"role": "agent", "data": {"user": master.address.lower()}}
    assert login(hl, agent, master.address)[1].role == "agent"


def test_expired_agent_or_stranger_is_rejected(fresh_db, hl):
    master, agent, stranger = Account.create(), Account.create(), Account.create()
    past = int(time.time() * 1000) - 1
    hl.agents[(master.address.lower(), "testnet")] = [{"address": agent.address, "name": "phone", "validUntil": past}]
    with pytest.raises(auth.AuthError):
        login(hl, agent, master.address)
    with pytest.raises(auth.AuthError):
        login(hl, stranger, master.address)
    # an agent of a *different* account doesn't help either
    hl.roles[(stranger.address.lower(), "testnet")] = {"role": "agent", "data": {"user": "0x" + "9" * 40}}
    with pytest.raises(auth.AuthError):
        login(hl, stranger, master.address)


def test_challenge_is_single_use(fresh_db, hl):
    wallet = Account.create()
    nonce, message = auth.issue_challenge(wallet.address, "mainnet")
    sig = sign(wallet, message)
    auth.verify(hl, nonce, sig)
    with pytest.raises(auth.AuthError):
        auth.verify(hl, nonce, sig)


def test_revoked_session_is_gone(fresh_db, hl):
    wallet = Account.create()
    token, _ = login(hl, wallet, wallet.address)
    auth.revoke(token)
    assert auth.session_for(token) is None


def test_rejects_bad_input(fresh_db):
    with pytest.raises(auth.AuthError):
        auth.issue_challenge("0x123", "testnet")
    with pytest.raises(auth.AuthError):
        auth.issue_challenge("0x" + "1" * 40, "devnet")
