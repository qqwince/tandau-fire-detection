# Generated migration for Fire.hidden

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('fires', '0008_fire_approved'),
    ]

    operations = [
        migrations.AddField(
            model_name='fire',
            name='hidden',
            field=models.BooleanField(default=False),
        ),
    ]
