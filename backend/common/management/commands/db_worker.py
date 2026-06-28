import time
import traceback

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from django.utils.module_loading import import_string

from common.models import TaskRecord


class Command(BaseCommand):
    help = "Run the database-backed background task worker"

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("Starting db_worker for Django Tasks..."))

        while True:
            try:
                # Find pending tasks
                with transaction.atomic():
                    task_record = (
                        TaskRecord.objects.select_for_update(skip_locked=True)
                        .filter(status="pending")
                        .order_by("enqueued_at")
                        .first()
                    )

                    if not task_record:
                        pass  # No tasks pending
                    else:
                        task_record.status = "running"
                        task_record.started_at = timezone.now()
                        task_record.save()

                if task_record:
                    self.stdout.write(
                        f"Executing task: {task_record.task_name} (ID: {task_record.id})"
                    )
                    try:
                        func = import_string(task_record.task_name)

                        # Note: In a real Django 6 tasks setup, the task function might be wrapped
                        # by the @task decorator. We need to call the underlying function or the wrapper.
                        # The wrapper is callable. Let's just call it directly.
                        result = func(*task_record.args, **task_record.kwargs)

                        task_record.status = "completed"
                        task_record.result = result
                    except Exception as e:
                        self.stderr.write(self.style.ERROR(f"Task failed: {e}"))
                        task_record.status = "failed"
                        task_record.traceback = traceback.format_exc()

                    task_record.finished_at = timezone.now()
                    task_record.save()
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"Task {task_record.id} {task_record.status}"
                        )
                    )

            except Exception as e:
                self.stderr.write(self.style.ERROR(f"Worker error: {e}"))
                time.sleep(5)

            time.sleep(1)  # Poll interval
