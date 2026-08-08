import base64
import binascii
import hashlib
import hmac
import json
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from store.models import Store

from .models import PolarWebhookEvent, Subscription


def store_has_access(store: Store) -> bool:
    subscription = getattr(store, "subscription", None)
    return bool(subscription and subscription.is_active)


class PolarClient:
    @staticmethod
    def _post(path: str, payload: dict) -> dict:
        if not settings.POLAR_ACCESS_TOKEN:
            raise ValueError("POLAR_ACCESS_TOKEN is not configured.")
        request = Request(
            f"{settings.POLAR_API_URL.rstrip('/')}/{path.lstrip('/')}",
            data=json.dumps(payload).encode(),
            headers={
                "Authorization": f"Bearer {settings.POLAR_ACCESS_TOKEN}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=15) as response:
                return json.loads(response.read())
        except HTTPError as exc:
            raise ValueError(
                f"Polar API request failed with status {exc.code}."
            ) from exc

    @classmethod
    def create_checkout(
        cls,
        *,
        product_id: str,
        external_customer_id: str,
        customer_email: str | None,
        success_url: str,
    ) -> dict:
        payload = {
            "products": [product_id],
            "external_customer_id": external_customer_id,
            "success_url": success_url,
        }
        if customer_email:
            payload["customer_email"] = customer_email
        return cls._post("checkouts/", payload)

    @classmethod
    def create_customer_portal(cls, *, customer_id: str, return_url: str) -> dict:
        return cls._post(
            "customer-sessions/",
            {"customer_id": customer_id, "return_url": return_url},
        )


class PolarWebhookVerifier:
    TOLERANCE_SECONDS = 300

    @classmethod
    def verify(cls, body: bytes, headers: dict[str, str]) -> str:
        event_id = headers.get("webhook-id", "")
        timestamp = headers.get("webhook-timestamp", "")
        signatures = headers.get("webhook-signature", "")
        if not event_id or not timestamp or not signatures:
            raise ValueError("Missing Polar webhook signature headers.")
        try:
            timestamp_value = int(timestamp)
        except ValueError as exc:
            raise ValueError("Invalid Polar webhook timestamp.") from exc
        if abs(int(time.time()) - timestamp_value) > cls.TOLERANCE_SECONDS:
            raise ValueError("Polar webhook signature has expired.")

        secret = settings.POLAR_WEBHOOK_SECRET
        if not secret:
            raise ValueError("POLAR_WEBHOOK_SECRET is not configured.")
        encoded_secret = secret.removeprefix("whsec_")
        try:
            secret_bytes = base64.b64decode(encoded_secret)
        except (ValueError, binascii.Error) as exc:
            raise ValueError("Invalid Polar webhook secret.") from exc

        signed_payload = f"{event_id}.{timestamp}.".encode() + body
        expected = base64.b64encode(
            hmac.new(secret_bytes, signed_payload, hashlib.sha256).digest()
        ).decode()
        candidates = [
            item.split(",", 1)[1]
            for item in signatures.split()
            if item.startswith("v1,")
        ]
        if not any(
            hmac.compare_digest(expected, candidate) for candidate in candidates
        ):
            raise ValueError("Invalid Polar webhook signature.")
        return event_id


class PolarWebhookService:
    SUBSCRIPTION_EVENTS = {
        "subscription.created",
        "subscription.updated",
        "subscription.active",
        "subscription.canceled",
        "subscription.uncanceled",
        "subscription.revoked",
        "subscription.past_due",
    }

    @classmethod
    def process(cls, body: bytes, headers: dict[str, str]) -> bool:
        normalized_headers = {key.lower(): value for key, value in headers.items()}
        event_id = PolarWebhookVerifier.verify(body, normalized_headers)
        payload = json.loads(body)
        event_type = payload.get("type", "")
        event, created = PolarWebhookEvent.objects.get_or_create(
            event_id=event_id,
            defaults={"event_type": event_type, "payload": payload},
        )
        if not created:
            return False
        try:
            with transaction.atomic():
                if event_type in cls.SUBSCRIPTION_EVENTS:
                    cls._apply_subscription(payload.get("data") or {}, event_type)
                event.status = PolarWebhookEvent.ProcessingStatus.PROCESSED
                event.processed_at = timezone.now()
                event.save(update_fields=["status", "processed_at"])
        except Exception as exc:
            event.status = PolarWebhookEvent.ProcessingStatus.FAILED
            event.error = str(exc)
            event.save(update_fields=["status", "error"])
            raise
        return True

    @staticmethod
    def _apply_subscription(data: dict, event_type: str) -> Subscription:
        external_id = (data.get("customer") or {}).get("external_id")
        if not external_id:
            raise ValueError("Polar customer external_id is required.")
        store = Store.objects.get(id=external_id)
        product_id = data.get("product_id") or (data.get("product") or {}).get("id")
        plan_key = next(
            (
                key
                for key, configured_id in settings.POLAR_PRODUCTS.items()
                if configured_id == product_id
            ),
            None,
        )
        if not plan_key:
            raise ValueError("Polar product is not mapped to a WooCS plan.")
        period_end = data.get("current_period_end")
        parsed_period_end = parse_datetime(period_end) if period_end else None
        status = (
            Subscription.Status.REVOKED
            if event_type == "subscription.revoked"
            else data.get("status", Subscription.Status.ACTIVE)
        )
        subscription, _ = Subscription.objects.update_or_create(
            store=store,
            defaults={
                "polar_customer_id": data.get("customer_id")
                or (data.get("customer") or {}).get("id"),
                "polar_subscription_id": data.get("id"),
                "polar_product_id": product_id,
                "plan_key": plan_key,
                "status": status,
                "cancel_at_period_end": data.get("cancel_at_period_end", False),
                "current_period_end": parsed_period_end,
            },
        )
        return subscription
