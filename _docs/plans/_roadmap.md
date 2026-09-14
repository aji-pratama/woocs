# WooCS.ai — Development Plan

> **Note:** Scaffolding and Phases 1 through 5 have been completed and moved to `_docs/CHANGELOG.md`.

## Active Feature Plans

- Continue the remaining behavioral verification in `_docs/plans/rag.md`.
- Hono JS backend migration plan and schema specification in `_docs/plans/hono-backend-migration.md`.

## Subscription foundation

- [x] Define backend, WordPress plugin, and React application boundaries in `_docs/architecture.md`.
- [x] Implement Store-owned Polar checkout, subscription projection, webhook idempotency, and one active-subscription gate.
- [x] Connect the WordPress Plan & Billing journey to Polar-hosted checkout and Customer Portal.
- [x] Implement tier differentiation: Free tier (Basic FAQ only, conversation limits) vs Paid tier (Full product catalog sync).
- [ ] Configure Polar sandbox products and verify checkout/webhook end to end.
- [ ] Implement API-key rotation when production onboarding requires it.
- [ ] Define merchant accounts only when a standalone dashboard becomes a concrete requirement.
- [ ] Harden widget tokens, rate limiting, history access, and order verification.

## API & Plugin Alignment (Discrepancies found)

- [x] Update `_docs/PRD.md` to include newly added endpoints:
  - Billing endpoints (`/api/stores/subscription/`, `/api/stores/subscription/checkout/`, `/api/stores/subscription/portal/`, `/api/webhooks/polar/`)
  - Knowledge endpoints (`GET /api/stores/knowledge/`, `DELETE /api/stores/knowledge/document/:id`)
  - Chat history endpoints (`GET /api/widget/chat/history/`)
- [x] Implement missing endpoints in Hono API (`api/src/routes/store.ts`) called by the Plugin:
  - `GET /api/stores/dashboard/stats/`
  - `GET /api/stores/chat-history/` (and `GET /api/stores/chat-history/:id/`)
- [x] Fix endpoint mismatch in Widget (`plugin/widget/src/App.tsx`):
  - Change `fetch('/api/widget/history/')` to match API (`/api/widget/chat/history`)

## Widget UI Enhancements

- [x] Implement Pre-chat form validation.
- [x] Implement Widget icon upload and rendering with 50x50 optimization constraint.

## Knowledge Base Enhancements

- [x] Add Text Area / Markdown input for General Knowledge documents (`title` + `content`).
- [x] Add client-side .txt/.md file loader to easily import policies.
- [x] Comment out URL fetch form with TODO for future headless crawler.
- [x] Support `type: 'text'` with direct chunking and vector embedding in Hono API and background worker.

## Conversations Export & Lead Labeling

- [x] Add `lead_label` (`hot`, `warm`, `cold`, `customer`, `support`, `lead`) to `chat_chatsession`.
- [x] Auto-label to `warm` when visitor provides email/phone in pre-chat.
- [x] Implement `PATCH /api/stores/chat-history/:id/label` endpoint.
- [x] Implement `GET /api/stores/chat-history/export` with `type=full` (all transcripts) and `type=leads` (contact DB).
- [x] Add export buttons and lead label management to WordPress Conversations view.
- [x] Add TDD test suite in `api/tests/store/export-leads.test.ts`.


