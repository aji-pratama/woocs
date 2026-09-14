# Zero-Cost Vendor Matrix & Free-Tier Capacity Limits

> **Prinsip Utama:** 100% Zero-Cost ($0/bulan) & **Zero Vendor Lock-in** (semua vendor diakses via protokol standar industri: SQL, native `fetch()`, S3, dan OpenAI-compatible API).

| Problem WooCS | Vendor Free Tier | Protokol Terbuka (No Lock-in) | Batas Kuota Gratis | Estimasi Batas Kapasitas Real WooCS |
|---|---|---|---|---|
| **API Compute** | **Cloudflare Workers** | Standard Web `fetch` / Hono | 100.000 request / hari (3 Juta/bulan) | **~200 Toko Aktif** (traffic admin + chat widget harian). |
| **Relational & Vector DB** | **Neon.tech** *(Fallback: Supabase)* | Standard Postgres / Drizzle ORM | 500 MB Storage per project (Singapore) | **~60.000 Produk** atau **~150.000 Chat Messages** (~50 toko @ 100 produk). *Bisa split akun via UUID sharding jika penuh.* |
| **Cache & Auth Gate** | **Upstash Redis** *(Fallback: Cloudflare KV)* | Native HTTPS REST (tanpa SDK) | 500.000 commands / bulan (Upstash) / 100.000 reads/hari (KV) | **~100 Toko Berbayar** (Auth cache TTL 30m + Subscription status cache TTL 24 jam). |
| **Asset & PDF Storage** | **Cloudflare R2** *(Fallback: Supabase Storage)* | S3-Compatible API (`@aws-sdk/client-s3`) | 10 GB Storage, 10M reads/bulan, **$0 Egress fee** | **~5.000 Dokumen PDF Knowledge Base** (asumsi 2 MB / PDF). |
| **AI LLM Inference** | **Google AI Studio (Gemini 1.5 Flash)** | Universal OpenAI-compatible API | 1.500 request / hari (15 RPM) **100% gratis** tanpa CC | **1.500 Chat / hari** (~30 toko aktif). |
| **AI Fallback / Speed** | **Groq Cloud (Llama 3.1 70B)** | Universal OpenAI-compatible API | 14.400 request / hari (30 RPM, ~300 token/s) | **14.400 Chat / hari** (Aktif otomatis via fallback pool jika Gemini 429). |
| **Doc Parser (PDF)** | **LlamaParse** *(Fallback: in-memory `pdf-parse`)* | Standard REST API / npm | 1.000 halaman / hari | **~100 PDF Dokumen / hari** (asumsi 10 halaman / PDF). |
| **Background Queue** | **Upstash QStash** *(Fallback: Trigger.dev)* | Standard Webhook HTTP POST | 500 pesan / hari (15.000 pesan/bulan) | **~15.000 background sync tasks / bulan**. |

---

### Strategi Kombinasi Multi-Akun Tanpa Merusak Relasi
1. **AI Inference Pooling:** Kombinasi **Gemini 1.5 Flash (1.500 RPD)** + **Groq (14.400 RPD)** memberikan total **~15.900 interaksi chat AI gratis per hari** (~300 toko @ 50 chat/hari) tanpa keluar uang sepeser pun. Cukup gunakan fallback URL jika status 429.
2. **Database Sharding:** Karena semua entitas menggunakan **UUID v4**, membagi toko ke multi-akun Neon / Supabase (misal: Toko 1–50 di Akun A, Toko 51–100 di Akun B) tidak akan pernah mengalami tabrakan primary key.
3. **Storage Zero Egress:** Cloudflare R2 tidak mengenakan biaya bandwidth download, aman dari tagihan tak terduga (*bill shock*).
