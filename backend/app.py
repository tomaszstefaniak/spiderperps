"""SpiderPerps API: the copy-trading service in copytrade/. It holds no private keys.

Run: uvicorn app:app --host 0.0.0.0 --port 8790
"""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
# Real environment variables (e.g. from docker compose) win over the local .env file.
load_dotenv(dotenv_path=Path(__file__).with_name(".env"))

# Imported after load_dotenv: copytrade.config reads the environment at import time.
from copytrade import api as copy_api, db as copy_db, runner as copy_runner  # noqa: E402


@asynccontextmanager
async def lifespan(_app: FastAPI):
    copy_db.init()
    workers = copy_runner.start()
    yield
    copy_runner.stop(workers)


app = FastAPI(title="SpiderPerps API", lifespan=lifespan)
# Bearer tokens, no cookies - so allowing any origin doesn't expose sessions.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(copy_api.router)


@app.get("/health")
def health():
    return {"ok": True}
