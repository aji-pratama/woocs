# WooCS.ai — Development Plan

> **Note:** Scaffolding and Phases 1 through 5 have been completed and moved to `_docs/CHANGELOG.md`.

## Active Feature Plans

- Continue the remaining behavioral verification in `_docs/plans/rag.md`.

## Subscription foundation

- [x] Define backend, WordPress plugin, and React application boundaries in `_docs/architecture.md`.
- [x] Implement Store-owned Polar checkout, subscription projection, webhook idempotency, and one active-subscription gate.
- [x] Connect the WordPress Plan & Billing journey to Polar-hosted checkout and Customer Portal.
- [ ] Configure Polar sandbox products and verify checkout/webhook end to end.
- [ ] Implement API-key rotation when production onboarding requires it.
- [ ] Define merchant accounts only when a standalone dashboard becomes a concrete requirement.
- [ ] Harden widget tokens, rate limiting, history access, and order verification.
