from django.db import models

class Fire(models.Model):
    image = models.ImageField(upload_to='fire_photos/', null=True, blank=True)
    location = models.CharField(max_length=255)
    time = models.DateTimeField()
    description = models.TextField(blank=True)
    
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    conf = models.FloatField(null=True, blank=True)
    
    def __str__(self):
        return f"{self.location} @ {self.time.strftime('%Y-%m-%d %H:%M')}"
