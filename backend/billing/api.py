from django.conf import settings
from ninja import Router, Status
from ninja.errors import HttpError

from config.auth import ApiKeyAuth

from .models import Subscription
from .schemas import CheckoutIn, SubscriptionOut, UrlOut
from .services import PolarClient, PolarWebhookService

store_router = Router(tags=["billing"], auth=ApiKeyAuth())
webhook_router = Router(tags=["webhooks"])


@store_router.get("/subscription/", response={200: SubscriptionOut})
def get_subscription(request):
    subscription = getattr(request.auth, "subscription", None)
    if not subscription:
        subscription = Subscription.start_trial(request.auth)
    return {
        "plan_key": subscription.plan_key,
        "status": subscription.status,
        "cancel_at_period_end": subscription.cancel_at_period_end,
        "current_period_end": subscription.current_period_end,
    }


@store_router.post("/subscription/checkout/", response={200: UrlOut})
def create_checkout(request, payload: CheckoutIn):
    product_id = settings.POLAR_PRODUCTS.get(payload.plan_key)
    if not product_id:
        raise HttpError(400, "Unknown or unavailable plan.")
    try:
        checkout = PolarClient.create_checkout(
            product_id=product_id, external_customer_id=str(request.auth.id)
        )
    except ValueError as exc:
        raise HttpError(502, str(exc))
    return {"url": checkout["url"]}


@store_router.post("/subscription/portal/", response={200: UrlOut})
def create_portal(request):
    subscription = getattr(request.auth, "subscription", None)
    if not subscription or not subscription.polar_customer_id:
        raise HttpError(409, "Polar customer is not available yet.")
    try:
        session = PolarClient.create_customer_portal(
            customer_id=subscription.polar_customer_id
        )
    except ValueError as exc:
        raise HttpError(502, str(exc))
    return {"url": session["customer_portal_url"]}


@webhook_router.post("/polar/", response={202: dict})
def polar_webhook(request):
    try:
        processed = PolarWebhookService.process(request.body, dict(request.headers))
    except (ValueError, KeyError) as exc:
        raise HttpError(400, str(exc))
    return Status(202, {"processed": processed})
