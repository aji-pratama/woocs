# WooCS.ai — Hono JS Backend Migration Plan

Dokumen perencanaan teknis migrasi backend ke **Hono JS (TypeScript)** di direktori `api/`, berdampingan dengan `backend/` (Django) sebagai referensi langsung, siap deploy ke **Cloudflare Workers**, menggunakan **PostgreSQL murni (Local Container & Supabase jalur Postgres) + pgvector**, dan menerapkan metodologi **Test-Driven Development (TDD)** dengan mem-porting seluruh test case Django yang ada.

---

## 1. Arsitektur & Prinsip Migrasi

### 1.1 Co-Existence Strategy (`api/` berdampingan dengan `backend/`)
- Backend baru dibangun di dalam direktori `api/` pada root workspace (`woocs/api/`).
- `backend/` (Django) tetap utuh dan aktif sebagai:
  1. **Golden Reference**: Sumber kebenaran untuk logika bisnis, penamaan field, query pgvector, dan struktur data.
  2. **Fallback & Parity Check**: Memungkinkan pengujian perbandingan output response HTTP secara berdampingan (side-by-side parity check).
- Port dev sementara: Django di port `8000`, Hono dev server di port `8001` (atau proxy via Makefile).

### 1.2 Universal PostgreSQL & pgvector (Local Container & Supabase)
- **Tanpa Supabase SDK Lock-in**: Akses database murni menggunakan PostgreSQL Connection String (`DATABASE_URL`).
  - **Local Dev**: PostgreSQL container `pgvector/pgvector:pg15` di port `5432` (`postgres://woocs:woocs_dev@localhost:5432/woocs`).
  - **Production Managed**: Supabase via standard PostgreSQL connection pooler (port `6543` PgBouncer / port `5432` Direct) dengan parameter `sslmode=require`.
- Driver menggunakan `postgres.js` yang kompatibel dengan Drizzle ORM, mendukung pgvector native, serta konfigurasi `prepare: false` untuk PgBouncer pooler.

### 1.3 Cloudflare Workers Readiness
Meskipun berjalan di Node.js saat dev lokal, arsitektur `api/` dirancang **Cloudflare Workers Ready**:
1. **Web Standard APIs**: Menggunakan standard `fetch`, `Request`, `Response`, `Web Crypto` (`crypto.subtle`), dan `URL`. Tidak menggunakan modul Node native eksklusif (`fs`, `child_process`, `net` mentah).
2. **Hono Universal Entrypoint**:
   - `src/index.ts` mengekspor `Hono` app standar.
   - Entrypoint Node dev: `src/server.node.ts` (`@hono/node-server`).
   - Entrypoint Cloudflare Workers: `src/server.worker.ts` (`export default app`).
3. **Database di Cloudflare Workers**: Kompatibel via Cloudflare Hyperdrive atau Supabase connection pooler via TCP socket adapter / HTTP client.

### 1.4 Jawaban Arsitektur Scheduler & Background Tasks
> **Pertanyaan**: *Apakah untuk scheduler butuh tools tambahan (Redis/Celery) atau Node.js + Postgres sudah cukup?*

**Jawaban: Node.js + PostgreSQL SUDAH SANGAT CUKUP.**
1. **Queue/Worker Asynchronous**:
   - Menggunakan tabel `task_records` yang sudah ada di PostgreSQL dengan pattern `SELECT ... FOR UPDATE SKIP LOCKED` (dapat menggunakan implementasi internal ringan atau library matang seperti `pg-boss` / `graphile-worker`).
   - Menghilangkan kebutuhan akan Redis atau Celery, memangkas biaya infrastruktur dan kompleksitas ops.
2. **Recurring / Cron Scheduling**:
   - **Mode Node.js (Docker/VPS/Local)**: Cukup timer interval / `croner` / `node-cron` internal Node.js yang memicu job ke tabel task.
   - **Mode Cloudflare Workers**: Menggunakan native **Cloudflare Cron Triggers** (`wrangler.toml: [triggers] crons = [...]`) yang langsung mengeksekusi handler `app.fire()` / `scheduled()` di Hono secara serverless tanpa server standby.

---

## 2. Database Models (Drizzle ORM / PostgreSQL DDL)

Semua model menggunakan UUID v4 sebagai Primary Key. Skema terbagi dalam 4 domain:

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
```

### 2.1 Domain: Store & Catalog (`api/src/db/schema/stores.ts`)
- **`stores`**:
  - `id`: `uuid` (PK, `gen_random_uuid()`)
  - `api_key_hash`: `varchar(64)` (UNIQUE, NOT NULL, SHA-256)
  - `wc_url`: `varchar(255)` (NULL)
  - `wc_consumer_key`: `varchar(255)` (NULL)
  - `wc_consumer_secret`: `varchar(255)` (NULL)
  - `merchant_email`: `varchar(255)` (NULL)
  - `last_synced_at`: `timestamptz` (NULL)
  - `created_at`: `timestamptz` (DEFAULT `now()`)
- **`products`**:
  - `id`: `uuid` (PK)
  - `store_id`: `uuid` (FK -> `stores.id` ON DELETE CASCADE)
  - `wc_id`: `integer` (NOT NULL)
  - `name`: `varchar(255)` (NOT NULL)
  - `description`: `text` (NULL)
  - `price`: `numeric(10, 2)` (NULL)
  - `stock_status`: `varchar(50)` (DEFAULT `'instock'`)
  - `stock_quantity`: `integer` (NULL)
  - `categories`: `jsonb` (DEFAULT `'[]'`)
  - `tags`: `jsonb` (DEFAULT `'[]'`)
  - `embedding`: `vector(1024)` (NULL)
  - `synced_at`: `timestamptz` (DEFAULT `now()`)
  - *Index*: Cosine index pada kolom `embedding`.
- **`product_variations`**:
  - `id`: `uuid` (PK)
  - `product_id`: `uuid` (FK -> `products.id` ON DELETE CASCADE)
  - `wc_variation_id`: `integer` (NOT NULL)
  - `attributes`: `jsonb` (DEFAULT `'{}'`)
  - `stock_quantity`: `integer` (NULL)
  - `price`: `numeric(10, 2)` (NULL)
- **`faqs`**:
  - `id`: `uuid` (PK)
  - `store_id`: `uuid` (FK -> `stores.id` ON DELETE CASCADE)
  - `question`: `text` (NOT NULL)
  - `answer`: `text` (NOT NULL)
  - `embedding`: `vector(1024)` (NULL)
  - `updated_at`: `timestamptz` (DEFAULT `now()`)

### 2.2 Domain: Chat & RAG (`api/src/db/schema/chat.ts`)
- **`chat_sessions`**:
  - `id`: `uuid` (PK)
  - `store_id`: `uuid` (FK -> `stores.id` ON DELETE CASCADE)
  - `session_id`: `uuid` (NOT NULL)
  - `customer_name`: `varchar(150)` (NULL)
  - `customer_email`: `varchar(255)` (NULL)
  - `customer_phone`: `varchar(30)` (NULL)
  - `created_at`: `timestamptz` (DEFAULT `now()`)
  - *Unique Constraint*: `(store_id, session_id)`
- **`chat_messages`**:
  - `id`: `uuid` (PK)
  - `session_id`: `uuid` (FK -> `chat_sessions.id` ON DELETE CASCADE)
  - `role`: `varchar(10)` (NOT NULL: `'user'` | `'assistant'`)
  - `content`: `text` (NOT NULL)
  - `confidence_score`: `double precision` (NULL)
  - `escalated`: `boolean` (DEFAULT `false`)
  - `escalation_reason`: `varchar(30)` (NULL: `'low_confidence'` | `'keyword_trigger'` | `'customer_request'`)
  - `response_type`: `varchar(20)` (DEFAULT `'text'`)
  - `metadata`: `jsonb` (NULL)
  - `created_at`: `timestamptz` (DEFAULT `now()`)

### 2.3 Domain: Billing (`api/src/db/schema/billing.ts`)
- **`subscriptions`**:
  - `id`: `uuid` (PK)
  - `store_id`: `uuid` (FK -> `stores.id` ON DELETE CASCADE, UNIQUE)
  - `plan_key`: `varchar(32)` (DEFAULT `'trial'`)
  - `status`: `varchar(32)` (DEFAULT `'trialing'`: `'trialing'` | `'active'` | `'past_due'` | `'canceled'` | `'expired'`)
  - `polar_customer_id`: `varchar(64)` (NULL)
  - `polar_subscription_id`: `varchar(64)` (NULL)
  - `current_period_end`: `timestamptz` (NULL)
  - `cancel_at_period_end`: `boolean` (DEFAULT `false`)
  - `created_at`: `timestamptz` (DEFAULT `now()`)
  - `updated_at`: `timestamptz` (DEFAULT `now()`)
- **`polar_webhook_events`**:
  - `id`: `uuid` (PK)
  - `event_id`: `varchar(128)` (UNIQUE, NOT NULL)
  - `event_type`: `varchar(64)` (NOT NULL)
  - `payload`: `jsonb` (NOT NULL)
  - `status`: `varchar(32)` (DEFAULT `'received'`: `'received'` | `'processed'` | `'failed'` | `'ignored'`)
  - `error`: `text` (NULL)
  - `created_at`: `timestamptz` (DEFAULT `now()`)
  - `processed_at`: `timestamptz` (NULL)

### 2.4 Domain: Task Records (`api/src/db/schema/tasks.ts`)
- **`task_records`**:
  - `id`: `uuid` (PK)
  - `task_name`: `varchar(255)` (NOT NULL)
  - `args`: `jsonb` (DEFAULT `'[]'`)
  - `kwargs`: `jsonb` (DEFAULT `'{}'`)
  - `status`: `varchar(50)` (DEFAULT `'pending'`: `'pending'` | `'running'` | `'completed'` | `'failed'`)
  - `enqueued_at`: `timestamptz` (DEFAULT `now()`)
  - `started_at`: `timestamptz` (NULL)
  - `finished_at`: `timestamptz` (NULL)
  - `result`: `jsonb` (NULL)
  - `traceback`: `text` (NULL)

---

## 3. Schemas Data (Zod Definitions)

Skema validasi runtime menggunakan Zod untuk menjamin konsistensi input/output API:

### 3.1 Store & Catalog Schemas (`api/src/schemas/store.ts`)
```typescript
import { z } from 'zod';

export const StoreRegisterInSchema = z.object({
  wc_url: z.string().url(),
  api_key: z.string().optional(),
  merchant_email: z.string().email().optional(),
  wc_consumer_key: z.string().optional(),
  wc_consumer_secret: z.string().optional(),
});

export const StoreRegisterOutSchema = z.object({
  store_id: z.string().uuid(),
  store_name: z.string(),
  valid: z.boolean(),
  api_key: z.string().nullable(),
});

export const ProductVariationSyncSchema = z.object({
  wc_variation_id: z.number().int(),
  attributes: z.record(z.string(), z.string()).default({}),
  stock_quantity: z.number().int().nullable().optional(),
  price: z.number().nullable().optional(),
});

export const ProductSyncSchema = z.object({
  wc_id: z.number().int(),
  name: z.string(),
  description: z.string().nullable().optional(),
  price: z.number().nullable().optional(),
  stock_status: z.string().default('instock'),
  stock_quantity: z.number().int().nullable().optional(),
  categories: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  variations: z.array(ProductVariationSyncSchema).default([]),
});

export const FAQSyncSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

export const SyncRequestInSchema = z.object({
  products: z.array(ProductSyncSchema).default([]),
  faqs: z.array(FAQSyncSchema).default([]),
});

export const SyncResponseOutSchema = z.object({
  task_id: z.string(),
  status: z.string(),
  products_received: z.number().int(),
  faqs_received: z.number().int(),
});

export const SyncStatusOutSchema = z.object({
  task_id: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  products_synced: z.number().int().optional(),
  faqs_synced: z.number().int().optional(),
  error: z.string().nullable().optional(),
});
```

### 3.2 Chat & Widget Schemas (`api/src/schemas/chat.ts`)
```typescript
export const CustomerInfoSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

export const PageContextSchema = z.object({
  page_type: z.string().optional(),
  product_id: z.number().int().optional(),
  product_name: z.string().optional(),
});

export const ChatRequestInSchema = z.object({
  store_id: z.string().uuid(),
  session_id: z.string().uuid(),
  message: z.string().min(1),
  page_context: PageContextSchema.optional(),
  customer_info: CustomerInfoSchema.optional(),
});

export const ChatResponseOutSchema = z.object({
  message: z.string(),
  response_type: z.string().default('text'),
  confidence_score: z.number(),
  escalated: z.boolean(),
  escalation_reason: z.string().nullable().optional(),
  product_data: z.record(z.string(), z.any()).nullable().optional(),
});

export const ChatHistoryResponseOutSchema = z.object({
  session_id: z.string().uuid(),
  messages: z.array(
    z.object({
      id: z.string().uuid(),
      role: z.enum(['user', 'assistant']),
      content: z.string(),
      response_type: z.string(),
      created_at: z.string(),
    })
  ),
});

export const OrderStatusRequestInSchema = z.object({
  store_id: z.string().uuid(),
  order_id: z.string(),
  billing_email: z.string().email(),
});
```

### 3.3 Billing Schemas (`api/src/schemas/billing.ts`)
```typescript
export const SubscriptionOutSchema = z.object({
  plan_key: z.string(),
  status: z.string(),
  cancel_at_period_end: z.boolean(),
  current_period_end: z.string().nullable(),
  active: z.boolean(),
});

export const CheckoutInSchema = z.object({
  plan_key: z.enum(['starter', 'growth']),
});

export const UrlOutSchema = z.object({
  url: z.string().url(),
});
```

---

## 4. API Endpoints Specification

| HTTP Method | Path | Auth / Header | Subscription Gate | Deskripsi |
|---|---|---|---|---|
| `POST` | `/api/stores/register/` | Public | None | Pendaftaran store baru / koneksi ulang API Key |
| `POST` | `/api/stores/sync/` | `X-API-Key` | Active Gate (`402` jika nonaktif) | Ingestion katalog & trigger task embedding |
| `GET` | `/api/stores/sync/status/` | `X-API-Key` | None | Polling status task ingest katalog |
| `GET` | `/api/stores/subscription/` | `X-API-Key` | None | Mendapatkan info paket & status masa aktif |
| `POST` | `/api/stores/subscription/checkout/` | `X-API-Key` | None | Generate link Polar Checkout berdasar plan |
| `POST` | `/api/webhooks/polar/` | Polar Signature | None | Endpoint idempotent webhook event Polar |
| `POST` | `/api/widget/chat/` | Public (`store_id` in body) | Active Gate (`402` jika nonaktif) | Chat flow (Keyword -> RAG -> Escalation) |
| `GET` | `/api/widget/chat/history/` | Public (`store_id` + `session_id`) | None | Mengambil histori riwayat chat sesi |
| `POST` | `/api/widget/order-status/` | Public (`store_id` in body) | Active Gate (`402` jika nonaktif) | Verifikasi status order via WooCommerce REST |

---

## 5. TDD Strategy: Porting Test Cases dari Django

Pendekatan migrasi adalah **Test-Driven Development (TDD)**:
1. **Langkah 1**: Port seluruh test case yang saat ini ada di `backend/` ke dalam format **Vitest** di `api/tests/`.
2. **Langkah 2**: Lengkapi skenario pengujian yang belum tercakup di Django (misalnya: edge runtime safety, stream response, webhook race condition).
3. **Langkah 3**: Implementasikan fitur di Hono hingga seluruh test lolos (Green).

### 5.1 Pemetaan Test Case Django -> Vitest

| File Sumber Django | Target Vitest di `api/tests/` | Skenario yang Di-porting |
|---|---|---|
| `backend/store/tests/test_models.py` | `api/tests/store/models.test.ts` | Validasi model Store, Product, Variation, FAQ, embedding field, dan cascade deletion |
| `backend/store/tests/test_services.py` | `api/tests/store/services.test.ts` | `generate_api_key`, `hash_api_key`, `register_or_update_store`, idempotency |
| `backend/store/tests/test_api.py` | `api/tests/store/api.test.ts` | Registrasi store baru, invalid API key, valid key update, catalog sync upsert |
| `backend/store/tests/test_tasks.py` | `api/tests/store/tasks.test.ts` | `build_product_document`, `build_faq_document`, batch embedding generation & saving |
| `backend/chat/tests/test_models.py` | `api/tests/chat/models.test.ts` | ChatSession unique together `(store, session_id)`, ChatMessage ordering, relation |
| `backend/chat/tests/test_services.py` | `api/tests/chat/services.test.ts` | Keyword matching (`escalate`, `human`), session creation, customer info persistence |
| `backend/chat/tests/test_rag_service.py`| `api/tests/chat/rag.test.ts` | Cosine similarity pgvector query, top confidence calculation, page context routing |
| `backend/chat/tests/test_api.py` | `api/tests/chat/api.test.ts` | `/api/widget/chat/` response, confidence score, auto-escalation flag, history retrieval |
| `backend/chat/tests/test_tasks.py` | `api/tests/chat/tasks.test.ts` | Escalation email formatting, transcript formatting, SMTP delivery |
| `backend/billing/tests/test_billing.py` | `api/tests/billing/billing.test.ts` | Start trial, Polar checkout generation, webhook idempotency, active subscription gate |
| `backend/common/tests.py` | `api/tests/common/ai.test.ts` | Dynamic LLM & Embedding factory, mock provider switching |

### 5.2 Skenario Pengujian Baru yang Ditambahkan
- [ ] **Edge Runtime Isolation**: Memastikan tidak ada modul Node yang memicu error saat di-bundle untuk Cloudflare Workers isolate.
- [ ] **Streaming Token Response**: Test untuk endpoint chat jika mode streaming diaktifkan (`ReadableStream` / SSE).
- [ ] **Webhook Signature Verification**: Test penolakan webhook Polar jika signature header tidak valid.
- [ ] **Postgres Task Concurrency**: Test dua worker mengeksekusi antrean task secara bersamaan tanpa race condition (`FOR UPDATE SKIP LOCKED`).

---

## 6. Struktur Direktori Baru (`woocs/api/`)

```text
woocs/
├── backend/                  # [Eksisting] Django project (golden reference)
├── api/                      # [Baru] Hono JS backend
│   ├── package.json
│   ├── tsconfig.json
│   ├── drizzle.config.ts
│   ├── wrangler.toml         # Konfigurasi Cloudflare Workers
│   ├── src/
│   │   ├── index.ts          # Root Hono app (universal)
│   │   ├── server.node.ts    # Node.js dev/prod server entry
│   │   ├── server.worker.ts  # Cloudflare Workers entry
│   │   ├── db/
│   │   │   ├── client.ts     # Universal postgres client
│   │   │   └── schema/       # Drizzle schemas (stores, chat, billing, tasks)
│   │   ├── schemas/          # Zod validation schemas
│   │   ├── middleware/       # Auth (X-API-Key) & Subscription Gate
│   │   ├── routes/           # Router modules (stores, widget, webhooks)
│   │   ├── services/         # StoreService, RagService, BillingService, TaskService
│   │   └── worker/           # Task queue worker (ingestion & email)
│   └── tests/                # Ported test suite (Vitest)
│       ├── setup.ts
│       ├── store/
│       ├── chat/
│       ├── billing/
│       └── common/
```

---

## 7. Actionable Roadmap & Checklist

- [x] **Milestone 1: Scaffolding & Setup Test Runner**
  - [x] Inisialisasi direktori `api/` dengan `npm init`, pasang dependencies (Hono, Drizzle, Postgres, Zod, Vitest).
  - [x] Konfigurasi `drizzle.config.ts` dan test runner Vitest.
  - [x] Siapkan entrypoint ganda (`server.node.ts` & `server.worker.ts` + `wrangler.toml`).
- [x] **Milestone 2: Schema & Porting Model Tests (TDD)**
  - [x] Buat skema Drizzle di `api/src/db/schema/`.
  - [x] Port `test_models.py` ke Vitest dan jalankan migrasi database test.
  - [x] Pastikan ekstensi `vector` aktif dan query pgvector berjalan sukses.
- [ ] **Milestone 3: Porting Service Tests & Business Logic**
  - [ ] Port `test_services.py`, `test_rag_service.py`, `test_billing.py` ke Vitest.
  - [ ] Implementasikan StoreService, RagService (Vercel AI SDK/LLM), dan Polar service hingga test Green.
- [ ] **Milestone 4: Porting API & Endpoint Tests**
  - [ ] Port `test_api.py` untuk store, widget chat, dan billing.
  - [ ] Implementasikan middleware `X-API-Key` dan subscription gate di Hono.
  - [ ] Verifikasi seluruh route menggunakan `app.request()` tanpa jaringan eksternal.
- [ ] **Milestone 5: Postgres Task Worker & Escalation Email**
  - [ ] Implementasi worker queue berbasis `task_records` di PostgreSQL.
  - [ ] Port `test_tasks.py` untuk katalog ingestion dan pengiriman email eskalasi.
- [ ] **Milestone 6: Parity Check & Cloudflare Workers Dry-run**
  - [ ] Jalankan parity check antara endpoint Django (port 8000) dan Hono (port 8001).
  - [ ] Uji dry-run build bundle Cloudflare Workers via `wrangler dry-run`.
- [ ] **Milestone 7: Decommissioning & Cleanup Django (`backend/`)**
  - [ ] Pastikan 100% test case di `api/` lolos (Green) dan integrasi plugin WordPress & widget berfungsi normal.
  - [ ] Hapus seluruh direktori `backend/` (beserta `.venv` dan file konfigurasi Django).
  - [ ] Perbarui `Makefile`: bersihkan target Django (`backend-*`, `dev-api`, dll) dan jadikan Hono API sebagai default pada perintah `make dev`.
  - [ ] Perbarui `.agents/AGENTS.md` dan `README.md` agar merefleksikan arsitektur tunggal Hono TypeScript.
