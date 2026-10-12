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

## Next to existing sites (what the live server uses)

If the VPS already runs nginx (ports 80/443 taken), skip Docker and run the two processes with pm2:

```bash
git clone https://github.com/tomaszstefaniak/spiderperps.git /opt/spiderperps && mkdir -p /opt/spiderperps/data
apt-get install -y python3.12-venv
cd /opt/spiderperps/backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
/opt/spiderperps/deploy/update.sh                      # builds the web app, starts both pm2 processes
sed "s/SERVER_NAME/your.domain/" /opt/spiderperps/deploy/nginx-spiderperps.conf > /etc/nginx/sites-available/spiderperps
ln -s /etc/nginx/sites-available/spiderperps /etc/nginx/sites-enabled/ && nginx -t && systemctl reload nginx
certbot --nginx -d your.domain --redirect
```

No domain? `<name>.<ip-with-dashes>.sslip.io` resolves to the server and gets a normal Let's Encrypt certificate.
Updates: `/opt/spiderperps/deploy/update.sh`.
