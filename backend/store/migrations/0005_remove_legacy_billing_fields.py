from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0001_initial"),
        ("store", "0004_resize_embeddings_to_1024"),
    ]

    operations = [
        migrations.RemoveField(model_name="store", name="billing_cycle_end"),
        migrations.RemoveField(model_name="store", name="conversation_count"),
        migrations.RemoveField(model_name="store", name="plan"),
        migrations.RemoveField(model_name="store", name="subscription_status"),
        migrations.RemoveField(model_name="store", name="trial_ends_at"),
    ]
