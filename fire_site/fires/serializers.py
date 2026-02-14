from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from .models import Fire, Session, Membership, JoinRequest, SessionAuditLog

class FireSerializer(serializers.ModelSerializer):
    session_name = serializers.ReadOnlyField(source='session.name')
    
    class Meta:
        model = Fire
        fields = '__all__'


class SessionSerializer(serializers.ModelSerializer):
    owner_username = serializers.ReadOnlyField(source='owner.username')

    class Meta:
        model = Session
        fields = ('id', 'name', 'owner', 'owner_username', 'join_code', 'created_at')
        read_only_fields = ('owner', 'join_code', 'created_at')


class MembershipSerializer(serializers.ModelSerializer):
    username = serializers.ReadOnlyField(source='user.username')

    class Meta:
        model = Membership
        fields = ('id', 'user', 'username', 'session', 'role', 'is_active', 'created_at')
        read_only_fields = ('user', 'is_active', 'created_at')


class JoinRequestSerializer(serializers.ModelSerializer):
    requester_username = serializers.ReadOnlyField(source='requester.username')
    requester_first_name = serializers.ReadOnlyField(source='requester.first_name')
    requester_last_name = serializers.ReadOnlyField(source='requester.last_name')
    requester_email = serializers.ReadOnlyField(source='requester.email')

    class Meta:
        model = JoinRequest
        fields = (
            'id',
            'session',
            'requester',
            'requester_username',
            'requester_first_name',
            'requester_last_name',
            'requester_email',
            'status',
            'created_at',
            'updated_at',
        )
        read_only_fields = ('requester', 'status', 'created_at', 'updated_at')


class SessionAuditLogSerializer(serializers.ModelSerializer):
    actor_username = serializers.SerializerMethodField()
    target_username = serializers.SerializerMethodField()
    action_display = serializers.CharField(source='get_action_display', read_only=True)
    role_display = serializers.SerializerMethodField()

    class Meta:
        model = SessionAuditLog
        fields = ('id', 'session', 'actor', 'actor_username', 'action', 'action_display', 'target_user', 'target_username', 'role_granted', 'role_display', 'created_at')

    def get_role_display(self, obj):
        if not obj.role_granted:
            return None
        role_map = {'admin': 'Админ', 'moderator': 'Модератор', 'member': 'Участник'}
        return role_map.get(obj.role_granted, obj.role_granted)

    def get_actor_username(self, obj):
        return obj.actor.username if obj.actor else None

    def get_target_username(self, obj):
        return obj.target_user.username if obj.target_user else None


class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)
    
    class Meta:
        model = User
        fields = ('username', 'email', 'password', 'password_confirm', 'first_name', 'last_name')
    
    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError("Пароли не совпадают")
        return attrs
    
    def create(self, validated_data):
        validated_data.pop('password_confirm')
        user = User.objects.create_user(**validated_data)
        return user

class UserLoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField()
    
    def validate(self, attrs):
        username = attrs.get('username')
        password = attrs.get('password')
        
        if username and password:
            user = authenticate(username=username, password=password)
            if not user:
                raise serializers.ValidationError('Неверные учетные данные')
            if not user.is_active:
                raise serializers.ValidationError('Аккаунт деактивирован')
            attrs['user'] = user
        else:
            raise serializers.ValidationError('Необходимо указать имя пользователя и пароль')
        
        return attrs

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'first_name', 'last_name', 'date_joined')
