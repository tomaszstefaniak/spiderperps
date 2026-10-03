# Deploying to a VPS

One machine runs the whole stack: the API, the web app and Caddy, which gets HTTPS certificates automatically. The server holds **no private keys**.

Requirements: a Linux VPS (1 GB RAM is enough), ports 80 and 443 free, a domain with an **A record** pointing at the VPS. HTTPS isn't optional: iOS apps and MetaMask mobile refuse plain http.

```bash
# on the VPS (Ubuntu/Debian)
curl -fsSL https://get.docker.com | sh
git clone <this repo> spiderperps && cd spiderperps/deploy
cp .env.example .env        # set DOMAIN and ACME_EMAIL
docker compose up -d --build
docker compose logs -f api  # first trader scoring takes ~7 minutes
```

Then:
- `https://DOMAIN/` web app, `https://DOMAIN/link` phone approval page
- `https://DOMAIN/v1/discover` ranked traders (API)
- In `mobile/eas.json` set `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_WEB_URL` to `https://DOMAIN` and rebuild the app

Update: `git pull && docker compose up -d --build`. Data (SQLite) lives in the `api-data` volume; back it up with
`docker compose cp api:/data/copytrade.db ./backup.db`.
