FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    COPY_DB_PATH=/data/copytrade.db

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

VOLUME /data
EXPOSE 8790
# Behind Caddy: trust X-Forwarded-* from the reverse proxy on the compose network.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8790", "--proxy-headers", "--forwarded-allow-ips", "*"]
