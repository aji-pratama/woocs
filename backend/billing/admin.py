from django.contrib import admin
from django.http import HttpRequest

from .models import PolarWebhookEvent, Subscription


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("store", "plan_key", "status", "current_period_end", "updated_at")
    list_filter = ("plan_key", "status")
    search_fields = ("store__wc_url", "polar_customer_id", "polar_subscription_id")
    readonly_fields = ("id", "updated_at")


@admin.register(PolarWebhookEvent)
class PolarWebhookEventAdmin(admin.ModelAdmin):
    list_display = ("event_id", "event_type", "status", "created_at", "processed_at")
    list_filter = ("event_type", "status")
    search_fields = ("event_id",)
    readonly_fields = (
        "id",
        "event_id",
        "event_type",
        "payload",
        "status",
        "error",
        "created_at",
        "processed_at",
    )

    def has_add_permission(self, request: HttpRequest) -> bool:
        return False

    def has_delete_permission(
        self, request: HttpRequest, obj: PolarWebhookEvent | None = None
    ) -> bool:
        return False
