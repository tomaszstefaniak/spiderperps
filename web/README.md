# DEX-Next (Solana + Raydium) – Quick Start

This repo is ready to run out-of-the-box; the **only thing you _must_ edit is `src/utils/config.ts`**.  
Everything else will work with the defaults.

---

## 1 Edit `config.ts`

| Constant            | What it does | **Change to…** |
|---------------------|--------------|----------------|
| `FEE_WALLET`        | Where swap-fees are sent. | **Your Solana public key.** |
| `FEE_RATE`          | Fee percentage (e.g. `0.0005` = 0 .05 %). | Any value ≥ 0 (or `0` to disable). |
| `INITIAL_RPCS`      | Fallback RPC list. First item becomes the default. | Replace with your own RPC(s) / keys. |
| `POPULAR_TOKENS`    | Tokens pinned at the top of the selector. | Add / remove mint addresses as you like. |
| *(optional)* `BACKGROUND_IMAGES` | Landing-page slideshow. | Swap images or remove entries. |

Environment variables **override** the file at build-time  
(e.g. `REACT_APP_FEE_WALLET`, `REACT_APP_FEE_RATE`, `REACT_APP_DEFAULT_RPC`).  
Use them in CI / hosting if you prefer _not_ to commit secrets.

# - After each change in `config.ts`, run the following:
cd ~/apps/dex-next  
rm -rf .next  
su - deploy  
npm run build  
pm2 restart dex-next

---

## 2 Run Locally

`bash`
# - install deps (pnpm recommended, npm works too)
pnpm install

# 2 - start dev server
pnpm dev          # → http://localhost:3000
