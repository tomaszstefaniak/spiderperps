# Colosseum Crypto World's Fair: submission kit

Deadline: **2026-10-12 23:59 PT**. Track: **Hyperliquid**.

## Form fields (copy-paste)

**Product name:** SpiderPerps

**Tagline:** Copy the best Hyperliquid traders from your phone. Approve every trade. Keep your keys.

**Short description**
SpiderPerps finds Hyperliquid traders worth copying and puts their moves on your phone. When someone you follow opens, adds to, cuts or closes a position, you get a push notification with a copy sized to your account and protected by your own stop-loss. One tap and Face ID later, your phone signs the order and sends it straight to Hyperliquid. Our server never holds a key.

**Long description**
Copy trading on perps has two problems: finding someone worth copying, and handing your keys to a bot.

*Finding traders.* Hyperliquid's public leaderboard has ~47,000 accounts, but ranking it by ROI is misleading: ROI is measured against the equity at the start of the window, so an account that deposits mid-month shows hundreds of percent, and the top PnL rows are market makers nobody can copy. SpiderPerps screens the leaderboard (equity, consistent profit, turnover typical of a discretionary trader) and deep-scores the best accounts from their Hyperliquid history: returns time-weighted from the PnL history (deposits and withdrawals don't count as performance), max drawdown, winning weeks, median holding time, the share of volume in markets we can copy, account size and sample size. The result is a 0–100 copyability score with plain-language reasons ("+36% 30d, max drawdown 13%, holds ~4d, 79 trades"). Any wallet can be scored on demand.

*Keeping your keys.* The phone creates a Hyperliquid agent key and stores it in the iOS Keychain. You approve it once from your wallet. Agent keys can place orders but can't withdraw or transfer funds, and you can revoke them on Hyperliquid any time. The server only reads public data and proposes trades; every order is signed on your device.

*Copying.* A watcher polls followed traders every 5 seconds and turns each move into a proposal sized to your equity (with multiplier, per-trade cap and leverage cap). A copy ledger makes sure reductions and closes only touch what you copied, never positions you opened yourself. Approved copies go out as one IOC order with your stop-loss/take-profit attached as native Hyperliquid trigger orders. On testnet you can paper-copy real mainnet traders with zero risk.

**Blockchains / tools integrated**
- Hyperliquid HyperCore: Info API (leaderboard, portfolio PnL history, fills, clearinghouse state, meta, mids, extraAgents/userRole); Exchange API (approveAgent, updateLeverage, IOC orders with native TP/SL via grouping `normalTpsl`)
- `@nktkas/hyperliquid` TypeScript SDK (signatures verified byte-for-byte against Hyperliquid's official Python SDK), viem
- Mobile: Expo SDK 57 / React Native, expo-secure-store (Keychain/Keystore), expo-notifications (APNs/FCM via Expo push), expo-local-authentication (Face ID)
- Backend: Python, FastAPI, SQLite; Web: Next.js 16; Deploy: Docker Compose + Caddy

**GitHub:** https://github.com/tomaszstefaniak/spiderperps (MIT)

**Live site:** _add after deploy_

**Logo:** `brand/spiderperps-logo-1024.png`

**Team:** Tomasz Stefaniak (solo). Location: _fill in_

**Go-to-market**
- *Who:* retail perp traders who want to follow smart money from their phone but won't hand their keys to a bot or a custodial copy-trading service. Hyperliquid's user base is exactly this crowd, and today they copy trades through Telegram bots that hold keys.
- *Acquisition:* zero-risk start (testnet paper-copying of real traders), shareable trader pages with a copyability score (built for X/Telegram sharing and search), a weekly "most copyable traders" post, and Hyperliquid community channels.
- *Revenue:* Hyperliquid builder codes, a small fee (e.g. 0.05%) on each copied order, approved once by the user and enforced by Hyperliquid itself. Later, a premium tier with more followed traders, faster alerts and deeper analytics.
- *Moat:* the scoring (what makes a trader followable by a human, not just profitable) and a non-custodial mobile flow.
- *Next:* builder fee, HIP-3 markets, Android release, organization developer account for the public App Store.

**Prior work (disclosure)**
The repo history keeps pre-contest work separate and labelled. Before 2026-09-14 this project was a web order ticket forked from an earlier Solana DEX, placing Hyperliquid market orders through a FastAPI backend that held one server-side key, plus a "follow wallet" list. Uncommitted work from before the contest is in the commit "Pre-hackathon baseline" (files last modified 2026-01-23). Everything else was built during the contest: the non-custodial copy-trading service, discovery scoring, the mobile app, phone approval and sign-in, browser-signed trading with native TP/SL, the public pages, and deployment. The server-key trading was removed.

## Pitch video (2:00 target)

| Time | Show | Say |
|---|---|---|
| 0:00–0:12 | You, then the icon | "Everyone on Hyperliquid wants to trade like the best traders. SpiderPerps lets you copy them from your phone, approving every trade, without ever giving up your keys." |
| 0:12–0:40 | Leaderboard ROI vs our ranking | "Two problems. Finding someone worth copying: the leaderboard's ROI rewards deposits and market makers. And copy bots want your private key." |
| 0:40–1:15 | Phone: Discover → profile → push → approve → filled | "We score 47,000 accounts on deposit-adjusted returns, drawdown and how long they hold, so a human can follow them. When a trader you follow moves, your phone buzzes with a copy sized to your account and your own stop-loss. Face ID, and it's on Hyperliquid." |
| 1:15–1:35 | Diagram: phone signs, server can't | "Your phone holds a Hyperliquid agent key in the Keychain. It can trade, but never withdraw. Our server only reads public data. There's nothing to steal." |
| 1:35–1:55 | Business slide | "We earn through Hyperliquid builder codes: a small fee per copied order, enforced on-chain. Start risk-free by paper-copying real traders on testnet." |
| 1:55–2:00 | Logo + GitHub | "SpiderPerps. Copy smart money, keep your keys." |

## Product demo video (≤ 3:00): shot list

Setup: backend in demo mode (`COPY_LEADER_NETWORK=testnet`), two MetaMask testnet accounts (A = "leader" with testnet USDC, B = you).

1. **Website** (0:10): landing page, trader ranking, open one trader profile.
2. **Phone, Discover** (0:15): ranked traders, tap one, show the score and reasons.
3. **Connect** (0:30): Connect → Testnet → approve the phone's key with wallet B (MetaMask) → back in the app, signed in. Point out "can trade, can't withdraw".
4. **Follow** (0:10): paste wallet A in Discover → Follow.
5. **Leader trades** (0:15): in Hyperliquid testnet with wallet A, open an ETH long.
6. **Notification** (0:40): phone lock screen buzzes ("0x… opened ETH LONG · Copy: BUY 0.05 ETH · SL 5%") → tap → Review: size, live price, stop-loss price, slippage → Approve → Face ID → "Filled".
7. **Proof** (0:15): Hyperliquid testnet shows B's position with the stop-loss order attached.
8. **Leader closes** (0:20): wallet A closes → phone proposes a reduce-only close of exactly what was copied → approve → flat.
9. **Settings** (0:10): multiplier, max per trade, default stop-loss, Face ID.
10. **End card** (0:05): GitHub link.
