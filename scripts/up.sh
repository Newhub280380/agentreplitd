#!/usr/bin/env bash
# Одна команда: Postgres, .env, схема БД, agent-engine (8000), API (8080), панель (25580).
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { cp .env.example .env; echo "Создан .env из .env.example"; }
if grep -q '^SESSION_SECRET=$' .env; then
  sed -i "s/^SESSION_SECRET=$/SESSION_SECRET=$(openssl rand -hex 32)/" .env
fi
set -a; source .env; set +a

if [ -z "${CLERK_SECRET_KEY:-}" ] || [ -z "${CLERK_PUBLISHABLE_KEY:-}" ]; then
  echo "Нет ключей Clerk. Впишите CLERK_SECRET_KEY и CLERK_PUBLISHABLE_KEY в .env" >&2
  echo "(https://dashboard.clerk.com → ваш проект → API Keys) и запустите снова." >&2
  exit 1
fi
[ -n "${AI_INTEGRATIONS_OPENAI_API_KEY:-}" ] || echo "ВНИМАНИЕ: нет AI_INTEGRATIONS_OPENAI_API_KEY — агенты будут без LLM."

if [[ "$DATABASE_URL" == *@localhost:5432/agent360 ]]; then
  if ! command -v psql >/dev/null 2>&1; then
    echo "PostgreSQL не найден, ставлю пакет…"
    sudo apt-get update && sudo apt-get install -y postgresql
  fi
  sudo service postgresql start >/dev/null 2>&1 || true
  for _ in $(seq 1 15); do sudo -u postgres pg_isready -q && break; sleep 1; done
  sudo -u postgres psql -qtAc "SELECT 1 FROM pg_roles WHERE rolname='agent360'" | grep -q 1 \
    || sudo -u postgres psql -qc "CREATE USER agent360 WITH PASSWORD 'agent360' SUPERUSER;"
  sudo -u postgres psql -qtAc "SELECT 1 FROM pg_database WHERE datname='agent360'" | grep -q 1 \
    || sudo -u postgres psql -qc "CREATE DATABASE agent360 OWNER agent360;"
fi

command -v pnpm >/dev/null || npm i -g pnpm@10
pnpm install --frozen-lockfile
pnpm --dir lib/db run push-force
command -v uv >/dev/null || pip install --user uv
uv sync --frozen

export VITE_CLERK_PUBLISHABLE_KEY="$CLERK_PUBLISHABLE_KEY" BASE_PATH=/
pids=()
trap 'kill "${pids[@]}" 2>/dev/null || true' EXIT INT TERM
.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000 --app-dir services/agent-engine & pids+=($!)
PORT=8080 pnpm --dir artifacts/api-server run dev & pids+=($!)
PORT=25580 pnpm --dir artifacts/agent-multitool-360 run dev & pids+=($!)
sleep 8
echo
echo "Панель: http://localhost:25580   API: http://localhost:8080/api/healthz   Движок: http://localhost:8000/healthz"
echo "Остановить: Ctrl+C"
wait -n
