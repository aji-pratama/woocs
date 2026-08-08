from datetime import datetime

from pydantic import BaseModel


class CheckoutIn(BaseModel):
    plan_key: str


class UrlOut(BaseModel):
    url: str


class SubscriptionOut(BaseModel):
    plan_key: str
    status: str
    cancel_at_period_end: bool
    current_period_end: datetime | None = None
