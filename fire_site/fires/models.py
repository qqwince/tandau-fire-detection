from django.db import models
from django.contrib.auth.models import User


class Session(models.Model):
    name = models.CharField(max_length=255)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='owned_sessions')
    join_code = models.CharField(max_length=36, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.name} ({self.owner.username})"


class Membership(models.Model):
    ROLE_CHOICES = (
        ('admin', 'Admin'),
        ('member', 'Member'),
    )
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='memberships')
    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name='memberships')
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='member')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'session')

    def __str__(self) -> str:
        return f"{self.user.username} in {self.session.name} as {self.role}"


class JoinRequest(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('denied', 'Denied'),
        ('blocked', 'Blocked'),
    )
    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name='join_requests')
    requester = models.ForeignKey(User, on_delete=models.CASCADE, related_name='join_requests')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('session', 'requester')

    def __str__(self) -> str:
        return f"{self.requester.username} -> {self.session.name} ({self.status})"


class Fire(models.Model):
    image = models.ImageField(upload_to='fire_photos/', null=True, blank=True)
    location = models.CharField(max_length=255)
    time = models.DateTimeField()
    description = models.TextField(blank=True)

    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    conf = models.FloatField(null=True, blank=True)

    session = models.ForeignKey(Session, on_delete=models.CASCADE, null=True, blank=True, related_name='fires')

    def __str__(self):
        return f"{self.location} @ {self.time.strftime('%Y-%m-%d %H:%M')}"
