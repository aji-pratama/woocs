import base64
import hashlib
import hmac
import json
import time
from datetime import timedelta

import pytest
from django.test import Client, override_settings
from django.utils import timezone

from billing.models import PolarWebhookEvent, Subscription
from billing.services import PolarWebhookService, store_has_access
from store.services import StoreService


@pytest.fixture
def store_and_key():
    store, raw_key, _ = StoreService.register_or_update_store(
        wc_url="https://shop.example.com"
    )
    return store, raw_key


@pytest.mark.django_db
class TestSubscription:
    def test_trial_is_active(self, store_and_key):
        store, _ = store_and_key
        subscription = store.subscription

        assert subscription.is_active is True
        assert store_has_access(store) is True

    def test_revoked_subscription_blocks_store(self, store_and_key):
        store, _ = store_and_key
        subscription = store.subscription
        subscription.plan_key = "starter"
        subscription.status = Subscription.Status.REVOKED
        subscription.save(update_fields=["plan_key", "status"])

        assert subscription.is_active is False
        assert store_has_access(store) is False

    def test_canceled_subscription_works_until_period_end(self, store_and_key):
        store, _ = store_and_key
        subscription = store.subscription
        subscription.status = Subscription.Status.CANCELED
        subscription.current_period_end = timezone.now() + timedelta(days=1)

        assert subscription.is_active is True

    def test_subscription_endpoint_returns_only_billing_state(self, store_and_key):
        _, raw_key = store_and_key

        response = Client().get("/api/stores/subscription/", HTTP_X_API_KEY=raw_key)

        assert response.status_code == 200
        assert set(response.json()) == {
            "plan_key",
            "status",
            "cancel_at_period_end",
            "current_period_end",
            "active",
        }

    @override_settings(POLAR_PRODUCTS={"growth": "product_growth"})
    def test_checkout_uses_authenticated_store_as_external_customer(
        self, store_and_key, mocker
    ):
        store, raw_key = store_and_key
        client = Client()
        create_checkout = mocker.patch(
            "billing.api.PolarClient.create_checkout",
            return_value={"url": "https://polar.sh/checkout/test"},
        )

        response = client.post(
            "/api/stores/subscription/checkout/",
            data={"plan_key": "growth"},
            content_type="application/json",
            HTTP_X_API_KEY=raw_key,
        )

        assert response.status_code == 200
        assert response.json()["url"] == "https://polar.sh/checkout/test"
        create_checkout.assert_called_once_with(
            product_id="product_growth",
            external_customer_id=str(store.id),
            customer_email=None,
            success_url=(
                "https://shop.example.com/wp-admin/admin.php"
                "?page=woocs-settings&tab=billing&checkout=success"
            ),
        )

    def test_portal_uses_projected_polar_customer(self, store_and_key, mocker):
        store, raw_key = store_and_key
        subscription = store.subscription
        subscription.plan_key = "growth"
        subscription.status = Subscription.Status.ACTIVE
        subscription.polar_customer_id = "customer_123"
        subscription.save(update_fields=["plan_key", "status", "polar_customer_id"])
        create_portal = mocker.patch(
            "billing.api.PolarClient.create_customer_portal",
            return_value={"customer_portal_url": "https://polar.sh/portal/test"},
        )
        client = Client()

        response = client.post(
            "/api/stores/subscription/portal/", HTTP_X_API_KEY=raw_key
        )

        assert response.status_code == 200
        assert response.json()["url"] == "https://polar.sh/portal/test"
        create_portal.assert_called_once_with(
            customer_id="customer_123",
            return_url=(
                "https://shop.example.com/wp-admin/admin.php"
                "?page=woocs-settings&tab=billing"
            ),
        )


@pytest.mark.django_db
class TestPolarWebhook:
    @override_settings(
        POLAR_WEBHOOK_SECRET="whsec_" + base64.b64encode(b"test-secret").decode(),
        POLAR_PRODUCTS={"growth": "product_growth"},
    )
    def test_verified_subscription_event_updates_projection_idempotently(
        self, store_and_key
    ):
        store, _ = store_and_key
        payload = {
            "type": "subscription.active",
            "data": {
                "id": "sub_123",
                "status": "active",
                "customer_id": "customer_123",
                "customer": {"external_id": str(store.id)},
                "product_id": "product_growth",
                "cancel_at_period_end": False,
                "current_period_end": "2026-09-08T00:00:00Z",
            },
        }
        body = json.dumps(payload, separators=(",", ":")).encode()
        timestamp = str(int(time.time()))
        signed = b"event_123." + timestamp.encode() + b"." + body
        signature = base64.b64encode(
            hmac.new(b"test-secret", signed, hashlib.sha256).digest()
        ).decode()
        headers = {
            "webhook-id": "event_123",
            "webhook-timestamp": timestamp,
            "webhook-signature": f"v1,{signature}",
        }

        first = PolarWebhookService.process(body, headers)
        second = PolarWebhookService.process(body, headers)

        subscription = Subscription.objects.get(store=store)
        assert first is True
        assert second is False
        assert subscription.plan_key == "growth"
        assert subscription.status == Subscription.Status.ACTIVE
        assert PolarWebhookEvent.objects.filter(event_id="event_123").count() == 1

    @override_settings(POLAR_PRODUCTS={"growth": "product_growth"})
    def test_revoked_event_blocks_access_even_if_period_end_is_future(
        self, store_and_key
    ):
        store, _ = store_and_key

        subscription = PolarWebhookService._apply_subscription(
            {
                "id": "sub_123",
                "status": "canceled",
                "customer": {"external_id": str(store.id)},
                "product_id": "product_growth",
                "current_period_end": "2026-09-08T00:00:00Z",
            },
            "subscription.revoked",
        )

        assert subscription.status == Subscription.Status.REVOKED
        assert subscription.is_active is False

    @override_settings(POLAR_WEBHOOK_SECRET="whsec_dGVzdA==")
    def test_invalid_signature_is_rejected(self):
        with pytest.raises(ValueError, match="signature"):
            PolarWebhookService.process(
                b"{}",
                {
                    "webhook-id": "event_123",
                    "webhook-timestamp": str(int(time.time())),
                    "webhook-signature": "v1,invalid",
                },
            )

    @override_settings(
        POLAR_WEBHOOK_SECRET="whsec_" + base64.b64encode(b"test-secret").decode(),
        POLAR_PRODUCTS={},
    )
    def test_processing_failure_is_recorded_for_audit(self, store_and_key):
        store, _ = store_and_key
        payload = {
            "type": "subscription.active",
            "data": {
                "id": "sub_123",
                "customer": {"external_id": str(store.id)},
                "product_id": "unknown_product",
            },
        }
        body = json.dumps(payload, separators=(",", ":")).encode()
        timestamp = str(int(time.time()))
        signed = b"event_failed." + timestamp.encode() + b"." + body
        signature = base64.b64encode(
            hmac.new(b"test-secret", signed, hashlib.sha256).digest()
        ).decode()

        with pytest.raises(ValueError, match="not mapped"):
            PolarWebhookService.process(
                body,
                {
                    "webhook-id": "event_failed",
                    "webhook-timestamp": timestamp,
                    "webhook-signature": f"v1,{signature}",
                },
            )

        event = PolarWebhookEvent.objects.get(event_id="event_failed")
        assert event.status == PolarWebhookEvent.ProcessingStatus.FAILED
