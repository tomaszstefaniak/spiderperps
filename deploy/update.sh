#!/usr/bin/env bash
# Pull and redeploy on the VPS (pm2 + nginx setup). Run as root from anywhere.
set -euo pipefail
cd /opt/spiderperps
git pull --ff-only
backend/.venv/bin/pip install -q -r backend/requirements.txt
cd web
npx -y pnpm@10.11.0 install --frozen-lockfile
NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=1024 npx -y pnpm@10.11.0 build
cp -r public .next/standalone/
rm -rf .next/standalone/.next/static && cp -r .next/static .next/standalone/.next/
pm2 startOrReload /opt/spiderperps/deploy/pm2.config.cjs --update-env
pm2 save
