# Агент-мультитул 360

Панель для анализа рынка, генерации контента, сборки приложений и управления AI-агентами. Её собрал Replit Agent в августе 2026. Раньше проект лежал только в ветках `replit-main` и `subrepl-*`, а `main` был пустым.

## Состав

| Папка | Что внутри |
|---|---|
| `artifacts/agent-multitool-360` | React + Vite: лендинг, вход через Clerk, командный центр |
| `artifacts/api-server` | Express 5 API: воркспейсы, квоты, тарифы, каналы (Telegram / VK / Instagram), Stripe |
| `services/agent-engine` | Python FastAPI + LangGraph: исполнитель агентов (`/execute`, `/healthz`) на порту 8000 |
| `lib/db` | Drizzle ORM, схема PostgreSQL |
| `lib/api-spec`, `lib/api-zod`, `lib/api-client-react` | OpenAPI-контракт и сгенерированные клиенты |
| `artifacts/mockup-sandbox` | песочница UI-макетов |
| `external/omnibot` | форк OpenOmniBot (Android/Flutter), отдельный проект со своей лицензией |

## Запуск

Нужны Node 22+, pnpm 10, Python 3.11 и PostgreSQL.

```bash
pnpm install
export DATABASE_URL=postgres://...      # обязательно
export SESSION_SECRET=...                # шифрует токены каналов, без него подключение каналов падает
export CLERK_SECRET_KEY=... CLERK_PUBLISHABLE_KEY=...   # вход пользователей
export AI_INTEGRATIONS_OPENAI_BASE_URL=... AI_INTEGRATIONS_OPENAI_API_KEY=...  # LLM для agent-engine
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run dev
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --app-dir services/agent-engine
pnpm --filter @workspace/agent-multitool-360 run dev
```

## Проверки

```bash
pnpm run typecheck   # tsc по всем пакетам + регрессия безопасности (нужны переменные выше)
pnpm run build
```

Подробная архитектура описана в `replit.md`.
