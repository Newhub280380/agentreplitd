# Агент-мультитул 360

Единая операционная панель для анализа рынка, генерации контента, сборки приложений и оркестрации AI-агентов.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API/control plane
- `python -m uvicorn main:app --host 0.0.0.0 --port 8000 --app-dir services/agent-engine` — run the FastAPI/LangGraph runtime
- `pnpm --filter @workspace/agent-multitool-360 run dev` — run the React command center
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/scripts run security-test` — run authentication, workspace-isolation, and quota regression checks
- `pnpm --filter @workspace/scripts run stripe-webhook-test` — run the opt-in Stripe test-mode checkout and managed-webhook delivery regression
- `pnpm --filter @workspace/scripts run stripe-webhook-browser-test` — hold real test-mode hosted Checkout sessions for browser completion, then verify their webhook lifecycle
- `pnpm --filter @workspace/scripts run stripe-webhook-browser-release-test` — keep the hosted Checkout release gate alive for a Playwright harness; read the printed session manifest, complete Starter and Pro, then write its completion marker
- `pnpm run build` — typecheck + build all packages; frontend builds use their
  artifact defaults when `PORT` and `BASE_PATH` are not set
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API/control plane: Express 5
- Agent runtime: Python 3.11, FastAPI, LangGraph
- DB: PostgreSQL + Drizzle ORM
- Auth: Replit-managed Clerk with branded in-app sign-in and sign-up pages
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/agent-multitool-360` — SaaS landing page, Clerk account flow, and authenticated command center.
- `artifacts/api-server/src/routes/agent360.ts` — typed REST endpoints, ownership enforcement, quotas, and plan data.
- `artifacts/api-server/src/lib/agent360-store.ts` — PostgreSQL store for workspaces, quotas, agent data, and activity journal.
- `services/agent-engine/main.py` — FastAPI + LangGraph runtime with YouTube/yt-dlp, hybrid web search, and LLM summarization adapters.
- `lib/api-spec/openapi.yaml` — source-of-truth API contract; generated clients live under `lib/api-client-react` and `lib/api-zod`.
- `lib/db/src/schema/agent360.ts` — PostgreSQL tables for runs, insights, content, builder jobs, activity, and memories.

## Architecture decisions

- The Express API is the product control plane; the Python service is a separately restartable agent runtime.
- Replit PostgreSQL is the default durable store. It stores agent memory records and can be upgraded to vector embeddings without moving the product to an external database.
- External channels expose explicit `needs_setup` status until their accounts are authorized; no tokens are embedded in source.
- Builder instructions are allowlist-validated and staged by default; arbitrary shell commands are never accepted from the UI.
- The OpenAPI contract is regenerated before client or server types are consumed.
- Each Clerk user maps to one local workspace. All agent-owned records are filtered by that workspace in the data store, not merely hidden in the UI.
- Tiers are product configuration only until a payment provider is intentionally selected and connected. The current product never creates a charge.

## Product

Guests see a product landing page and can create an account. Every account receives an isolated workspace with a Basic plan and monthly usage limits for runs, content, and builder jobs. Authenticated users access the command center to run natural-language workflows, inspect agents, review trend insights, generate content, inspect builder logs, and see account usage.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The Python runtime must be running for live collection and LLM summaries; the control plane has a safe fallback if it is restarting.
- Telegram, VK, payment, and search adapters are intentionally visible as `needs_setup` until a provider connection or protected env configuration exists.
- Run `pnpm --filter @workspace/api-spec run codegen` after every OpenAPI change.
- Clerk browser sessions use same-origin cookies. Do not add bearer-token plumbing to the web client; protect server routes with Clerk middleware instead.
- Clerk has isolated Development and Production user directories; test accounts created in preview are not production customers.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
