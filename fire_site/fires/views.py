from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.response import Response
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.core.paginator import Paginator
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth.models import User
from django.utils.crypto import get_random_string
from .models import Fire, Session, Membership, JoinRequest
from .serializers import (
    FireSerializer,
    UserRegistrationSerializer,
    UserLoginSerializer,
    UserSerializer,
    SessionSerializer,
    MembershipSerializer,
    JoinRequestSerializer,
)
from django.http import StreamingHttpResponse
import json
import queue
from typing import Dict, Any


class FirePagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100
# ---------------- Simple in-memory SSE broadcaster ----------------
_subscribers: list[queue.Queue] = []

def _sse_broadcast(event: Dict[str, Any]) -> None:
    # push to all active subscribers; drop quietly if closed
    for q in list(_subscribers):
        try:
            q.put_nowait(event)
        except Exception:
            pass


from django.views.decorators.http import require_GET
from django.views.decorators.csrf import csrf_exempt


@csrf_exempt
@require_GET
def fire_stream(request):
    """Plain Django SSE endpoint to avoid DRF content negotiation issues."""
    client_queue: queue.Queue = queue.Queue()
    _subscribers.append(client_queue)

    def event_stream():
        yield "retry: 2000\n\n"
        try:
            while True:
                try:
                    event = client_queue.get(timeout=30)
                    payload = json.dumps(event, ensure_ascii=False)
                    yield f"data: {payload}\n\n"
                except queue.Empty:
                    yield ": keep-alive\n\n"
        finally:
            try:
                _subscribers.remove(client_queue)
            except ValueError:
                pass

    response = StreamingHttpResponse(event_stream(), content_type='text/event-stream')
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'
    return response


# Аутентификация views
@api_view(['POST'])
@permission_classes([AllowAny])
def register_user(request):
    serializer = UserRegistrationSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        return Response({
            'user': UserSerializer(user).data,
            'tokens': {
                'access': str(refresh.access_token),
                'refresh': str(refresh),
            }
        }, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
@permission_classes([AllowAny])
def login_user(request):
    serializer = UserLoginSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.validated_data['user']
        refresh = RefreshToken.for_user(user)
        return Response({
            'user': UserSerializer(user).data,
            'tokens': {
                'access': str(refresh.access_token),
                'refresh': str(refresh),
            }
        }, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
@permission_classes([AllowAny])
def refresh_token(request):
    refresh_token = request.data.get('refresh')
    if refresh_token:
        try:
            refresh = RefreshToken(refresh_token)
            return Response({
                'access': str(refresh.access_token),
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': 'Недействительный токен'}, status=status.HTTP_400_BAD_REQUEST)
    return Response({'error': 'Токен обновления не предоставлен'}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_user_profile(request):
    serializer = UserSerializer(request.user)
    return Response(serializer.data, status=status.HTTP_200_OK)

@api_view(['POST'])
@permission_classes([AllowAny])
@authentication_classes([])
def receive_fire(request):
    # Разрешаем передавать либо числовой session (id), либо join_code
    data = request.data.copy()
    join_code = data.get('join_code') or data.get('session_code') or data.get('session_join_code')
    if join_code and not data.get('session'):
        try:
            session = Session.objects.get(join_code=join_code)
            data['session'] = session.id
        except Session.DoesNotExist:
            return Response({'error': 'Session with provided join_code not found'}, status=status.HTTP_404_NOT_FOUND)

    serializer = FireSerializer(data=data)
    if serializer.is_valid():
        instance = serializer.save()
        # broadcast SSE event
        try:
            _sse_broadcast({
                'type': 'fire_created',
                'id': instance.id,
                'session': instance.session_id,
                'location': instance.location,
                'time': instance.time.isoformat() if hasattr(instance.time, 'isoformat') else str(instance.time),
                'conf': instance.conf,
                'image': instance.image.url if getattr(instance, 'image', None) else '',
            })
        except Exception:
            pass

        # WebSocket broadcasting removed
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([AllowAny])
def list_fires(request):
    # Получаем параметры пагинации
    page = request.GET.get('page', 1)
    page_size = request.GET.get('page_size', 10)
    
    # Получаем параметры фильтрации
    location = request.GET.get('location')
    conf_min = request.GET.get('conf_min')
    conf_max = request.GET.get('conf_max')
    sort_field = request.GET.get('sort_field', 'time')
    sort_order = request.GET.get('sort_order', 'desc')
    
    # Фильтр по сессии (если указан session_id)
    session_id = request.GET.get('session_id')

    # Базовый запрос
    fires = Fire.objects.all()
    if session_id:
        try:
            fires = fires.filter(session_id=int(session_id))
        except ValueError:
            pass
    
    # Применяем фильтры
    if location:
        fires = fires.filter(location__icontains=location)
    
    if conf_min:
        try:
            fires = fires.filter(conf__gte=float(conf_min))
        except ValueError:
            pass
    
    if conf_max:
        try:
            fires = fires.filter(conf__lte=float(conf_max))
        except ValueError:
            pass
    
    # Применяем сортировку
    if sort_field == 'time':
        order_field = '-time' if sort_order == 'desc' else 'time'
    elif sort_field == 'conf':
        order_field = '-conf' if sort_order == 'desc' else 'conf'
    else:
        order_field = '-time'
    
    fires = fires.order_by(order_field)
    
    # Пагинация
    paginator = Paginator(fires, page_size)
    page_obj = paginator.get_page(page)
    
    serializer = FireSerializer(page_obj.object_list, many=True)
    
    return Response({
        'results': serializer.data,
        'count': paginator.count,
        'total_pages': paginator.num_pages,
        'current_page': page_obj.number,
        'has_next': page_obj.has_next(),
        'has_previous': page_obj.has_previous(),
        'next_page': page_obj.next_page_number() if page_obj.has_next() else None,
        'previous_page': page_obj.previous_page_number() if page_obj.has_previous() else None,
    }, status=status.HTTP_200_OK)


@api_view(['GET'])
def map_fires(request):
    fires = Fire.objects.filter(latitude__isnull=False, longitude__isnull=False).order_by('-time')
    fire_data = [
        {
            "location": fire.location,
            "time": fire.time.strftime("%Y-%m-%d %H:%M:%S"),
            "latitude": fire.latitude,
            "longitude": fire.longitude,
            "image_url": fire.image.url if fire.image else ""
        }
        for fire in fires
    ]
    return Response(fire_data, status=status.HTTP_200_OK)


# ---------------- SESSIONS & MEMBERSHIPS ----------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_session(request):
    name = request.data.get('name')
    if not name:
        return Response({'error': 'name is required'}, status=status.HTTP_400_BAD_REQUEST)

    join_code = get_random_string(8)
    session = Session.objects.create(name=name, owner=request.user, join_code=join_code)
    # Owner becomes admin member
    Membership.objects.create(user=request.user, session=session, role='admin', is_active=True)
    return Response(SessionSerializer(session).data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_sessions(request):
    memberships = Membership.objects.filter(user=request.user, is_active=True).select_related('session')
    sessions = [m.session for m in memberships]
    return Response(SessionSerializer(sessions, many=True).data, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def request_join_by_code(request):
    code = request.data.get('join_code')
    if not code:
        return Response({'error': 'join_code is required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        session = Session.objects.get(join_code=code)
    except Session.DoesNotExist:
        return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)

    # Check if blocked
    blocked = JoinRequest.objects.filter(session=session, requester=request.user, status='blocked').exists()
    if blocked:
        return Response({'error': 'You are blocked from this session'}, status=status.HTTP_403_FORBIDDEN)

    jr, created = JoinRequest.objects.get_or_create(session=session, requester=request.user)
    if not created and jr.status == 'denied':
        jr.status = 'pending'
        jr.save(update_fields=['status'])

    return Response(JoinRequestSerializer(jr).data, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def pending_requests_for_session(request, session_id: int):
    try:
        session = Session.objects.get(id=session_id)
    except Session.DoesNotExist:
        return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)

    # Only owner or admin can view
    is_admin = (
        session.owner_id == request.user.id or
        Membership.objects.filter(user=request.user, session=session, role='admin', is_active=True).exists()
    )
    if not is_admin:
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    requests_qs = JoinRequest.objects.filter(session=session, status='pending').select_related('requester')
    return Response(JoinRequestSerializer(requests_qs, many=True).data, status=status.HTTP_200_OK)


def _ensure_admin(user: User, session: Session) -> bool:
    return (
        session.owner_id == user.id or
        Membership.objects.filter(user=user, session=session, role='admin', is_active=True).exists()
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def approve_request(request, request_id: int):
    try:
        jr = JoinRequest.objects.select_related('session', 'requester').get(id=request_id)
    except JoinRequest.DoesNotExist:
        return Response({'error': 'Request not found'}, status=status.HTTP_404_NOT_FOUND)

    if not _ensure_admin(request.user, jr.session):
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    jr.status = 'approved'
    jr.save(update_fields=['status'])
    Membership.objects.get_or_create(user=jr.requester, session=jr.session, defaults={'role': 'member', 'is_active': True})
    return Response(JoinRequestSerializer(jr).data, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def deny_request(request, request_id: int):
    try:
        jr = JoinRequest.objects.select_related('session').get(id=request_id)
    except JoinRequest.DoesNotExist:
        return Response({'error': 'Request not found'}, status=status.HTTP_404_NOT_FOUND)

    if not _ensure_admin(request.user, jr.session):
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    jr.status = 'denied'
    jr.save(update_fields=['status'])
    return Response(JoinRequestSerializer(jr).data, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def block_requester(request, session_id: int, user_id: int):
    try:
        session = Session.objects.get(id=session_id)
    except Session.DoesNotExist:
        return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)

    if not _ensure_admin(request.user, session):
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    jr, _ = JoinRequest.objects.get_or_create(session=session, requester_id=user_id)
    jr.status = 'blocked'
    jr.save(update_fields=['status'])

    # Optionally deactivate membership
    Membership.objects.filter(user_id=user_id, session=session).update(is_active=False)

    return Response(JoinRequestSerializer(jr).data, status=status.HTTP_200_OK)
