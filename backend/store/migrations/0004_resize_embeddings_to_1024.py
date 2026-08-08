import pgvector.django.vector
from django.db import migrations, models


def clear_existing_embeddings(apps, schema_editor) -> None:
    del schema_editor
    apps.get_model("store", "Product").objects.update(embedding=None)
    apps.get_model("store", "FAQ").objects.update(embedding=None)


class Migration(migrations.Migration):
    dependencies = [("store", "0003_faq_product_productvariation")]

    operations = [
        migrations.RunPython(clear_existing_embeddings, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="product",
            name="embedding",
            field=pgvector.django.vector.VectorField(
                blank=True,
                dimensions=1024,
                help_text="pgvector field — null until embedding pipeline runs",
                null=True,
            ),
        ),
        migrations.AlterField(
            model_name="faq",
            name="embedding",
            field=pgvector.django.vector.VectorField(
                blank=True,
                dimensions=1024,
                help_text="pgvector field — null until embedding pipeline runs",
                null=True,
            ),
        ),
    ]
