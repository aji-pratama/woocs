from ninja import Router
from ninja.errors import HttpError

from config.auth import ApiKeyAuth

from .schemas import (
    StoreRegisterIn,
    StoreRegisterOut,
    SyncRequestIn,
    SyncResponseOut,
    SyncStatusOut,
)
from .services import StoreService, SyncService
from .tasks import ingest_catalog

router = Router(tags=["stores"])


@router.post("/register/", response={200: StoreRegisterOut})
def register_store(request, payload: StoreRegisterIn):
    """
    Registers a new store or updates an existing one if the api_key is provided.
    Returns the store ID, store name, and the generated API key (if newly generated).
    """
    store, raw_key, is_valid = StoreService.register_or_update_store(
        wc_url=payload.wc_url,
        api_key=payload.api_key,
        merchant_email=payload.merchant_email,
        wc_consumer_key=payload.wc_consumer_key,
        wc_consumer_secret=payload.wc_consumer_secret,
    )

    if not is_valid or not store:
        raise HttpError(401, "Invalid API key provided.")

    store_name = StoreService.get_store_name_from_url(str(store.wc_url))

    return 200, {
        "store_id": store.id,
        "store_name": store_name,
        "valid": True,
        "api_key": raw_key,  # Will be None if an existing key was provided
    }


@router.post("/sync/", response={202: SyncResponseOut}, auth=ApiKeyAuth())
def sync_catalog(request, payload: SyncRequestIn):
    """
    Accepts catalog payload (products, variations, FAQs), upserts records,
    and triggers Celery task for embedding.
    """
    store = request.auth  # Provided by ApiKeyAuth

    # 1. Upsert data to Postgres
    products_count, variations_count, faqs_count = SyncService.process_sync_payload(
        store, payload
    )

    # 2. Trigger Django embedding task
    task = ingest_catalog.enqueue(store.id)

    task_id = str(task.id) if hasattr(task, 'id') else str(task)
    return 202, {"task_id": task_id, "status": "processing"}


@router.get("/sync/status/", response={200: SyncStatusOut}, auth=ApiKeyAuth())
def sync_status(request):
    """
    Returns the current synchronization status and record counts.
    """
    store = request.auth

    return 200, {
        "products_count": store.products.count(),
        "faqs_count": store.faqs.count(),
        "variations_count": sum(p.variations.count() for p in store.products.all()),
        "last_synced_at": (
            store.last_synced_at.isoformat() if store.last_synced_at else None
        ),
        "status": "idle" if store.last_synced_at else "pending",  # Simplified for PoC
    }
