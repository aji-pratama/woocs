from ninja import Router
from ninja.errors import HttpError

from store.models import Store

from .schemas import ChatHistoryResponseOut, ChatRequestIn, ChatResponseOut, OrderStatusResponseOut
from .services import ChatService, OrderService
from .tasks import send_escalation_email

router = Router(tags=["widget"])


@router.post("/chat/", response={200: ChatResponseOut})
def chat(request, payload: ChatRequestIn):
    """
    Widget chat endpoint. No auth — scoped by store_id.
    Handles the full chat flow: keyword check → RAG → confidence → escalation.
    """
    try:
        store = Store.objects.get(id=payload.store_id)
    except Store.DoesNotExist:
        raise HttpError(404, "Store not found.")

    result = ChatService.handle_message(
        store=store,
        session_id=payload.session_id,
        message=payload.message,
    )

    # If escalated, trigger async email
    if result["escalated"]:
        session = ChatService.get_or_create_session(store, payload.session_id)
        send_escalation_email.delay(str(session.id))

    return 200, result


@router.get("/history/", response={200: ChatHistoryResponseOut})
def get_chat_history(request, store_id: str, session_id: str):
    """
    Fetches the last N messages for a given store and session.
    """
    try:
        store = Store.objects.get(id=store_id)
        session = ChatSession.objects.get(store=store, session_id=session_id)
    except (Store.DoesNotExist, ChatSession.DoesNotExist):
        return 200, {"session_id": session_id, "messages": []}

    messages = session.get_last_n_messages(n=50)
    return 200, {
        "session_id": session_id,
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "response_type": m.response_type,
                "metadata": m.metadata,
                "error": m.error if hasattr(m, "error") else False,
            }
            for m in messages
        ],
    }


@router.get("/order-status/", response={200: OrderStatusResponseOut})
def order_status(request, store_id: str, order_id: str):
    """
    Order status proxy endpoint. No auth — scoped by store_id.
    Passes through to WooCommerce REST API (stub for PoC).
    """
    try:
        store = Store.objects.get(id=store_id)
    except Store.DoesNotExist:
        raise HttpError(404, "Store not found.")

    result = OrderService.get_order_status(store=store, order_id=order_id)
    return 200, result
