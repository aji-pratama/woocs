---
trigger:
  path:
    - backend/**/*
---

# WooCS.ai — Backend Development Rules (Django)

## 1. Project Structure
- All backend code lives in `./backend/`.
- Django project is named `config` (`backend/config/` holds `settings.py`, `urls.py`, `celery.py`).
- Two apps: `store`, `chat`. Each is a self-contained Django app.
- All API endpoints are defined with **Django Ninja** — no DRF.

## 2. App Responsibilities
| App | Responsibility |
|---|---|
| `store` | Store model, API key auth, registration endpoint (`POST /api/stores/register/`), catalog ingest endpoint (`POST /api/stores/sync/`), Celery ingest + embedding tasks |
| `chat` | ChatSession, ChatMessage models; RAG pipeline; escalation logic; order status proxy |

## 3. Models
- All models use **UUID primary keys** (`uuid.uuid4`).
- All models that embed content use **pgvector** `VectorField(dimensions=1536)`.
- Use `django-pgvector` or the `pgvector` package for the vector field.
- All models scoped to a Store use a `ForeignKey(Store, on_delete=CASCADE)`.

## 4. API Design (Django Ninja)
- All routers are registered in `backend/config/urls.py` under `/api/`.
- Each app defines its own `NinjaRouter` in `<app>/api.py`.
- Use Pydantic schemas (in `<app>/schemas.py`) for all request/response bodies.
- API key validation happens in a shared middleware/auth class in `config/auth.py`.

## 5. Authentication
- Plugin-facing endpoints (`/api/stores/sync/`, `/api/stores/sync/status/`) require `X-API-Key` header.
- Widget-facing endpoints (`/api/widget/chat/`, `/api/widget/order-status/`) are public but scoped to `store_id`.
- Key validation: hash incoming key (SHA-256), compare against `Store.api_key_hash`.

## 6. Celery
- Celery app defined in `config/celery.py`, imported in `config/__init__.py`.
- All tasks defined in `<app>/tasks.py`.
- Use `@shared_task` decorator.
- Heavy work (embedding pipeline, email dispatch) MUST be Celery tasks — never block the request thread.

## 7. Environment Variables
- All secrets and environment-specific config loaded via `python-decouple` from `backend/.env`.
- Never hardcode DB credentials, API keys, or secret keys in `settings.py`.

## 8. Code Standards
- `declare(strict_types=1)` equivalent: use Python type hints everywhere.
- All functions and methods have type annotations.
- Use `python-decouple` for config, not `os.environ` directly.
- Never query the database directly with raw SQL — use Django ORM.
- **Architecture Pattern**: Gunakan pendekatan "fat models" (model yang kaya akan kapabilitas) untuk operasi berbasis data dan state changes. Untuk mengorkestrasi *complex business logic* dan *external API calls*, buat sebuah **service layer** terdedikasi (misal: `<app>/services.py`).

## 9. Testing
- Tests in `<app>/tests/` directory.
- Use Django's `TestCase` for model tests, `pytest` with `pytest-django` for API tests.
- Write tests before implementing feature code (TDD).
