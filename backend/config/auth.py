from ninja.security import APIKeyHeader

from store.models import Store
from store.services import StoreService


class ApiKeyAuth(APIKeyHeader):
    param_name = "X-API-Key"

    def authenticate(self, request, key):
        if not key:
            return None

        # Hash the incoming key to match the database stored hash
        api_key_hash = StoreService.hash_api_key(key)
        try:
            store = Store.objects.get(api_key_hash=api_key_hash)
            return store
        except Store.DoesNotExist:
            return None
