from django.contrib import admin

from .models import ChatMessage, ChatSession


class ChatMessageInline(admin.TabularInline):
    model = ChatMessage
    extra = 0
    readonly_fields = (
        "created_at",
        "role",
        "content",
        "confidence_score",
        "escalated",
        "escalation_reason",
        "response_type",
    )
    can_delete = False
    ordering = ("created_at",)


@admin.register(ChatSession)
class ChatSessionAdmin(admin.ModelAdmin):
    list_display = ("id", "store", "session_id", "customer_email", "created_at")
    search_fields = ("session_id", "customer_email", "store__wc_url")
    list_filter = ("store", "created_at")
    readonly_fields = ("id", "created_at")
    inlines = [ChatMessageInline]


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "session",
        "role",
        "message_preview",
        "escalated",
        "created_at",
    )
    list_filter = ("role", "escalated", "escalation_reason", "response_type")
    search_fields = ("content", "session__session_id")
    readonly_fields = ("id", "created_at")

    def message_preview(self, obj):
        return obj.content[:50]

    message_preview.short_description = "Content"
