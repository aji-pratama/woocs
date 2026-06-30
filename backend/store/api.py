from ninja import Router
from ninja.errors import HttpError

from config.auth import ApiKeyAuth
from chat.models import ChatSession, ChatMessage
from chat.schemas import ChatHistoryListOut, ChatSessionDetailOut, ChatMessageOut

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


@router.get("/dashboard/stats/", response={200: dict}, auth=ApiKeyAuth())
def dashboard_stats(request):
    """
    Returns high-level statistics for the plugin dashboard.
    """
    store = request.auth
    
    # Use ChatSession and ChatMessage if available
    chat_sessions_count = store.sessions.count()
    messages_count = 0
    escalations_count = 0
    
    from chat.models import ChatMessage
    # Optimization: count all messages across all sessions of this store
    messages_qs = ChatMessage.objects.filter(session__store=store)
    messages_count = messages_qs.count()
    escalations_count = messages_qs.filter(escalated=True).count()
    
    products_count = store.products.count()

    return 200, {
        "chat_sessions": chat_sessions_count,
        "total_messages": messages_count,
        "products_synced": products_count,
        "escalations": escalations_count,
    }


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


@router.get("/chat-history/", response={200: ChatHistoryListOut}, auth=ApiKeyAuth())
def chat_history_list(request, page: int = 1, page_size: int = 20):
    """
    Returns a paginated list of chat sessions for this store,
    suitable for the WP Admin Chat History page.
    """
    store = request.auth
    page_size = min(page_size, 100)
    offset = (page - 1) * page_size

    qs = ChatSession.objects.filter(store=store).order_by("-created_at")
    total = qs.count()
    sessions = qs[offset: offset + page_size]

    result = []
    for session in sessions:
        # First user message as preview
        first_msg = (
            ChatMessage.objects.filter(session=session, role="user")
            .order_by("created_at")
            .values_list("content", flat=True)
            .first()
        )
        msg_count = ChatMessage.objects.filter(session=session).count()
        escalated = ChatMessage.objects.filter(session=session, escalated=True).exists()

        result.append({
            "session_id": session.session_id,
            "customer_name": session.customer_name,
            "customer_email": session.customer_email,
            "customer_phone": session.customer_phone,
            "first_message": (first_msg[:120] if first_msg else None),
            "message_count": msg_count,
            "escalated": escalated,
            "created_at": session.created_at.isoformat(),
        })

    return 200, {
        "sessions": result,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/chat-history/{session_id}/", response={200: ChatSessionDetailOut}, auth=ApiKeyAuth())
def chat_history_detail(request, session_id: str):
    """
    Returns full conversation for a single session.
    """
    store = request.auth
    try:
        session = ChatSession.objects.get(store=store, session_id=session_id)
    except ChatSession.DoesNotExist:
        raise HttpError(404, "Session not found.")

    messages = ChatMessage.objects.filter(session=session).order_by("created_at")

    return 200, {
        "session_id": session.session_id,
        "customer_name": session.customer_name,
        "customer_email": session.customer_email,
        "customer_phone": session.customer_phone,
        "created_at": session.created_at.isoformat(),
        "messages": [
            ChatMessageOut(
                id=m.id,
                role=m.role,
                content=m.content,
                response_type=m.response_type,
                metadata=m.metadata,
                error=False,
            )
            for m in messages
        ],
    }
