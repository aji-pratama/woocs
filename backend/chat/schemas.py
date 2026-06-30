from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel


class PageContextIn(BaseModel):
    type: str = "general"  # general | product
    product_id: Optional[int] = None
    product_name: Optional[str] = None


class CustomerInfoIn(BaseModel):
    """Optional customer identification from the pre-chat form."""
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None


class ChatRequestIn(BaseModel):
    store_id: UUID
    session_id: UUID
    message: str
    page_context: Optional[PageContextIn] = None
    customer_info: Optional[CustomerInfoIn] = None


class ChatResponseOut(BaseModel):
    answer: Optional[str] = None
    confidence: Optional[float] = None
    escalated: bool = False
    escalation_reason: Optional[str] = None
    session_id: UUID
    response_type: str = "text"  # text | product_card | order_card | escalation
    metadata: Optional[dict[str, Any]] = None  # structured data for card rendering
    context_used: Optional[str] = None  # "page_context" | "retrieval" | "order_lookup" | "keyword_trigger"


class ChatMessageOut(BaseModel):
    id: UUID
    role: str
    content: str
    response_type: str = "text"
    metadata: Optional[dict[str, Any]] = None
    error: bool = False


class ChatHistoryResponseOut(BaseModel):
    session_id: UUID
    messages: list[ChatMessageOut]


class OrderStatusRequestIn(BaseModel):
    store_id: UUID
    order_id: str


class OrderStatusResponseOut(BaseModel):
    order_id: str
    status: Optional[str] = None
    items: list[str] = []
    total: Optional[str] = None
    found: bool = True
    error: Optional[str] = None


class ChatSessionSummaryOut(BaseModel):
    """One row in the Chat History list."""
    session_id: UUID
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    first_message: Optional[str] = None
    message_count: int = 0
    escalated: bool = False
    created_at: str


class ChatHistoryListOut(BaseModel):
    sessions: list[ChatSessionSummaryOut]
    total: int
    page: int
    page_size: int


class ChatSessionDetailOut(BaseModel):
    """Full session detail for the Chat History drawer."""
    session_id: UUID
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    created_at: str
    messages: list[ChatMessageOut]
