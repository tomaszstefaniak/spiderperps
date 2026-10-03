"""Push notifications through Expo's push service (APNs + FCM behind one API)."""
from __future__ import annotations

import logging

import requests

from . import config, db

log = logging.getLogger("copytrade.push")


def tokens_for(address: str, network: str) -> list[str]:
    with db.connect() as c:
        rows = c.execute(
            "SELECT push_token FROM devices WHERE address = ? AND network = ?", (address, network)
        ).fetchall()
    return [r["push_token"] for r in rows]


def send(tokens: list[str], title: str, body: str, data: dict, *, category: str | None = None) -> None:
    if not tokens:
        return
    messages = []
    for t in tokens:
        m = {"to": t, "title": title, "body": body, "data": data, "sound": "default", "priority": "high"}
        if category:
            m["categoryId"] = category
        messages.append(m)
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if config.EXPO_ACCESS_TOKEN:
        headers["Authorization"] = f"Bearer {config.EXPO_ACCESS_TOKEN}"
    for i in range(0, len(messages), 100):  # Expo accepts up to 100 messages per request
        batch = messages[i : i + 100]
        try:
            r = requests.post(config.EXPO_PUSH_URL, json=batch, headers=headers, timeout=15)
            r.raise_for_status()
            for msg, ticket in zip(batch, r.json().get("data", [])):
                if ticket.get("status") == "error":
                    _handle_error(msg["to"], ticket)
        except Exception:
            log.exception("expo push failed")


def _handle_error(token: str, ticket: dict) -> None:
    err = (ticket.get("details") or {}).get("error")
    log.warning("push to %s failed: %s %s", token[:24], err, ticket.get("message"))
    if err == "DeviceNotRegistered":  # app uninstalled or token rotated
        with db.connect() as c:
            c.execute("DELETE FROM devices WHERE push_token = ?", (token,))
