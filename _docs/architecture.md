# WooCS.ai — Technical Architecture & System Design

**Scope:** Hono JS API backend (`api/`), WordPress plugin (`plugin/`), React storefront widget (`plugin/widget/`), PostgreSQL + pgvector database, and multi-provider AI Router.

---

## 1. System Topology & Overview

```
┌──────────────────────────────────────────────────────────┐
│  Storefront (Customer-facing)                            │
│  React Widget (Vite)  →  POST /api/widget/chat           │
│                       →  POST /api/widget/chat/escalate  │
│                       →  GET  /api/widget/orders/:id     │
└──────────────────────┬───────────────────────────────────┘
                       │ HTTP (JSON)
┌──────────────────────▼───────────────────────────────────┐
│  Hono JS Backend (api/ — Node.js / Cloudflare Workers)   │
│  Routers: store · chat/widget · billing · internal       │
│  AI Router: Multi-provider failover + Circuit Breaker    │
└──────┬──────────────────────────────┬────────────────────┘
       │                              │
┌──────▼─────────────────────┐ ┌──────▼────────────────────┐
│ PostgreSQL 15 + pgvector   │ │ Asynchronous Worker       │
│ (Catalog, Vectors, Memory) │ │ (Embeddings & Catalog DB) │
└────────────────────────────┘ └───────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  WordPress Plugin (PHP 8.1+)                             │
│  Pulls WC catalog     →  POST /api/stores/sync           │
│  Admin Dashboard      →  Settings · Sync · FAQs · Preview│
└──────────────────────────────────────────────────────────┘
```

```mermaid
flowchart TD
    subgraph Storefront["Storefront (Customer)"]
        Widget["React Widget (plugin/widget/)"]
    end

    subgraph WPAdmin["WordPress (Merchant)"]
        Plugin["WooCS Plugin (plugin/)"]
        WC["WooCommerce Store"]
    end

    subgraph Cloud["Backend Infrastructure (api/)"]
        API["Hono JS REST API (:8001)"]
        Worker["Background Worker"]
        AIRouter["Multi-Provider AI Router"]
    end

    subgraph Persistence["Storage & External"]
        DB[("PostgreSQL 15 + pgvector")]
        Polar["Polar.sh Billing"]
        LLM["AI Providers (OpenAI / OpenRouter / Gemini)"]
    end

    Widget -->|"Public JSON (/api/widget/*)"| API
    Plugin -->|"X-API-Key (/api/stores/*)"| API
    Plugin -->|"Internal Hooks / REST"| WC
    API --> DB
    API --> Worker
    API --> AIRouter
    API --> Polar
    AIRouter --> LLM
    Worker --> DB
```

---

## 2. Directory & Module Boundaries

```text
woocs/
├── api/                  # Hono JS backend (Node.js & Cloudflare Workers compatible)
│   ├── src/
│   │   ├── config/       # Env config, DB pool, AI router JSON parsing
│   │   ├── middleware/   # API key auth, health secret check, rate limiting
│   │   ├── routes/       # /api/stores, /api/widget, /api/billing, /api/internal
│   │   ├── services/     # AI Router, RAG pipeline, Sync worker, Polar client
│   │   └── types/        # TypeScript interfaces and DTOs
│   └── tests/            # Vitest unit & contract test suites (27 files / 142 tests)
├── plugin/               # WordPress Plugin (PHP 8.1+)
│   ├── src/              # Controllers, sync client, admin settings UI
│   └── widget/           # React 18 + Vite storefront chat client
└── compose.dev.yml       # Docker/Podman services (Postgres + pgvector, MySQL, WordPress)
```

---

## 3. Database Schema (PostgreSQL + pgvector)

```mermaid
erDiagram
    Store ||--o| Subscription : owns
    Store ||--o{ Product : contains
    Store ||--o{ FAQ : contains
    Store ||--o{ KnowledgeDocument : contains
    Store ||--o{ ChatSession : logs
    ChatSession ||--o{ ChatMessage : contains

    Store {
        uuid id PK
        string name
        string wc_url
        string api_key_hash "SHA-256"
        string admin_email
        jsonb wc_credentials "Encrypted"
        timestamp last_synced_at
        timestamp created_at
    }

    Product {
        uuid id PK
        uuid store_id FK
        bigint wc_product_id
        string name
        string sku
        text description
        numeric price
        string stock_status
        string permalink
        jsonb images
        vector embedding "1536 dim"
        timestamp updated_at
    }

    FAQ {
        uuid id PK
        uuid store_id FK
        text question
        text answer
        vector embedding "1536 dim"
    }

    KnowledgeDocument {
        uuid id PK
        uuid store_id FK
        string source_type "url | pdf"
        string title
        text content
        vector embedding "1536 dim"
    }

    ChatSession {
        uuid id PK
        uuid store_id FK
        string customer_name
        string customer_email
        string customer_phone
        boolean escalated
        string escalation_notes
        timestamp created_at
    }

    ChatMessage {
        uuid id PK
        uuid session_id FK
        string role "user | assistant | system"
        text content
        jsonb metadata "Sources, Confidence, Product IDs"
        timestamp created_at
    }

    Subscription {
        uuid id PK
        uuid store_id FK
        string polar_customer_id
        string polar_subscription_id
        string plan_key
        string status "active | trialing | past_due | canceled"
        timestamp current_period_end
    }
```

---

## 4. Multi-Provider AI Router Architecture

The AI layer (`api/src/services/ai.ts`) reads dynamic provider chains from JSON configuration with automated failover and circuit breaking:

```mermaid
flowchart TD
    Req["Incoming Chat / Embedding Request"] --> Router["AIRouterService"]
    Router --> P1{"Provider 1 Active?"}
    
    P1 -->|Yes| Call1["Call Provider 1 (e.g. OpenAI)"]
    P1 -->|Cooldown / Disabled| P2{"Provider 2 Active?"}
    
    Call1 -->|Success (200)| Ret["Return Output"]
    Call1 -->|429 / 5xx Error| MarkCooldown["Set 60s Circuit Breaker Cooldown"]
    MarkCooldown --> P2
    
    P2 -->|Yes| Call2["Call Provider 2 (e.g. OpenRouter / Gemini)"]
    P2 -->|Cooldown / Disabled| P3["Provider 3 Fallback"]
    
    Call2 -->|Success| Ret
    Call2 -->|Failure| P3
    P3 -->|Success| Ret
    P3 -->|Exhausted| Escalate["Trigger Human Escalation Fallback"]
```

---

## 5. RAG Retrieval & Confidence Scoring

```mermaid
sequenceDiagram
    participant Customer as Customer (Widget)
    participant API as Hono API (/api/widget/chat)
    participant AI as AI Router (Embeddings)
    participant DB as PostgreSQL (pgvector)
    participant LLM as AI Router (Completion)

    Customer->>API: POST { store_id, message, session_id }
    API->>AI: Generate query vector (1536 dim)
    AI-->>API: Query vector
    API->>DB: Cosine distance search (<=>) scoped by store_id
    DB-->>API: Top K products, FAQs, and knowledge chunks
    API->>API: Calculate confidence score: (1.0 - min(distance))
    
    alt Confidence < 0.45 or Intent = Escalation
        API-->>Customer: Escalation Card (Capture name, email, phone)
    else High Confidence
        API->>LLM: Stream completion with retrieved context
        LLM-->>API: Text answer + structured product cards
        API-->>Customer: Assistant Message + Add to Cart actions
    end
```

---

## 6. Polar Billing & Webhook Lifecycle

```mermaid
sequenceDiagram
    participant Merchant as WP Admin
    participant Plugin as WordPress Plugin
    participant API as Hono API
    participant Polar as Polar.sh
    participant DB as PostgreSQL

    Merchant->>Plugin: Click Upgrade Plan
    Plugin->>API: POST /api/stores/subscription/checkout (X-API-Key)
    API->>Polar: Create Checkout (external_customer_id = store_id)
    Polar-->>API: Hosted Checkout URL
    API-->>Plugin: Return Checkout URL
    Plugin->>Polar: Merchant completes payment
    Polar->>API: POST /api/webhooks/polar (Signed Webhook)
    API->>API: Verify Webhook Signature
    API->>DB: Upsert Subscription projection (status: active)
    API-->>Polar: 200 OK
```

---

## 7. Security & Trust Boundaries

| Surface | Authentication | Scope & Invariants |
|---|---|---|
| **Plugin API** (`/api/stores/*`) | `X-API-Key` (SHA-256 hashed in DB) | Server-to-server only. Never exposed to browser. Full store catalog & sync authority. |
| **Widget API** (`/api/widget/*`) | Keyless (scoped by `store_id`) | Untrusted browser client. Read-only catalog RAG, session persistence, escalation dispatch. |
| **Polar Webhooks** (`/api/webhooks/polar`) | `Standard-Webhooks-Signature` | Idempotent event persistence. Authoritative subscription gate updater. |
| **Internal Health Check** (`/api/internal/*`) | `X-Health-Key` / `?key=` | Obfuscated route. Returns internal database latency, memory, and AI provider status. |
