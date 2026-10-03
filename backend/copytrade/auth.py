"""Sign-in without the server ever holding a key.

The client signs a one-time challenge (EIP-191 personal_sign) with either
- the account's main wallet (web), or
- an agent key the account approved on Hyperliquid (phone).
For an agent signature we ask Hyperliquid whether that agent belongs to the account, so a
phone's sign-in is only as valid as its on-chain approval - revoking the agent on
Hyperliquid also revokes future sign-ins.
"""
from __future__ import annotations

import hashlib
import secrets
import time
from dataclasses import dataclass

from eth_account import Account
from eth_account.messages import encode_defunct

from . import config, db
from .hlapi import HLClient

ADDRESS_LEN = 42


class AuthError(Exception):
    pass


def normalize_address(addr: str) -> str:
    a = (addr or "").strip().lower()
    if len(a) != ADDRESS_LEN or not a.startswith("0x") or any(c not in "0123456789abcdef" for c in a[2:]):
        raise AuthError("invalid address")
    return a


def _check_network(network: str) -> str:
    if network not in config.NETWORKS:
        raise AuthError("invalid network")
    return network


def issue_challenge(address: str, network: str) -> tuple[str, str]:
    address, network = normalize_address(address), _check_network(network)
    nonce = secrets.token_hex(16)
    issued = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    message = (
        f"{config.APP_NAME} sign-in\n\n"
        f"Account: {address}\n"
        f"Network: {network}\n"
        f"Nonce: {nonce}\n"
        f"Issued At: {issued}\n\n"
        "This signature only proves you control this account. It cannot move funds."
    )
    with db.connect() as c:
        c.execute("DELETE FROM challenges WHERE created_at < ?", (db.now() - config.CHALLENGE_TTL_S,))
        c.execute(
            "INSERT INTO challenges (nonce, address, network, message, created_at) VALUES (?, ?, ?, ?, ?)",
            (nonce, address, network, message, db.now()),
        )
    return nonce, message


def agent_belongs_to(hl: HLClient, agent: str, account: str, network: str) -> bool:
    """True if `agent` is an approved, unexpired agent of `account` on Hyperliquid."""
    now_ms = int(time.time() * 1000)
    # Named agents (what our app approves) are listed cheaply via extraAgents (weight 20).
    for a in hl.extra_agents(account, network):
        if str(a.get("address", "")).lower() == agent:
            valid_until = a.get("validUntil")
            return not valid_until or int(valid_until) > now_ms
    # Fallback for unnamed agents (weight 60).
    role = hl.user_role(agent, network) or {}
    data = role.get("data") or {}
    return role.get("role") == "agent" and str(data.get("user", "")).lower() == account


@dataclass
class Session:
    address: str
    network: str
    signer: str
    role: str


def verify(hl: HLClient, nonce: str, signature: str) -> tuple[str, Session]:
    with db.connect() as c:
        row = c.execute("SELECT * FROM challenges WHERE nonce = ?", (nonce,)).fetchone()
        c.execute("DELETE FROM challenges WHERE nonce = ?", (nonce,))  # single use
    if not row or row["created_at"] < db.now() - config.CHALLENGE_TTL_S:
        raise AuthError("challenge expired, request a new one")
    address, network = row["address"], row["network"]
    try:
        signer = Account.recover_message(encode_defunct(text=row["message"]), signature=signature).lower()
    except Exception as e:  # malformed signature
        raise AuthError("invalid signature") from e

    if signer == address:
        role = "wallet"
    elif agent_belongs_to(hl, signer, address, network):
        role = "agent"
    else:
        raise AuthError("signer is neither this account nor one of its approved agents")

    token = secrets.token_urlsafe(32)
    with db.connect() as c:
        c.execute(
            "INSERT INTO sessions (token_hash, address, network, signer, role, created_at, expires_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (_hash(token), address, network, signer, role, db.now(), db.now() + config.SESSION_TTL_S),
        )
        c.execute(
            "INSERT OR IGNORE INTO users (address, network, created_at) VALUES (?, ?, ?)",
            (address, network, db.now()),
        )
    return token, Session(address, network, signer, role)


def session_for(token: str) -> Session | None:
    with db.connect() as c:
        row = c.execute("SELECT * FROM sessions WHERE token_hash = ?", (_hash(token),)).fetchone()
    if not row or row["expires_at"] < db.now():
        return None
    return Session(row["address"], row["network"], row["signer"], row["role"])


def revoke(token: str) -> None:
    with db.connect() as c:
        c.execute("DELETE FROM sessions WHERE token_hash = ?", (_hash(token),))


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
