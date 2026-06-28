import logging

from django.conf import settings
from django.core.mail import send_mail
from django.tasks import task

from .models import ChatSession

logger = logging.getLogger(__name__)


@task()
def send_escalation_email(session_id: str) -> dict:
    """
    Sends an escalation email to the merchant with the conversation transcript.
    Called asynchronously via Django Tasks after an escalation is triggered.
    """
    try:
        session = ChatSession.objects.select_related("store").get(id=session_id)
    except ChatSession.DoesNotExist:
        logger.error(f"ChatSession {session_id} not found for escalation email.")
        return {"status": "error", "message": "Session not found"}

    store = session.store
    merchant_email = store.merchant_email

    if not merchant_email:
        logger.warning(
            f"No merchant email configured for store {store.id}. "
            f"Skipping escalation email."
        )
        return {"status": "skipped", "message": "No merchant email configured"}

    # Build conversation transcript
    messages = session.messages.order_by("created_at")
    transcript_lines = []
    for msg in messages:
        prefix = "Customer" if msg.role == "user" else "Bot"
        transcript_lines.append(f"{prefix}: {msg.content}")
        if msg.escalated:
            transcript_lines.append(f"  ⚠ ESCALATED (reason: {msg.escalation_reason})")

    transcript = "\n".join(transcript_lines)

    subject = f"[WooCS.ai] Escalation — Session {session.session_id}"
    body = (
        f"A customer conversation has been escalated.\n\n"
        f"Store: {store.wc_url}\n"
        f"Session ID: {session.session_id}\n"
        f"Reason: escalation triggered\n\n"
        f"--- Conversation Transcript ---\n\n"
        f"{transcript}\n\n"
        f"---\n"
        f"Review this session in Django Admin."
    )

    try:
        send_mail(
            subject=subject,
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[merchant_email],
            fail_silently=False,
        )
        logger.info(
            f"Escalation email sent to {merchant_email} "
            f"for session {session.session_id}"
        )
        return {"status": "sent", "recipient": merchant_email}
    except Exception as e:
        logger.error(f"Failed to send escalation email: {str(e)}")
        return {"status": "error", "message": str(e)}
