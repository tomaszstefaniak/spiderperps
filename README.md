# SpiderPerps

**Copy the best Hyperliquid traders from your phone. Approve every trade. Keep your keys.**

SpiderPerps finds traders worth following on Hyperliquid, alerts you the moment one of them opens, adds to, cuts, closes or flips a position, and lets you copy the move with one tap. The copy is sized to your account and protected by your own stop-loss. Your phone signs it and sends it straight to Hyperliquid.

```
 Hyperliquid (mainnet, public data)
   ├─ leaderboard (~47k accounts) ──▶ discovery: screen ─▶ deep-score ─▶ ranked traders
   └─ followed traders' positions ──▶ watcher (every 5s): diff ─▶ size a copy per follower
                                                                        │ push notification
                                                                        ▼
                                                    phone: review ─ Face ID ─ sign with agent key
                                                                        │ order + native stop-loss
                                                                        ▼
                                                                  Hyperliquid
```

## Why

- **Finding someone worth copying is the hard part.** Ranking Hyperliquid's leaderboard by ROI is misleading: ROI is measured against the equity at the start of the window, so an account that deposits mid-month shows hundreds of percent, and the top PnL rows are market makers nobody can copy. SpiderPerps scores traders on returns that are **time-weighted from Hyperliquid's PnL history** (which excludes deposits and withdrawals), drawdown, winning weeks, holding time, the share of their volume in markets we can copy, and how much recent trading we've actually seen.
- **Copy-trading bots usually hold your keys.** Here the server never sees a key. Your phone creates a Hyperliquid *agent key*, stores it in the iOS Keychain / Android Keystore, and you approve it once from your wallet. Agent keys can place orders but **can't withdraw or transfer funds**, and you can revoke them on Hyperliquid at any time.
- **A human approves every copy**, so the ranking favors traders who hold positions for hours or days rather than scalpers.

**Live:** https://spiderperps.91-228-199-238.sslip.io · rankings, trader reports, phone approval, browser trading (testnet)

## What's in the repo

| Folder | What | Stack |
|---|---|---|
| [`backend/`](backend/README.md) | Watcher, copy sizing, copy ledger, push, sign-in, discovery scoring, `/v1` API | Python 3.12, FastAPI, SQLite |
| [`mobile/`](mobile/README.md) | The app: Discover, Inbox, Review & approve, Following, Settings | Expo SDK 57 / React Native, TypeScript |
| [`web/`](web/) | Landing page with trader rankings, trader profiles, the phone approval page (`/link`), and an order ticket that signs in the browser (`/trade`) | Next.js 16, React 19 |
| [`deploy/`](deploy/README.md) | One-VPS production stack with automatic HTTPS | Docker Compose, Caddy |

Order signing uses [`@nktkas/hyperliquid`](https://github.com/nktkas/hyperliquid). Its signatures were verified byte-for-byte against Hyperliquid's official Python SDK for orders with stop-loss/take-profit, leverage changes and agent approval.

## Run locally

```bash
# backend (Python 3.12)
cd backend && python3.12 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/uvicorn app:app --host 0.0.0.0 --port 8790 --reload     # tests: .venv/bin/pytest -q

# web (Node 20+, pnpm 10)
cd web && npx pnpm@10.11.0 install && echo 'HL_SERVICE_URL=http://127.0.0.1:8790' > .env.local && npx next dev

# mobile (Node 22)
cd mobile && npm install && cp .env.example .env && npx expo start --ios
```

Use **testnet** in the app to copy real mainnet traders with test funds.

## Hackathon disclosure (Colosseum Crypto World's Fair)

Work before the contest window (2026-09-14 → 2026-10-12) is kept in the history and labelled:

- `web/`: an order-ticket UI forked from an earlier Solana DEX, Hyperliquid market orders through a FastAPI backend holding one server-side key, a "follow wallet" list and a view of a followed wallet's positions. The commit "Pre-hackathon baseline" holds work that was never committed before the contest (files last modified 2026-01-23).
- `backend/`: FastAPI order and market-data endpoints in `app.py` that traded with one server-side key. They were removed during the contest; trading now signs on the user's device.

Everything else was built during the contest: the non-custodial copy-trading service (`backend/copytrade/`), discovery scoring, the mobile app, phone approval and sign-in, browser-signed trading with real TP/SL on the web, the landing and trader pages, deployment, and the toolchain upgrades and bug fixes recorded in the history.

## License

MIT, see [LICENSE](LICENSE).
