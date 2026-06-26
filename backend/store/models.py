import uuid

from django.db import models
from pgvector.django import VectorField


class Store(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    api_key_hash = models.CharField(
        max_length=64, unique=True, help_text="SHA-256 of raw API key"
    )
    wc_url = models.URLField(
        max_length=255,
        null=True,
        blank=True,
        help_text="Merchant's WooCommerce store URL",
    )

    # TODO: encrypt before production using django-encrypted-fields (Fernet)
    wc_consumer_key = models.CharField(max_length=255, null=True, blank=True)
    wc_consumer_secret = models.CharField(max_length=255, null=True, blank=True)

    merchant_email = models.EmailField(
        null=True, blank=True, help_text="Escalation destination, trial reminders"
    )
    subscription_status = models.CharField(
        max_length=50,
        default="trial",
        help_text="trial / active / cancelled / expired / suspended",
    )
    plan = models.CharField(
        max_length=50, null=True, blank=True, help_text="starter / growth / pro / null"
    )

    trial_ends_at = models.DateTimeField(null=True, blank=True)
    billing_cycle_end = models.DateTimeField(null=True, blank=True)

    conversation_count = models.IntegerField(
        default=0, help_text="Incremented per ChatSession, reset monthly"
    )
    last_synced_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        url_display = self.wc_url if self.wc_url else "Unlinked Store"
        return f"{url_display} ({self.id})"


class Product(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    store = models.ForeignKey(Store, on_delete=models.CASCADE, related_name="products")
    wc_id = models.IntegerField(help_text="WooCommerce Product ID")

    name = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    stock_status = models.CharField(
        max_length=50, default="instock", help_text="instock / outofstock / onbackorder"
    )
    stock_quantity = models.IntegerField(null=True, blank=True)

    categories = models.JSONField(default=list, help_text="list of category names")
    tags = models.JSONField(default=list, help_text="list of tag names")

    embedding = VectorField(
        dimensions=1536,
        null=True,
        blank=True,
        help_text="pgvector field — null until embedding pipeline runs",
    )
    synced_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} (WC: {self.wc_id})"


class ProductVariation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="variations"
    )
    wc_variation_id = models.IntegerField()

    attributes = models.JSONField(
        default=dict, help_text="e.g. {'size': 'M', 'color': 'Navy'}"
    )
    stock_quantity = models.IntegerField(null=True, blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    def __str__(self):
        return f"{self.product.name} - Var {self.wc_variation_id}"


class FAQ(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    store = models.ForeignKey(Store, on_delete=models.CASCADE, related_name="faqs")

    question = models.TextField()
    answer = models.TextField()

    embedding = VectorField(
        dimensions=1536,
        null=True,
        blank=True,
        help_text="pgvector field — null until embedding pipeline runs",
    )
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"FAQ: {self.question[:30]}..."
