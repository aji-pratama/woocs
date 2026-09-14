# WooCS.ai — Cloudflare Workers Deployment Plan

> **Status:** Draft / Active  
> **Target:** Cloudflare Workers (Serverless Edge) for Hono API  
> **CI/CD:** GitHub Actions (`cloudflare/wrangler-action`)  
> **Database:** Neon Serverless PostgreSQL (pgvector)  
> **AI Gateway:** OpenRouter  

---

## 1. Overview & Architecture

WooCS.ai backend is built with [Hono](https://hono.dev), which is natively designed to run on Cloudflare Workers as first-class citizens. Unlike traditional VPS hosting that requires configuration management tools like Ansible, Cloudflare Workers deployments are declarative, fast, and serverless.

### Architectural Invariants
1. **Edge Runtime:** Cloudflare Workers V8 isolates with `compatibility_flags = ["nodejs_compat"]`.
2. **Database Connectivity:** Direct TCP / WebSocket connections to Neon PostgreSQL with connection pooling (`sslmode=require`), supported by `postgres.js` and `nodejs_compat`.
3. **No Ansible Needed:** All infrastructure and edge routing are declared in `wrangler.jsonc` and deployed via Wrangler CLI / GitHub Actions.
4. **Dual Runtime Compatibility:** Local development continues using Node.js (`make dev`, `tsx watch`) with zero friction, while production deploys cleanly to Cloudflare Workers.
5. **Background Task Execution:**
   - **Local / VPS:** Long-running polling worker `api/src/worker/index.ts` (`make api-worker`).
   - **Cloudflare Workers:** Non-blocking async dispatch via `c.executionCtx.waitUntil(...)` on API trigger (catalog sync, knowledge processing) and/or Cloudflare Cron Triggers (`scheduled`), updating `task_records` in Neon PostgreSQL for real-time status polling by the WordPress plugin.

---

## 2. Actionable Checklist

### Phase 1: Wrangler Configuration & Scripts
- [x] Add `wrangler` dev dependency to `api/package.json`.
- [x] Add scripts to `api/package.json`:
  - `"cf:dev": "wrangler dev"`
  - `"cf:deploy": "wrangler deploy"`
- [x] Create `api/wrangler.jsonc` with:
  - `name: "woocs-api"`
  - `main: "src/index.ts"`
  - `compatibility_date: "2024-09-23"`
  - `compatibility_flags: ["nodejs_compat"]`
  - Variables: `NODE_ENV`, `OPENROUTER_BASE_URL`, `AI_CHAT_MODEL`, `AI_EMBEDDING_MODEL`, etc.

### Phase 2: Dual Runtime Environment & Database Adaptation
- [x] Ensure `api/src/config/env.ts` gracefully reads from both `process.env` (Node.js & Workers with nodejs_compat) and Hono context bindings (`c.env`).
- [x] Ensure `api/src/db/client.ts` uses connection pooling suitable for serverless worker lifecycles (Neon pooled connection string).

### Phase 3: Background Tasks on Cloudflare Workers
- [x] Create task runner helper `api/src/worker/runner.ts` exporting `executeTaskById(taskId)` and `safeWaitUntil` so both the background polling worker and the edge worker can execute tasks identically.
- [x] In `api/src/routes/store.ts`, when tasks are inserted into `task_records`:
  - If `c.executionCtx?.waitUntil` is available (Cloudflare Workers runtime), trigger `safeWaitUntil(c, executeTaskById(task.id))` in the background.
  - Return HTTP 202 Accepted immediately to the WordPress plugin.
  - If running in standalone Node.js, `task_records` will be picked up by the polling worker as before.

### Phase 4: CI/CD Pipeline (GitHub Actions)
- [x] Create `.github/workflows/deploy-api.yml` with:
  - Trigger: Push to `main` branch when `api/**` changes.
  - Jobs:
    1. Lint and type-check (`npm run lint` / `tsc --noEmit`).
    2. Automated tests (`npm test`).
    3. Deploy to Cloudflare Workers using `cloudflare/wrangler-action@v3`.
  - Document required repository secrets:
    - `CLOUDFLARE_API_TOKEN`
    - `DATABASE_URL`
    - `OPENROUTER_API_KEY`
    - `POLAR_ACCESS_TOKEN`
    - `POLAR_WEBHOOK_SECRET`

### Phase 5: Makefile & Developer Experience
- [x] Add `cf-dev` and `cf-deploy` shortcuts in root `Makefile`.
- [x] Verify local tests (`make test-all`), dry-run build (`npx wrangler deploy --dry-run`), and linting (`make lint`).

---

## 3. Environment Variables & Cloudflare Secrets

| Secret / Var | Type | Description |
|---|---|---|
| `DATABASE_URL` | Secret | Neon PostgreSQL pooled connection string (`postgres://...sslmode=require`) |
| `OPENROUTER_API_KEY` | Secret | OpenRouter API Key for Chat & Embeddings |
| `POLAR_ACCESS_TOKEN` | Secret | Polar API access token |
| `POLAR_WEBHOOK_SECRET` | Secret | Polar webhook signature verification secret |
| `NODE_ENV` | Variable | `production` |
| `OPENROUTER_BASE_URL` | Variable | `https://openrouter.ai/api/v1` |
| `AI_CHAT_MODEL` | Variable | `openai/gpt-4o-mini` (or configurable model) |
| `AI_EMBEDDING_MODEL` | Variable | `openai/text-embedding-3-small` |
| `POLAR_API_URL` | Variable | `https://api.polar.sh` |
| `POLAR_PRO_PRODUCT_ID` | Variable | Polar Pro subscription product ID |
