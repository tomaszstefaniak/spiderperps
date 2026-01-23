import os
import json
import logging
from pathlib import Path
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from eth_account import Account
from hyperliquid.info import Info
from hyperliquid.exchange import Exchange
from hyperliquid.utils import constants
from decimal import Decimal, getcontext

getcontext().prec = 28

# ---------------- logging ----------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("hl-service")

def j(obj) -> str:
    try:
        s = json.dumps(obj, separators=(",", ":"), ensure_ascii=False)
        return s[:800]  # keep short in logs
    except Exception:
        return str(obj)[:800]

# ---------------- env / clients ----------------
ENV_PATH = Path(__file__).with_name(".env")
load_dotenv(dotenv_path=ENV_PATH, override=True)

USE_TESTNET = os.getenv("HL_USE_TESTNET", "false").lower() == "true"
API_URL = constants.TESTNET_API_URL if USE_TESTNET else constants.MAINNET_API_URL
ACCOUNT_ADDRESS = os.getenv("HL_ACCOUNT_ADDRESS")
SECRET_KEY = os.getenv("HL_SECRET_KEY")
HL_TIMEOUT = int(os.getenv("HL_TIMEOUT", "30"))

app = FastAPI()

# Public info client (HTTP-only)
info = Info(base_url=API_URL, skip_ws=True, timeout=HL_TIMEOUT)

# Trading client (perps)
exchange = None
if ACCOUNT_ADDRESS and SECRET_KEY:
    acct = Account.from_key(SECRET_KEY)
    exchange = Exchange(acct, base_url=API_URL, account_address=ACCOUNT_ADDRESS, timeout=HL_TIMEOUT)

# ---------------- util ----------------
def _perp_meta(sym: str):
    """
    Prefer perps meta for sizing (what market_open uses).
    """
    try:
        m = info.meta()
        uni = (m or {}).get("universe") or []
        u = sym.upper()
        for x in uni:
            name = (x.get("name") or x.get("asset") or x.get("coin") or "").upper()
            if name == u:
                return x
    except Exception:
        pass
    return None

def _spot_meta(sym: str):
    try:
        sm = info.spot_meta()
        uni = sm.get("universe") or []
        u = sym.upper()
        for x in uni:
            name = (x.get("name") or x.get("coin") or x.get("ticker") or "").upper()
            base = name.replace("/USDC", "")
            if base == u:
                return x
    except Exception:
        pass
    return None

def _coin_meta(sym: str):
    """
    Prefer perps meta; fall back to spot if needed.
    """
    return _perp_meta(sym) or _spot_meta(sym)

def _quantize(val: Decimal, decimals: int) -> Decimal:
    step = Decimal(10) ** (-decimals)
    return (val // step) * step

def mids_dict() -> dict[str, float]:
    """
    Normalize Info.all_mids() into {SYMBOL: mid_float}.
    """
    raw = info.all_mids()
    if isinstance(raw, dict):
        # sometimes keys already in UPPERCASE or mixed
        return {str(k).upper(): float(v) for k, v in raw.items()}
    return {str(row["coin"]).upper(): float(row["mid"]) for row in raw}

def _pull_order_ids(raw: dict) -> list[int]:
    """
    Try hard to pull order id(s) from hyperliquid SDK response.
    Covers multiple shapes we've seen in the wild.
    """
    oids: list[int] = []
    try:
        prov = raw or {}
        candidates = [
            (((prov.get("response") or {}).get("data") or {}).get("statuses") or []),
            ((prov.get("data") or {}).get("statuses") or []),
            prov.get("statuses") or [],
        ]
        for statuses in candidates:
            if not isinstance(statuses, list):
                continue
            for st in statuses:
                for key in ("filled", "resting", "placed", "order", "status"):
                    obj = st.get(key)
                    if isinstance(obj, dict):
                        oid = obj.get("oid") or obj.get("orderId") or obj.get("id")
                        if isinstance(oid, str) and oid.isdigit():
                            oid = int(oid)
                        if isinstance(oid, int):
                            oids.append(oid)
                # also allow top-level on the status item
                for key in ("oid", "orderId", "id"):
                    v = st.get(key)
                    if isinstance(v, str) and v.isdigit():
                        v = int(v)
                    if isinstance(v, int):
                        oids.append(v)
    except Exception:
        pass
    # dedupe, preserve order
    seen = set()
    out = []
    for x in oids:
        if x not in seen:
            out.append(x)
            seen.add(x)
    return out

def _provider_indicates_immediate_fill(raw: dict) -> bool:
    """
    If the provider already reports a 'filled' status inline, consider it filled
    even if we didn't get an oid.
    """
    try:
        prov = raw or {}
        statuses = (
            (((prov.get("response") or {}).get("data") or {}).get("statuses") or [])
            or ((prov.get("data") or {}).get("statuses") or [])
            or []
        )
        for st in statuses if isinstance(statuses, list) else []:
            for key in ("filled", "status", "order"):
                obj = st.get(key)
                if isinstance(obj, dict):
                    if "avgPx" in obj or "totalSz" in obj:
                        return True
                if isinstance(obj, str) and "filled" in obj.lower():
                    return True
            s = (st.get("status") or st.get("state") or "")
            if isinstance(s, str) and "filled" in s.lower():
                return True
        return False
    except Exception:
        return False

# ---------------- models ----------------
class QuoteReq(BaseModel):
    coin: str
    side: str  # "buy" | "sell"
    size: float

class OrderReq(BaseModel):
    coin: str
    side: str
    size: float | None = None
    usdcIn: float | None = None
    slippage: float = 0.01

# ---------------- endpoints ----------------
@app.get("/health")
def health():
    out = {
        "ok": True,
        "network": "testnet" if USE_TESTNET else "mainnet",
        "trading_enabled": exchange is not None,
        "has_account": bool(ACCOUNT_ADDRESS),
        "has_secret": bool(SECRET_KEY),
        "use_testnet": USE_TESTNET,
    }
    log.info("health %s", j(out))
    return out

@app.get("/mids")
def mids():
    try:
        m = mids_dict()
        log.info("mids ok keys=%s", len(m))
        return m
    except Exception as e:
        log.exception("mids error")
        raise HTTPException(status_code=502, detail=f"mids error: {e}")

@app.get("/perps/markets")
def perps_markets():
    """
    Return a simple list of tradable perp symbols from Hyperliquid meta().
    Falls back to mids() if meta is unavailable.
    """
    # 1) Primary: meta().universe
    try:
        m = info.meta()
        uni = (m or {}).get("universe") or []
        syms = []
        seen = set()
        for x in uni:
            # names are like "ETH", sometimes "ETH-USD" on older schemas;
            # normalize to an alpha ticker.
            name = (x.get("name") or x.get("asset") or x.get("coin") or "").upper()
            if not name:
                continue
            if not name.isalpha():
                name = "".join(ch for ch in name if ch.isalpha())
            if not name or name in seen:
                continue
            seen.add(name)
            syms.append(name)
        if syms:
            return {"markets": syms}
    except Exception:
        log.exception("perps_markets: meta() failed")

    # 2) Fallback: keys from mids()
    try:
        md = mids_dict()
        syms = sorted([k for k in md.keys() if k.isalpha()])
        return {"markets": syms, "fallback": True}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"markets error: {e}")

@app.post("/quote")
def quote(q: QuoteReq):
    try:
        mids = {k: Decimal(str(v)) for k, v in mids_dict().items()}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"mids error: {e}")

    sym = q.coin.upper()
    if sym not in mids:
        raise HTTPException(status_code=400, detail="Unsupported coin")
    mid = mids[sym]
    meta = _coin_meta(sym)
    sz_dec = int(
        (meta or {}).get("szDecimals")
        or (meta or {}).get("sz_decimals")
        or 2  # default sensible for perps like ETH
    )
    min_sz = Decimal(str(
        (meta or {}).get("minSz")
        or (meta or {}).get("minOrderSz")
        or (meta or {}).get("minOrderSize")
        or 0
    ))

    if q.side.lower() == "buy":
        # UI passes USDC size
        usdc_in = Decimal(str(q.size))
        out_coin_q = _quantize(usdc_in / mid, sz_dec)
        return {
            "coin": q.coin,
            "side": "buy",
            "price": str(mid),
            "usdcIn": str(usdc_in),
            "outCoinQuantized": str(out_coin_q),
            "minSz": str(min_sz),
            "belowMinSz": bool(min_sz and out_coin_q < min_sz),
        }
    else:
        in_coin_q = _quantize(Decimal(str(q.size)), sz_dec)
        return {
            "coin": q.coin,
            "side": "sell",
            "price": str(mid),
            "inCoinQuantized": str(in_coin_q),
            "usdcOut": str(in_coin_q * mid),
            "minSz": str(min_sz),
            "belowMinSz": bool(min_sz and in_coin_q < min_sz),
        }

# ---- helpers (no decorators!) ----
def _first_status_error(resp: dict) -> str | None:
    try:
        prov = resp or {}
        statuses = (
            (((prov.get("response") or {}).get("data") or {}).get("statuses") or [])
            or ((prov.get("data") or {}).get("statuses") or [])
            or []
        )
        if isinstance(statuses, list):
            for st in statuses:
                msg = st.get("error")
                if isinstance(msg, str) and msg.strip():
                    return msg
    except Exception:
        pass
    return None

# ---- real endpoint ----
@app.post("/order/market")
def market_order(o: OrderReq):
    if exchange is None:
        raise HTTPException(status_code=400, detail="Trading not configured (missing HL keys).")

    # mids for price + slippage bounds
    try:
        mids_map = {k: Decimal(str(v)) for k, v in mids_dict().items()}
    except Exception as e:
        log.exception("mids lookup failed")
        raise HTTPException(status_code=502, detail=f"mids error: {e}")

    sym = o.coin.upper()
    if sym not in mids_map:
        raise HTTPException(status_code=400, detail=f"Unsupported coin: {o.coin}")
    mid = mids_map[sym]

    # derive size
    is_buy = o.side.lower() == "buy"
    if is_buy:
        if o.usdcIn and o.usdcIn > 0:
            raw_sz = Decimal(str(o.usdcIn)) / mid
        elif o.size and o.size > 0:
            raw_sz = Decimal(str(o.size))
        else:
            raise HTTPException(status_code=400, detail="For buy, provide usdcIn (preferred) or size > 0")
    else:
        if not o.size or o.size <= 0:
            raise HTTPException(status_code=400, detail="size must be > 0 for sell")
        raw_sz = Decimal(str(o.size))

    meta = _coin_meta(sym)
    sz_dec = int((meta or {}).get("szDecimals", 8))
    min_sz = Decimal(str(
        (meta or {}).get("minSz")
        or (meta or {}).get("minOrderSz")
        or (meta or {}).get("minOrderSize")
        or 0
    ))

    q_sz = _quantize(raw_sz, sz_dec)
    if q_sz <= 0:
        raise HTTPException(status_code=400, detail=f"Size too small after quantization (decimals={sz_dec})")
    if min_sz and q_sz < min_sz:
        raise HTTPException(status_code=400, detail=f"Below min size: {min_sz} {o.coin}")

    limit_px = mid * (Decimal(1) + Decimal(str(o.slippage))) if is_buy else mid * (Decimal(1) - Decimal(str(o.slippage)))
    log.info("place %s %s q_sz=%s mid=%s px=%s slip=%s", o.side, sym, str(q_sz), str(mid), str(limit_px), str(o.slippage))

    try:
        resp = exchange.market_open(
            o.coin, is_buy, float(q_sz), px=float(limit_px), slippage=o.slippage
        )

        # Turn provider-side immediate reject (e.g. IOC no-liquidity) into a 409
        status_err = _first_status_error(resp)
        if status_err:
            msg = status_err
            if "immediately match" in msg:
                msg = "No resting liquidity at your limit (IOC). Try wider slippage or later."
            log.info("provider reject: %s", msg)
            return JSONResponse(
                status_code=409,
                content={
                    "accepted": False,
                    "filled": False,
                    "orderIds": [],
                    "error": msg,
                    "provider": resp,
                },
            )

        oids = _pull_order_ids(resp)
        accepted = resp.get("status") == "ok"
        immediate = _provider_indicates_immediate_fill(resp)

        try:
            st = (((resp.get("response") or {}).get("data") or {}).get("statuses") or [])
            stn = len(st) if isinstance(st, list) else 0
        except Exception:
            stn = 0

        log.info("placed accepted=%s immediate=%s oids=%s statuses=%s payload=%s",
                 accepted, immediate, oids, stn, j(resp))
        return {"accepted": accepted, "filled": immediate, "orderIds": oids, "provider": resp}
    except Exception as e:
        log.exception("exchange.market_open failed")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/order-status")
def order_status(
    user: str = Query(..., description="wallet address to check"),
    oid: int | None = Query(None),
    oids: str | None = Query(None, description="comma separated order ids"),
):
    if not user:
        raise HTTPException(status_code=400, detail="missing user")

    try:
        if oid is not None or oids:
            ids = []
            if oid is not None:
                ids.append(int(oid))
            if oids:
                ids += [int(x) for x in oids.split(",") if x.strip().isdigit()]
            log.info("status by ids user=%s ids=%s", user, ids)
            results = []
            for o in ids:
                r = info.post("/info", {"type": "orderStatus", "user": user, "oid": o})
                results.append({"oid": o, "raw": r})
            return {"orders": results}
        log.info("recent fills user=%s", user)
        fills = info.user_fills(user)
        return {"fills": fills}
    except Exception as e:
        log.exception("order-status error")
        raise HTTPException(status_code=502, detail=f"order-status error: {e}")

@app.get("/balances")
def balances():
    if not ACCOUNT_ADDRESS:
        raise HTTPException(status_code=400, detail="ACCOUNT_ADDRESS not set.")

    spot = None
    try:
        spot = info.spot_user_state(ACCOUNT_ADDRESS)
    except Exception:
        pass

    generic = None
    try:
        generic = info.user_state(ACCOUNT_ADDRESS)
    except Exception:
        pass

    if isinstance(spot, dict) and spot.get("balances"):
        return {"source": "spot", **spot}
    if isinstance(generic, dict) and generic:
        return {"source": "user_state", **generic}

    return JSONResponse(
        status_code=200,
        content={
            "balances": [],
            "warning": "No balances returned (testnet quirk).",
            "spot": spot,
            "user_state": generic,
        },
    )

@app.get("/tokens")
def tokens():
    # Prefer perps universe so szDecimals match what market_open wants
    try:
        m = info.meta()
        uni = (m or {}).get("universe") or []
        toks = []
        seen = set()
        for x in uni:
            sym = (x.get("name") or x.get("asset") or x.get("coin") or "").upper()
            if not sym or sym in seen:
                continue
            seen.add(sym)
            toks.append({
                "symbol": sym,
                "szDecimals": x.get("szDecimals", 2),
                "pxDecimals": x.get("pxDecimals", 4),
            })
        # also expose USDC for the UI pairing
        toks.insert(0, {"symbol": "USDC", "szDecimals": 6, "pxDecimals": 4})
        return {"tokens": toks}
    except Exception:
        pass

    # Fallback to mids keys if meta unavailable
    try:
        md = mids_dict()
        toks = [{"symbol": s, "szDecimals": 2, "pxDecimals": 4} for s in md.keys() if s.isalpha()]
        if "USDC" not in [t["symbol"] for t in toks]:
            toks.insert(0, {"symbol": "USDC", "szDecimals": 6, "pxDecimals": 4})
        return {"tokens": toks, "fallback": True}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"tokens error: {e}")

# ---------------- followed wallets (json persistence) ----------------
FOLLOWED_FILE = Path(__file__).with_name("followed_wallets.json")

def _load_followed() -> dict:
    """
    Returns dict: { "followed_address": [list_of_follower_addresses] }
    """
    if not FOLLOWED_FILE.exists():
        return {}
    try:
        with open(FOLLOWED_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return {}

def _save_followed(data: dict):
    try:
        with open(FOLLOWED_FILE, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        log.error("failed to save followed.json: %s", e)

class FollowReq(BaseModel):
    user: str
    target: str
    action: str  # "follow" | "unfollow"

@app.post("/follow")
def follow_wallet(req: FollowReq):
    user = req.user.lower().strip()
    target = req.target.lower().strip()
    action = req.action.lower()

    if not user or not target:
        raise HTTPException(status_code=400, detail="user and target required")

    data = _load_followed()
    followers = data.get(target, [])

    if action == "follow":
        if user not in followers:
            followers.append(user)
            data[target] = followers
            _save_followed(data)
        return {"status": "ok", "following": True}
    elif action == "unfollow":
        if user in followers:
            followers = [u for u in followers if u != user]
            if followers:
                data[target] = followers
            else:
                del data[target]
            _save_followed(data)
        return {"status": "ok", "following": False}
    else:
        raise HTTPException(status_code=400, detail="invalid action")

@app.get("/followed/top")
def top_followed():
    """
    Returns list of { "address": str, "followers": int } sorted by count desc
    """
    data = _load_followed()
    # tally
    out = []
    for target, followers in data.items():
        out.append({"address": target, "followers": len(followers)})
    
    # sort desc
    out.sort(key=lambda x: x["followers"], reverse=True)
    return {"top": out}

@app.get("/user/following")
def user_following(user: str = Query(..., description="user address")):
    """
    Returns list of addresses that 'user' is following
    """
    u = user.lower().strip()
    data = _load_followed()
    following = []
    for target, followers in data.items():
        if u in followers:
            following.append(target)
    return {"following": following}

@app.get("/wallet/{address}/positions")
def wallet_positions(address: str):
    """
    Get open positions for a target wallet.
    Uses info.user_state(address).
    """
    try:
        state = info.user_state(address)
        # Extract positions
        # Hyperliquid returns "assetPositions" in user_state
        # Each item has "position": { "coin": "ETH", "szi": "...", "entryPx": "..." }
        
        raw_pos = (state or {}).get("assetPositions") or []
        clean_pos = []
        for p in raw_pos:
            pos_data = p.get("position") or {}
            coin = pos_data.get("coin")
            szi = float(pos_data.get("szi") or 0)
            if not coin or szi == 0:
                continue
                
            entry_px = float(pos_data.get("entryPx") or 0)
            # leverage is messy to calc user-side without isolated margin data, 
            # but we can pass raw data or simple fields
            
            clean_pos.append({
                "coin": coin,
                "size": szi,
                "entryPx": entry_px,
                "side": "LONG" if szi > 0 else "SHORT",
                "liqPx": float(pos_data.get("liquidationPx") or 0) if pos_data.get("liquidationPx") else None,
                "positionValue": abs(szi * entry_px), # approx
                "raw": pos_data
            })
            
        return {"address": address, "positions": clean_pos}
        
    except Exception as e:
        log.exception("wallet positions error")
        raise HTTPException(status_code=502, detail=f"failed to fetch positions: {e}")
