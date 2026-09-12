# WooCS.ai — Development Plan

> **Note:** Scaffolding and Phases 1 through 5 have been completed and moved to `_docs/CHANGELOG.md`.

## Active Feature Plans

- Continue the remaining behavioral verification in `_docs/plans/rag.md`.
- Hono JS backend migration plan and schema specification in `_docs/plans/hono-backend-migration.md`.

## Subscription foundation

- [x] Define backend, WordPress plugin, and React application boundaries in `_docs/architecture.md`.
- [x] Implement Store-owned Polar checkout, subscription projection, webhook idempotency, and one active-subscription gate.
- [x] Connect the WordPress Plan & Billing journey to Polar-hosted checkout and Customer Portal.
- [ ] Implement tier differentiation: Free tier (Basic FAQ only, conversation limits) vs Paid tier (Full product catalog sync).
- [ ] Configure Polar sandbox products and verify checkout/webhook end to end.
- [ ] Implement API-key rotation when production onboarding requires it.
- [ ] Define merchant accounts only when a standalone dashboard becomes a concrete requirement.
- [ ] Harden widget tokens, rate limiting, history access, and order verification.

## API & Plugin Alignment (Discrepancies found)

- [ ] Update `_docs/PRD.md` to include newly added endpoints:
  - Billing endpoints (`/api/stores/subscription/`, `/api/stores/subscription/checkout/`, `/api/stores/subscription/portal/`, `/api/webhooks/polar/`)
  - Knowledge endpoints (`GET /api/stores/knowledge/`, `DELETE /api/stores/knowledge/document/:id`)
  - Chat history endpoints (`GET /api/widget/chat/history/`)
- [ ] Implement missing endpoints in Hono API (`api/src/routes/store.ts`) called by the Plugin:
  - `GET /api/stores/dashboard/stats/`
  - `GET /api/stores/chat-history/` (and `GET /api/stores/chat-history/:id/`)
- [ ] Fix endpoint mismatch in Widget (`plugin/widget/src/App.tsx`):
  - Change `fetch('/api/widget/history/')` to match API (`/api/widget/chat/history`)
