import uuid
from typing import Any

from django.tasks import TaskContext, TaskResultStatus
from django.tasks.backends.base import BaseTaskBackend
from django.utils.module_loading import import_string

from .models import TaskRecord


class PostgresTaskBackend(BaseTaskBackend):
    supports_get_result = True

    def enqueue(self, task, args, kwargs):
        self.validate_task(task)

        # We need the dotted path to the task function
        task_func_name = f"{task.func.__module__}.{task.func.__name__}"

        record = TaskRecord.objects.create(
            task_name=task_func_name, args=args, kwargs=kwargs, status="pending"
        )
        return str(record.id)

    def get_result(self, result_id):
        try:
            record = TaskRecord.objects.get(id=result_id)
        except TaskRecord.DoesNotExist:
            # According to spec, we should probably raise TaskResultDoesNotExist
            # but standard exception might suffice for PoC
            raise ValueError(f"TaskResult {result_id} does not exist")

        status_map = {
            "pending": TaskResultStatus.WAITING,
            "running": TaskResultStatus.RUNNING,
            "completed": TaskResultStatus.COMPLETE,
            "failed": TaskResultStatus.FAILED,
        }

        # Import TaskResult here to avoid circular imports during setup
        from django.tasks import TaskResult

        return TaskResult(
            id=str(record.id),
            task_name=record.task_name,
            status=status_map.get(record.status, TaskResultStatus.WAITING),
            enqueued_at=record.enqueued_at,
            started_at=record.started_at,
            finished_at=record.finished_at,
            args=record.args,
            kwargs=record.kwargs,
            backend=self.alias,
            return_value=record.result if record.status == "completed" else None,
            error=record.traceback if record.status == "failed" else None,
        )
