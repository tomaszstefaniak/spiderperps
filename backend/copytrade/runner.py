"""Start and stop the background workers with the web app."""
from __future__ import annotations

import threading

from . import config
from .discovery import DiscoveryThread
from .hlapi import client
from .watcher import WatcherThread


def start() -> list[threading.Thread]:
    workers: list[threading.Thread] = []
    if config.WATCHER_ENABLED:
        workers.append(WatcherThread(client))
    if config.DISCOVERY_ENABLED:
        workers.append(DiscoveryThread(client))
    for w in workers:
        w.start()
    return workers


def stop(workers: list[threading.Thread]) -> None:
    for w in workers:
        w.stop_event.set()  # type: ignore[attr-defined]
    for w in workers:
        w.join(timeout=5)
