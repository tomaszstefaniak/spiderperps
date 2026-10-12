"""Runtime settings, read from the environment (see .env.example)."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

API_URLS = {
    "mainnet": "https://api.hyperliquid.xyz",
    "testnet": "https://api.hyperliquid-testnet.xyz",
}
NETWORKS = tuple(API_URLS)
LEADERBOARD_URL = "https://stats-data.hyperliquid.xyz/Mainnet/leaderboard"

# Leaders are read from mainnet - that's where the traders worth copying are. Followers
# execute on the network their agent key was approved on, so a testnet account can
# paper-copy real mainnet traders. COPY_LEADER_NETWORK=testnet is a demo mode: follow a
# second testnet wallet of your own and trigger copy proposals on demand.
LEADER_NETWORK = os.getenv("COPY_LEADER_NETWORK", "mainnet")
if LEADER_NETWORK not in API_URLS:
    raise ValueError(f"COPY_LEADER_NETWORK must be one of {tuple(API_URLS)}")
# Demo leaders read from testnet while every other leader stays on LEADER_NETWORK
# (comma-separated addresses), so a live server can also run an on-demand demo.
TESTNET_LEADERS = {a.strip().lower() for a in os.getenv("COPY_TESTNET_LEADERS", "").split(",") if a.strip()}


def leader_network(address: str) -> str:
    return "testnet" if address.lower() in TESTNET_LEADERS else LEADER_NETWORK

APP_NAME = os.getenv("COPY_APP_NAME", "SpiderPerps")
DB_PATH = Path(os.getenv("COPY_DB_PATH", str(BASE_DIR / "copytrade.db")))

WATCHER_ENABLED = os.getenv("COPY_WATCHER_ENABLED", "true").lower() == "true"
WATCH_INTERVAL_S = float(os.getenv("COPY_WATCH_INTERVAL_S", "5"))
PROPOSAL_TTL_S = int(os.getenv("COPY_PROPOSAL_TTL_S", str(15 * 60)))
# At most one push per follower and leader in this window; later moves wait in the in-app inbox.
PUSH_COOLDOWN_S = int(os.getenv("COPY_PUSH_COOLDOWN_S", "60"))
# Leader size changes smaller than this (partial fills, small rebalances) aren't alerted.
MIN_MOVE_PCT = float(os.getenv("COPY_MIN_MOVE_PCT", "5"))
SESSION_TTL_S = int(os.getenv("COPY_SESSION_TTL_S", str(30 * 24 * 3600)))
CHALLENGE_TTL_S = 10 * 60

DISCOVERY_ENABLED = os.getenv("COPY_DISCOVERY_ENABLED", "true").lower() == "true"
DISCOVERY_REFRESH_S = int(os.getenv("COPY_DISCOVERY_REFRESH_S", str(12 * 3600)))
DISCOVERY_DEEP_N = int(os.getenv("COPY_DISCOVERY_DEEP_N", "120"))

# Share of Hyperliquid's 1200 weight/min per-IP REST budget this process may use.
HL_WEIGHT_PER_MIN = int(os.getenv("COPY_HL_WEIGHT_PER_MIN", "900"))

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
EXPO_ACCESS_TOKEN = os.getenv("EXPO_ACCESS_TOKEN") or None
