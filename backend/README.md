# hl-service

Backend for **HL Copy**: follow the best Hyperliquid traders and copy their moves from your phone, approving every trade yourself.

The service **never holds a user key**. It watches the traders you follow, sizes a copy of each of their moves for your account, and pushes it to your phone. Your phone signs the order with a Hyperliquid *agent key* that lives in the phone's secure storage and sends it to Hyperliquid directly. Agent keys can place orders but can't withdraw or transfer funds, and you can revoke them on Hyperliquid at any time.

```
 leader wallets (mainnet, public data)
        │ poll positions every 5s
        ▼
 ┌─────────────┐   proposal (sized, with stop-loss)   ┌──────────┐  signed order  ┌─────────────┐
 │ hl-service  │ ───────────── push ────────────────▶ │  phone   │ ─────────────▶ │ Hyperliquid │
 │ (no keys)   │ ◀──── decision + filled size ─────── │ (agent   │                └─────────────┘
 └─────────────┘                                      │  key)    │
                                                      └──────────┘
```

## What's in `copytrade/`

| Module | What it does |
|---|---|
| `watcher.py` | Polls followed leaders, diffs positions (open / increase / decrease / close / flip), creates a proposal per follower, batches and rate-limits pushes |
| `sizing.py` | Copies opens in proportion to the two accounts' equity × your multiplier, capped per trade and by max leverage. Reductions mirror the *fraction* the leader took off |
| `db.py` | SQLite. Includes the **copy ledger**: reductions and closes only ever touch what you copied from that leader, never positions you opened yourself |
| `auth.py` | Sign-in by signing a one-time challenge with your main wallet or an agent key. Agent keys are checked against Hyperliquid (`extraAgents` / `userRole`) |
| `scoring.py`, `discovery.py` | Finds wallets worth following (below) |
| `push.py` | Expo push (APNs + FCM) |
| `hlapi.py` | Rate-limited Hyperliquid `/info` client sharing the 1200-weight/min budget |
| `api.py` | HTTP API under `/v1` |

### Paper copying
Leaders are always read from **mainnet**; each follower executes on the network their agent key was approved on. A **testnet** account therefore copies real mainnet traders with test funds - safe to try and to demo.

### Finding wallets worth following
Hyperliquid's public leaderboard has ~47k accounts, but ranking it by ROI is misleading: ROI is measured against the equity at the start of the window, so a wallet that deposits into an empty account shows absurd returns, and the top PnL rows are market makers nobody can copy.

1. **Screen** the leaderboard: ≥ $25k equity, profitable week/month/all-time, monthly ROI 5–500%, turnover 1–60× equity (excludes market makers and idle wallets). ~1,200 pass.
2. **Deep-score** the best ~120 from their portfolio history and fills:
   - returns are **time-weighted from Hyperliquid's PnL history**, which excludes deposits and withdrawals
   - max drawdown, share of winning weeks
   - **median holding time**: every copy waits for a human, so scalpers can't be followed
   - share of volume in markets we can copy (main-dex perps, not HIP-3 or spot)
   - sample size (closed round trips in 14 days)

   Copyability, a drawdown gate (no penalty below 30%, 0.3× at 80%+) and confidence multiply the score, so an uncopyable or reckless wallet can't rank high on returns alone.

Any address can also be scored on demand: `GET /v1/leaders/{address}`.

## Run

Python 3.12 (some `eth-*` wheels lag behind the newest CPython).

```bash
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env          # copy-trading needs no keys; see the file for tuning knobs
uvicorn app:app --host 0.0.0.0 --port 8787 --reload
python -m copytrade.discovery --deep 120   # optional: score traders now instead of waiting for the background job
pytest -q                                  # 44 tests
```

## API (`/v1`)

| | |
|---|---|
| `POST /auth/challenge`, `POST /auth/verify` | sign in with a wallet or agent signature → bearer token |
| `POST /links`, `GET /links/{agent}` | the web approval page reports which account approved a phone's agent |
| `GET /me`, `PUT /me/settings` | multiplier, max per trade, max leverage, stop-loss %, take-profit %, notify_info |
| `POST /devices` | register an Expo push token |
| `GET/POST /follows`, `DELETE /follows/{leader}` | who you follow (with what you've copied from each) |
| `GET /proposals`, `POST /proposals/{id}/decision` | inbox; the phone reports approved + filled size, rejected, or failed |
| `GET /discover`, `GET /leaders/{address}` | ranked traders; any wallet's copyability report |

## Legacy endpoints

`app.py` still serves the pre-hackathon endpoints used by the web order ticket (`/order/market`, `/balances`, …). They trade with the single server-side key in `.env` (`HL_SECRET_KEY`) and are meant for local testnet development only. **Don't expose them publicly**: anyone who can reach them can trade that account.
