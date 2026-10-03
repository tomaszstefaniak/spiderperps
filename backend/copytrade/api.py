"""HTTP API for the mobile app and the web app (mounted under /v1)."""
from __future__ import annotations

import json
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field

from . import auth, db, discovery
from .auth import AuthError, Session
from .hlapi import client as hl
from .positions import parse_positions
from .watcher import prefs_for

router = APIRouter(prefix="/v1")

Network = Literal["mainnet", "testnet"]


def _address(raw: str) -> str:
    try:
        return auth.normalize_address(raw)
    except AuthError as e:
        raise HTTPException(400, str(e)) from e


def require_session(authorization: str | None = Header(default=None)) -> Session:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "missing bearer token")
    session = auth.session_for(authorization.removeprefix("Bearer ").strip())
    if not session:
        raise HTTPException(401, "session expired, sign in again")
    return session


# ---------------------------------------------------------------- auth

class ChallengeReq(BaseModel):
    address: str
    network: Network


class VerifyReq(BaseModel):
    nonce: str
    signature: str


@router.post("/auth/challenge")
def challenge(req: ChallengeReq):
    try:
        nonce, message = auth.issue_challenge(req.address, req.network)
    except AuthError as e:
        raise HTTPException(400, str(e)) from e
    return {"nonce": nonce, "message": message}


@router.post("/auth/verify")
def verify(req: VerifyReq):
    try:
        token, s = auth.verify(hl, req.nonce, req.signature)
    except AuthError as e:
        raise HTTPException(401, str(e)) from e
    return {"token": token, "address": s.address, "network": s.network, "role": s.role}


@router.post("/auth/logout")
def logout(authorization: str | None = Header(default=None)):
    if authorization and authorization.startswith("Bearer "):
        auth.revoke(authorization.removeprefix("Bearer ").strip())
    return {"ok": True}


# ---------------------------------------------------------------- phone linking

class LinkReq(BaseModel):
    agent: str
    address: str
    network: Network


@router.post("/links")
def create_link(req: LinkReq):
    """Called by the web approval page once the account approved a phone's agent key.

    Unauthenticated on purpose: we only store it after Hyperliquid confirms the approval,
    and the phone still has to sign in with that agent key before it can do anything.
    """
    agent, address = _address(req.agent), _address(req.address)
    if not auth.agent_belongs_to(hl, agent, address, req.network):
        raise HTTPException(409, "Hyperliquid doesn't list this agent for the account yet, retry in a few seconds")
    with db.connect() as c:
        c.execute(
            "INSERT INTO links (agent, network, address, created_at) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(agent, network) DO UPDATE SET address = excluded.address, created_at = excluded.created_at",
            (agent, req.network, address, db.now()),
        )
    return {"ok": True}


@router.get("/links/{agent}")
def get_link(agent: str, network: Network = Query(...)):
    with db.connect() as c:
        row = c.execute("SELECT address FROM links WHERE agent = ? AND network = ?", (_address(agent), network)).fetchone()
    if not row:
        raise HTTPException(404, "not linked yet")
    return {"address": row["address"]}


# ---------------------------------------------------------------- account

class SettingsReq(BaseModel):
    multiplier: float | None = Field(default=None, gt=0, le=10)
    max_usd: float | None = Field(default=None, ge=10, le=1_000_000)
    max_leverage: int | None = Field(default=None, ge=1, le=50)
    sl_pct: float | None = Field(default=None, ge=0, le=90)  # 0 turns the stop-loss off
    tp_pct: float | None = Field(default=None, ge=0, le=1000)  # 0 turns the take-profit off
    notify_info: bool | None = None


def _settings_dict(s: Session) -> dict:
    p = prefs_for(s.address, s.network)
    return {
        "multiplier": p.settings.multiplier,
        "max_usd": p.settings.max_usd,
        "max_leverage": p.settings.max_leverage,
        "sl_pct": p.settings.sl_pct,
        "tp_pct": p.settings.tp_pct,
        "notify_info": p.notify_info,
    }


@router.get("/me")
def me(s: Session = Depends(require_session)):
    with db.connect() as c:
        n_devices = c.execute(
            "SELECT COUNT(*) FROM devices WHERE address = ? AND network = ?", (s.address, s.network)
        ).fetchone()[0]
    return {"address": s.address, "network": s.network, "role": s.role, "settings": _settings_dict(s), "devices": n_devices}


@router.put("/me/settings")
def update_settings(req: SettingsReq, s: Session = Depends(require_session)):
    patch = req.model_dump(exclude_unset=True)
    for key in ("sl_pct", "tp_pct"):
        if patch.get(key) == 0:
            patch[key] = None
    if "notify_info" in patch:
        patch["notify_info"] = int(bool(patch["notify_info"]))
    if patch:
        cols = ", ".join(f"{k} = ?" for k in patch)
        with db.connect() as c:
            c.execute(f"UPDATE users SET {cols} WHERE address = ? AND network = ?", (*patch.values(), s.address, s.network))
    return _settings_dict(s)


class DeviceReq(BaseModel):
    push_token: str = Field(min_length=10, max_length=200)
    platform: Literal["ios", "android", "web"] | None = None


@router.post("/devices")
def register_device(req: DeviceReq, s: Session = Depends(require_session)):
    with db.connect() as c:
        c.execute(
            "INSERT INTO devices (push_token, address, network, platform, created_at) VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT(push_token) DO UPDATE SET address = excluded.address, network = excluded.network, "
            "platform = excluded.platform",
            (req.push_token, s.address, s.network, req.platform, db.now()),
        )
    return {"ok": True}


@router.delete("/devices/{push_token}")
def unregister_device(push_token: str, s: Session = Depends(require_session)):
    with db.connect() as c:
        c.execute("DELETE FROM devices WHERE push_token = ? AND address = ?", (push_token, s.address))
    return {"ok": True}


# ---------------------------------------------------------------- follows

class FollowReq(BaseModel):
    leader: str
    label: str | None = Field(default=None, max_length=40)


@router.get("/follows")
def list_follows(s: Session = Depends(require_session)):
    with db.connect() as c:
        rows = c.execute(
            "SELECT f.leader, f.label, f.created_at, l.score FROM follows f LEFT JOIN leaders l ON l.address = f.leader "
            "WHERE f.follower = ? AND f.network = ? ORDER BY f.created_at DESC",
            (s.address, s.network),
        ).fetchall()
        copied = c.execute(
            "SELECT leader, coin, szi FROM copied WHERE follower = ? AND network = ?", (s.address, s.network)
        ).fetchall()
    by_leader: dict[str, dict[str, float]] = {}
    for r in copied:
        by_leader.setdefault(r["leader"], {})[r["coin"]] = r["szi"]
    return {"follows": [dict(r) | {"copied": by_leader.get(r["leader"], {})} for r in rows]}


@router.post("/follows")
def follow(req: FollowReq, s: Session = Depends(require_session)):
    leader = _address(req.leader)
    if leader == s.address:
        raise HTTPException(400, "you can't follow yourself")
    with db.connect() as c:
        c.execute(
            "INSERT INTO follows (follower, network, leader, label, created_at) VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT(follower, network, leader) DO UPDATE SET label = excluded.label",
            (s.address, s.network, leader, req.label, db.now()),
        )
    return {"ok": True}


@router.delete("/follows/{leader}")
def unfollow(leader: str, s: Session = Depends(require_session)):
    with db.connect() as c:
        c.execute(
            "DELETE FROM follows WHERE follower = ? AND network = ? AND leader = ?", (s.address, s.network, _address(leader))
        )
        c.execute(
            "UPDATE proposals SET status = 'expired', updated_at = ? WHERE follower = ? AND network = ? "
            "AND leader = ? AND status = 'pending'",
            (db.now(), s.address, s.network, _address(leader)),
        )
    return {"ok": True}


# ---------------------------------------------------------------- proposals

def _proposal(row) -> dict:
    d = dict(row)
    d["is_buy"] = bool(d["is_buy"])
    d["reduce_only"] = bool(d["reduce_only"])
    d["result"] = json.loads(d["result"]) if d["result"] else None
    return d


@router.get("/proposals")
def list_proposals(
    status: Literal["pending", "all"] = "all", limit: int = Query(50, ge=1, le=200), s: Session = Depends(require_session)
):
    where = "follower = ? AND network = ? AND status != 'superseded'"
    if status == "pending":
        where += " AND status = 'pending' AND expires_at >= " + str(db.now())
    with db.connect() as c:
        rows = c.execute(
            f"SELECT * FROM proposals WHERE {where} ORDER BY id DESC LIMIT ?", (s.address, s.network, limit)
        ).fetchall()
    return {"proposals": [_proposal(r) for r in rows], "server_time": db.now()}


@router.get("/proposals/{proposal_id}")
def get_proposal(proposal_id: int, s: Session = Depends(require_session)):
    with db.connect() as c:
        row = c.execute(
            "SELECT * FROM proposals WHERE id = ? AND follower = ? AND network = ?", (proposal_id, s.address, s.network)
        ).fetchone()
    if not row:
        raise HTTPException(404, "not found")
    return _proposal(row) | {"server_time": db.now()}


class DecisionReq(BaseModel):
    # 'approved' / 'failed' are reported *after* the phone sent (or tried to send) the order.
    decision: Literal["approved", "rejected", "failed"]
    # For 'approved': what actually filled (IOC orders can fill partially). Defaults to the
    # proposed size if the phone couldn't tell.
    filled_size: float | None = Field(default=None, ge=0)
    result: dict | None = None


@router.post("/proposals/{proposal_id}/decision")
def decide(proposal_id: int, req: DecisionReq, s: Session = Depends(require_session)):
    allowed_from = ("pending",) if req.decision == "rejected" else ("pending", "expired", "superseded")
    with db.connect() as c:
        row = c.execute(
            "SELECT * FROM proposals WHERE id = ? AND follower = ? AND network = ?", (proposal_id, s.address, s.network)
        ).fetchone()
        if not row:
            raise HTTPException(404, "not found")
        if row["status"] not in allowed_from:
            raise HTTPException(409, f"proposal is already {row['status']}")
        result = (req.result or {}) | ({"filled_size": req.filled_size} if req.filled_size is not None else {})
        c.execute(
            "UPDATE proposals SET status = ?, result = ?, updated_at = ? WHERE id = ?",
            (req.decision, json.dumps(result) if result else None, db.now(), proposal_id),
        )
    copied = None
    if req.decision == "approved":
        filled = row["size"] if req.filled_size is None else req.filled_size
        signed = filled if row["is_buy"] else -filled
        copied = db.record_fill(s.address, s.network, row["leader"], row["coin"], signed, bool(row["reduce_only"]))
    return {"ok": True, "status": req.decision, "copied_szi": copied}


# ---------------------------------------------------------------- discovery

@router.get("/discover")
def discover(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0)):
    return {"status": discovery.status(), "leaders": discovery.ranked(limit, offset)}


@router.get("/leaders/{address}")
def leader(address: str):
    addr = _address(address)
    try:
        scored = discovery.get(hl, addr)
        state = hl.clearinghouse_state(addr, "mainnet")
    except Exception as e:
        raise HTTPException(502, f"hyperliquid error: {e}") from e
    positions = [
        {"coin": p.coin, "szi": p.szi, "entry_px": p.entry_px, "leverage": p.leverage}
        for p in parse_positions(state).values()
    ]
    with db.connect() as c:
        followers = c.execute("SELECT COUNT(*) FROM follows WHERE leader = ?", (addr,)).fetchone()[0]
    return scored | {"positions": positions, "followers": followers}
