import uuid

from django.db import models


class TaskRecord(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task_name = models.CharField(max_length=255, db_index=True)
    args = models.JSONField(default=list)
    kwargs = models.JSONField(default=dict)

    # Using simple strings for status: pending, running, completed, failed
    status = models.CharField(max_length=50, default="pending", db_index=True)

    enqueued_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    result = models.JSONField(null=True, blank=True)
    traceback = models.TextField(null=True, blank=True)

    def __str__(self):
        return f"Task {self.task_name} ({self.status}) - {self.id}"
