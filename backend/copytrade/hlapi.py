"""Rate-limited client for Hyperliquid's public /info API.

Hyperliquid allows 1200 request weight per minute per IP. Every call here goes through one
shared token bucket so the watcher, discovery job and API handlers can't starve each other
or get the server IP throttled.
"""
from __future__ import annotations

import logging
import threading
import time
from typing import Any

import requests

from . import config

log = logging.getLogger("copytrade.hl")

# https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits
_WEIGHTS = {
    "l2Book": 2,
    "allMids": 2,
    "clearinghouseState": 2,
    "orderStatus": 2,
    "spotClearinghouseState": 2,
    "exchangeStatus": 2,
    "userRole": 60,
}
_DEFAULT_WEIGHT = 20
# These also cost +1 weight per 20 items returned.
_ITEM_WEIGHTED = {"userFills", "userFillsByTime", "historicalOrders", "userFunding"}


class RateLimiter:
    """Token bucket measured in Hyperliquid request weight."""

    def __init__(self, per_minute: int):
        self.capacity = float(per_minute)
        self.tokens = float(per_minute)
        self.rate = per_minute / 60.0
        self.updated = time.monotonic()
        self.lock = threading.Lock()

    def _refill(self) -> None:
        now = time.monotonic()
        self.tokens = min(self.capacity, self.tokens + (now - self.updated) * self.rate)
        self.updated = now

    def acquire(self, weight: float) -> None:
        while True:
            with self.lock:
                self._refill()
                if self.tokens >= weight:
                    self.tokens -= weight
                    return
                wait = (weight - self.tokens) / self.rate
            time.sleep(wait)

    def charge(self, weight: float) -> None:
        """Debit weight that is only known after the response (item-weighted calls)."""
        with self.lock:
            self._refill()
            self.tokens -= weight


class _TTLCache:
    def __init__(self) -> None:
        self._data: dict[Any, tuple[float, Any]] = {}
        self._lock = threading.Lock()

    def get(self, key: Any, ttl: float) -> Any | None:
        with self._lock:
            hit = self._data.get(key)
            if hit and time.monotonic() - hit[0] < ttl:
                return hit[1]
        return None

    def put(self, key: Any, value: Any) -> None:
        with self._lock:
            self._data[key] = (time.monotonic(), value)


class HLClient:
    def __init__(self, limiter: RateLimiter | None = None, session: requests.Session | None = None):
        self.limiter = limiter or RateLimiter(config.HL_WEIGHT_PER_MIN)
        self.session = session or requests.Session()
        self.cache = _TTLCache()

    # ---- raw ----
    def info(self, body: dict, network: str = "mainnet", timeout: float = 20) -> Any:
        kind = body["type"]
        self.limiter.acquire(_WEIGHTS.get(kind, _DEFAULT_WEIGHT))
        url = f"{config.API_URLS[network]}/info"
        for attempt in range(3):
            r = self.session.post(url, json=body, timeout=timeout)
            if r.status_code == 429:
                backoff = 2 ** attempt
                log.warning("hyperliquid 429 on %s, backing off %ss", kind, backoff)
                time.sleep(backoff)
                continue
            r.raise_for_status()
            data = r.json()
            if kind in _ITEM_WEIGHTED and isinstance(data, list):
                self.limiter.charge(len(data) // 20)
            return data
        r.raise_for_status()
        return None

    # ---- typed helpers ----
    def clearinghouse_state(self, user: str, network: str = "mainnet") -> dict:
        return self.info({"type": "clearinghouseState", "user": user}, network)

    def all_mids(self, network: str = "mainnet") -> dict[str, float]:
        key = ("mids", network)
        hit = self.cache.get(key, ttl=3)
        if hit is not None:
            return hit
        raw = self.info({"type": "allMids"}, network)
        mids = {k: float(v) for k, v in raw.items()}
        self.cache.put(key, mids)
        return mids

    def perp_meta(self, network: str = "mainnet") -> dict[str, dict]:
        """{coin: {szDecimals, maxLeverage, isDelisted}} for the main perp dex."""
        key = ("meta", network)
        hit = self.cache.get(key, ttl=600)
        if hit is not None:
            return hit
        raw = self.info({"type": "meta"}, network)
        meta = {
            u["name"]: {
                "szDecimals": int(u.get("szDecimals", 0)),
                "maxLeverage": int(u.get("maxLeverage", 1)),
                "isDelisted": bool(u.get("isDelisted", False)),
            }
            for u in raw.get("universe", [])
        }
        self.cache.put(key, meta)
        return meta

    def user_role(self, user: str, network: str) -> dict:
        return self.info({"type": "userRole", "user": user}, network)

    def extra_agents(self, user: str, network: str) -> list[dict]:
        return self.info({"type": "extraAgents", "user": user}, network) or []

    def portfolio(self, user: str) -> dict[str, dict]:
        raw = self.info({"type": "portfolio", "user": user}, "mainnet")
        return dict(raw)

    def user_fills_by_time(self, user: str, start_ms: int, end_ms: int | None = None) -> list[dict]:
        body: dict[str, Any] = {
            "type": "userFillsByTime",
            "user": user,
            "startTime": start_ms,
            "aggregateByTime": True,
        }
        if end_ms is not None:
            body["endTime"] = end_ms
        return self.info(body, "mainnet") or []

    def leaderboard(self) -> list[dict]:
        r = self.session.get(config.LEADERBOARD_URL, timeout=120)
        r.raise_for_status()
        return r.json().get("leaderboardRows", [])


client = HLClient()
