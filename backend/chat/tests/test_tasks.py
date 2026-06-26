import uuid

import pytest

from chat.models import ChatMessage, ChatSession
from chat.tasks import send_escalation_email
from store.models import Store


@pytest.mark.django_db
class TestEscalationEmailTask:
    def test_send_escalation_email_success(self, mocker):
        store = Store.objects.create(
            api_key_hash="hash",
            wc_url="https://test.com",
            merchant_email="merchant@test.com",
        )
        session = ChatSession.objects.create(store=store, session_id=uuid.uuid4())
        ChatMessage.objects.create(
            session=session, role="user", content="I want a refund"
        )
        ChatMessage.objects.create(
            session=session,
            role="assistant",
            content="Escalation message",
            escalated=True,
            escalation_reason="keyword_trigger",
        )

        mock_send = mocker.patch("chat.tasks.send_mail")

        result = send_escalation_email(str(session.id))

        assert result["status"] == "sent"
        assert result["recipient"] == "merchant@test.com"
        mock_send.assert_called_once()

    def test_send_escalation_email_no_merchant_email(self):
        store = Store.objects.create(
            api_key_hash="hash",
            wc_url="https://test.com",
            merchant_email=None,
        )
        session = ChatSession.objects.create(store=store, session_id=uuid.uuid4())

        result = send_escalation_email(str(session.id))
        assert result["status"] == "skipped"

    def test_send_escalation_email_session_not_found(self):
        result = send_escalation_email(str(uuid.uuid4()))
        assert result["status"] == "error"
        assert result["message"] == "Session not found"
