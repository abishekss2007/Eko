# syntax=docker/dockerfile:1

# ---- 1. Build the React frontend ----
FROM node:22-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- 2. Install Python dependencies ----
FROM python:3.12-slim AS deps
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
COPY backend/requirements.txt /tmp/requirements.txt
RUN python -m venv /venv && /venv/bin/pip install -r /tmp/requirements.txt

# ---- 3. Runtime: FastAPI serves /api/* and the static frontend ----
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PATH="/venv/bin:$PATH" \
    STATIC_DIR=/app/static PORT=8080
RUN useradd --create-home --uid 10001 appuser
WORKDIR /app
COPY --from=deps /venv /venv
COPY backend/app ./app
COPY --from=frontend /frontend/dist ./static
USER appuser
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request,os;urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/api/health')"
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
