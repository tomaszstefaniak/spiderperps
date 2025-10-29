# hl-service

FastAPI backend for Hyperliquid perps utilities.

## Dev
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # then edit values
uvicorn app:app --reload
