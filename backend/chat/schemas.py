from typing import Optional
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
