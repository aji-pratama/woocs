from django.test import TestCase

from chat.models import ChatMessage, ChatSession
from store.models import Store


class ChatSessionModelTest(TestCase):
    def setUp(self):
        self.store = Store.objects.create(
            api_key_hash="test_hash", wc_url="https://test.com"
        )

    def test_session_creation(self):
        import uuid

        sid = uuid.uuid4()
        session = ChatSession.objects.create(store=self.store, session_id=sid)
        self.assertIsNotNone(session.id)
        self.assertEqual(session.store, self.store)
        self.assertEqual(session.session_id, sid)
        self.assertIn(str(sid), str(session))

    def test_unique_together(self):
        import uuid

        sid = uuid.uuid4()
        ChatSession.objects.create(store=self.store, session_id=sid)
        with self.assertRaises(Exception):
            ChatSession.objects.create(store=self.store, session_id=sid)


class ChatMessageModelTest(TestCase):
    def setUp(self):
        import uuid

        self.store = Store.objects.create(
            api_key_hash="test_hash", wc_url="https://test.com"
        )
        self.session = ChatSession.objects.create(
            store=self.store, session_id=uuid.uuid4()
        )

    def test_user_message_creation(self):
        msg = ChatMessage.objects.create(
            session=self.session,
            role="user",
            content="Hello there",
        )
        self.assertEqual(msg.role, "user")
        self.assertFalse(msg.escalated)
        self.assertIsNone(msg.confidence_score)

    def test_assistant_message_with_confidence(self):
        msg = ChatMessage.objects.create(
            session=self.session,
            role="assistant",
            content="Here is your answer",
            confidence_score=0.87,
        )
        self.assertEqual(msg.confidence_score, 0.87)
        self.assertFalse(msg.escalated)

    def test_escalated_message(self):
        msg = ChatMessage.objects.create(
            session=self.session,
            role="assistant",
            content="Escalation message",
            escalated=True,
            escalation_reason="keyword_trigger",
        )
        self.assertTrue(msg.escalated)
        self.assertEqual(msg.escalation_reason, "keyword_trigger")

    def test_get_last_n_messages(self):
        for i in range(10):
            ChatMessage.objects.create(
                session=self.session,
                role="user" if i % 2 == 0 else "assistant",
                content=f"Message {i}",
            )
        last_5 = self.session.get_last_n_messages(5)
        self.assertEqual(len(last_5), 5)
        # Should be the last 5 in chronological order
        self.assertEqual(last_5[0].content, "Message 5")
        self.assertEqual(last_5[4].content, "Message 9")
