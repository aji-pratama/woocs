from django.contrib import admin

from .models import FAQ, Product, ProductVariation, Store


@admin.register(Store)
class StoreAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "wc_url",
        "merchant_email",
        "subscription_status",
        "last_synced_at",
    )
    search_fields = ("id", "wc_url", "merchant_email")
    readonly_fields = ("id", "api_key_hash", "created_at")

    @admin.display(description="Subscription", ordering="subscription__status")
    def subscription_status(self, obj: Store) -> str:
        subscription = getattr(obj, "subscription", None)
        return subscription.status if subscription else "—"


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "name",
        "store",
        "wc_id",
        "price",
        "stock_status",
        "synced_at",
    )
    list_filter = ("stock_status",)
    search_fields = ("name", "wc_id")
    readonly_fields = ("id", "embedding", "synced_at")


@admin.register(ProductVariation)
class ProductVariationAdmin(admin.ModelAdmin):
    list_display = ("id", "product", "wc_variation_id", "price", "stock_quantity")
    search_fields = ("wc_variation_id", "product__name")
    readonly_fields = ("id",)


@admin.register(FAQ)
class FAQAdmin(admin.ModelAdmin):
    list_display = ("id", "store", "question_preview", "updated_at")
    search_fields = ("question", "answer")
    readonly_fields = ("id", "embedding", "updated_at")

    def question_preview(self, obj):
        return obj.question[:50]

    question_preview.short_description = "Question"
