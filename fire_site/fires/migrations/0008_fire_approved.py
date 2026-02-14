# Generated migration for Fire.approved

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('fires', '0007_audit_log_role_granted'),
    ]

    operations = [
        migrations.AddField(
            model_name='fire',
            name='approved',
            field=models.BooleanField(default=False),
        ),
    ]
