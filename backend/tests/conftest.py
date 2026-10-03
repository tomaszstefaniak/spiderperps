import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("COPY_WATCHER_ENABLED", "false")
os.environ.setdefault("COPY_DISCOVERY_ENABLED", "false")

from copytrade import db  # noqa: E402


def state(positions: dict[str, tuple[float, int]] | None = None, equity: float = 10_000.0) -> dict:
    """A minimal clearinghouseState: {coin: (szi, leverage)}."""
    return {
        "marginSummary": {"accountValue": str(equity), "totalNtlPos": "0"},
        "assetPositions": [
            {"position": {"coin": c, "szi": str(szi), "entryPx": "100", "leverage": {"type": "cross", "value": lev}}}
            for c, (szi, lev) in (positions or {}).items()
        ],
    }


class FakeHL:
    """In-memory stand-in for HLClient."""

    def __init__(self):
        self.states: dict[tuple[str, str], dict] = {}
        self.mids = {"mainnet": {"BTC": 100_000.0, "ETH": 4_000.0, "kPEPE": 0.01}, "testnet": {"BTC": 100_000.0, "ETH": 4_000.0}}
        self.meta = {
            net: {
                "BTC": {"szDecimals": 5, "maxLeverage": 40, "isDelisted": False},
                "ETH": {"szDecimals": 4, "maxLeverage": 25, "isDelisted": False},
            }
            for net in ("mainnet", "testnet")
        }
        self.agents: dict[tuple[str, str], list[dict]] = {}
        self.roles: dict[tuple[str, str], dict] = {}

    def clearinghouse_state(self, user, network="mainnet"):
        return self.states.get((user, network), state())

    def all_mids(self, network="mainnet"):
        return self.mids[network]

    def perp_meta(self, network="mainnet"):
        return self.meta[network]

    def extra_agents(self, user, network):
        return self.agents.get((user, network), [])

    def user_role(self, user, network):
        return self.roles.get((user, network), {"role": "missing"})


@pytest.fixture
def fresh_db(tmp_path: Path):
    db.configure(tmp_path / "test.db")
    db.init()
    yield


@pytest.fixture
def hl():
    return FakeHL()
