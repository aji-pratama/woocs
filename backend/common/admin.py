from django.contrib import admin

from .models import TaskRecord


@admin.register(TaskRecord)
class TaskRecordAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "task_name",
        "status",
        "enqueued_at",
        "started_at",
        "finished_at",
    )
    list_filter = ("status", "task_name")
    search_fields = ("id", "task_name", "args", "kwargs", "result")
    readonly_fields = ("id", "enqueued_at", "started_at", "finished_at", "traceback")
    ordering = ("-enqueued_at",)
