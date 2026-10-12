// pm2 processes for a VPS that already runs nginx (see deploy/README.md, "Next to existing sites").
// Code lives in /opt/spiderperps; both processes listen on localhost only, nginx terminates HTTPS.
module.exports = {
  apps: [
    {
      name: 'spiderperps-api',
      cwd: '/opt/spiderperps/backend',
      script: '.venv/bin/uvicorn',
      args: 'app:app --host 127.0.0.1 --port 8790',
      interpreter: 'none',
      env: { COPY_DB_PATH: '/opt/spiderperps/data/copytrade.db' },
    },
    {
      name: 'spiderperps-web',
      cwd: '/opt/spiderperps/web/.next/standalone',
      script: 'server.js',
      env: { NODE_ENV: 'production', PORT: '3100', HOSTNAME: '127.0.0.1', HL_SERVICE_URL: 'http://127.0.0.1:8790' },
    },
  ],
};
