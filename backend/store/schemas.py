from typing import Optional
from uuid import UUID

from pydantic import BaseModel, HttpUrl


class StoreRegisterIn(BaseModel):
    api_key: Optional[str] = None
    wc_url: HttpUrl
    merchant_email: Optional[str] = None
    wc_consumer_key: Optional[str] = None
    wc_consumer_secret: Optional[str] = None


class StoreRegisterOut(BaseModel):
    store_id: UUID
    store_name: str
    valid: bool
    api_key: Optional[str] = None


class VariationIn(BaseModel):
    wc_variation_id: int
    attributes: dict
    stock_quantity: Optional[int] = None
    price: Optional[float] = None


class ProductIn(BaseModel):
    wc_id: int
    name: str
    description: Optional[str] = None
    price: Optional[float] = None
    stock_status: str = "instock"
    stock_quantity: Optional[int] = None
    categories: list[str] = []
    tags: list[str] = []
    variations: list[VariationIn] = []


class FAQIn(BaseModel):
    question: str
    answer: str


class SyncRequestIn(BaseModel):
    products: list[ProductIn] = []
    faqs: list[FAQIn] = []


class SyncResponseOut(BaseModel):
    task_id: str
    status: str


class SyncStatusOut(BaseModel):
    products_count: int
    faqs_count: int
    variations_count: int
    last_synced_at: Optional[str] = None
    status: str
