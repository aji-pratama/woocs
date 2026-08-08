from django.contrib import admin

from .models import PolarWebhookEvent, Subscription


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("store", "plan_key", "status", "current_period_end", "updated_at")
    list_filter = ("plan_key", "status")
    search_fields = ("store__wc_url", "polar_customer_id", "polar_subscription_id")


@admin.register(PolarWebhookEvent)
class PolarWebhookEventAdmin(admin.ModelAdmin):
    list_display = ("event_id", "event_type", "status", "created_at", "processed_at")
    list_filter = ("event_type", "status")
    search_fields = ("event_id",)
