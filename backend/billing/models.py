import uuid
from datetime import timedelta

from django.db import models
from django.utils import timezone

from store.models import Store


class Subscription(models.Model):
    class Status(models.TextChoices):
        TRIALING = "trialing", "Trialing"
        ACTIVE = "active", "Active"
        PAST_DUE = "past_due", "Past due"
        CANCELED = "canceled", "Canceled"
        REVOKED = "revoked", "Revoked"
        UNPAID = "unpaid", "Unpaid"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    store = models.OneToOneField(
        Store, on_delete=models.CASCADE, related_name="subscription"
    )
    polar_customer_id = models.CharField(max_length=255, null=True, blank=True)
    polar_subscription_id = models.CharField(
        max_length=255, null=True, blank=True, unique=True
    )
    polar_product_id = models.CharField(max_length=255, null=True, blank=True)
    plan_key = models.CharField(max_length=50, default="trial")
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.TRIALING
    )
    cancel_at_period_end = models.BooleanField(default=False)
    current_period_end = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def start_trial(cls, store):
        return cls.objects.create(
            store=store,
            plan_key="trial",
            status=cls.Status.TRIALING,
            current_period_end=timezone.now() + timedelta(days=14),
        )

    @property
    def is_active(self) -> bool:
        if self.status not in {
            self.Status.TRIALING,
            self.Status.ACTIVE,
            self.Status.CANCELED,
        }:
            return False
        if self.status == self.Status.CANCELED:
            return bool(
                self.current_period_end and self.current_period_end > timezone.now()
            )
        return not self.current_period_end or self.current_period_end > timezone.now()

    def __str__(self) -> str:
        return f"{self.store}: {self.plan_key} ({self.status})"


class PolarWebhookEvent(models.Model):
    class ProcessingStatus(models.TextChoices):
        PROCESSING = "processing", "Processing"
        PROCESSED = "processed", "Processed"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event_id = models.CharField(max_length=255, unique=True)
    event_type = models.CharField(max_length=100)
    payload = models.JSONField(default=dict)
    status = models.CharField(
        max_length=20,
        choices=ProcessingStatus.choices,
        default=ProcessingStatus.PROCESSING,
    )
    error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.event_type}: {self.event_id}"
