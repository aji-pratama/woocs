from chat.services import ChatService, OrderService, RagService
from chat.services.chat_service import ChatService as PackageChatService
from chat.services.order_service import OrderService as PackageOrderService
from chat.services.rag_service import RagService as PackageRagService


def test_service_package_preserves_public_imports() -> None:
    assert ChatService is PackageChatService
    assert OrderService is PackageOrderService
    assert RagService is PackageRagService
