import logging

import requests
from requests.auth import HTTPBasicAuth

from store.models import Store

logger = logging.getLogger(__name__)

WC_STATUS_MAP = {
    "pending": "Payment pending",
    "processing": "Processing your order",
    "on-hold": "On hold",
    "completed": "Delivered",
    "cancelled": "Cancelled",
    "refunded": "Refunded",
    "failed": "Payment failed",
}


class OrderService:
    """Proxies order-status requests to the WooCommerce REST API."""

    @staticmethod
    def get_order_status(store: Store, order_id: str) -> dict[str, object]:
        if not store.wc_url or not store.wc_consumer_key or not store.wc_consumer_secret:
            return OrderService._error(
                order_id,
                "Store configuration is incomplete. I cannot check order status right now.",
            )

        try:
            url = f"{store.wc_url.rstrip('/')}/wp-json/wc/v3/orders/{order_id}"
            response = requests.get(
                url,
                auth=HTTPBasicAuth(store.wc_consumer_key, store.wc_consumer_secret),
                timeout=10,
            )
            if response.status_code == 200:
                data = response.json()
                status = data.get("status", "unknown")
                return {
                    "order_id": order_id,
                    "status": WC_STATUS_MAP.get(status, status.capitalize()),
                    "items": [
                        f"{item.get('name', 'Product')} ×{item.get('quantity', 1)}"
                        for item in data.get("line_items", [])
                    ],
                    "total": str(data.get("total", "0.00")),
                    "found": True,
                    "error": None,
                }
            if response.status_code == 404:
                return OrderService._error(
                    order_id,
                    f"I couldn't find order #{order_id}. Please check your order number.",
                )
            logger.error("WooCommerce returned %s for order %s", response.status_code, order_id)
            return OrderService._error(
                order_id,
                "I couldn't fetch your order status at the moment. Please try again later.",
            )
        except requests.RequestException:
            logger.exception("WooCommerce order lookup failed for store %s", store.id)
            return OrderService._error(
                order_id,
                "An error occurred while checking your order. Please try again later.",
            )

    @staticmethod
    def _error(order_id: str, message: str) -> dict[str, object]:
        return {
            "order_id": order_id,
            "found": False,
            "status": None,
            "items": [],
            "total": None,
            "error": message,
        }
