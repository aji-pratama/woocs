from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel


class ChatRequestIn(BaseModel):
    store_id: UUID
    session_id: UUID
    message: str


class ChatResponseOut(BaseModel):
    answer: Optional[str] = None
    confidence: Optional[float] = None
    escalated: bool = False
    escalation_reason: Optional[str] = None
    session_id: UUID
    response_type: str = "text"  # text | product_card | order_card | escalation
    metadata: Optional[dict[str, Any]] = None  # structured data for card rendering


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
