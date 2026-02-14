from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.response import Response
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.core.paginator import Paginator
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth.models import User
from django.utils.crypto import get_random_string
from .models import Fire, Session, Membership, JoinRequest, SessionAuditLog
from .serializers import (
    FireSerializer,
    UserRegistrationSerializer,
    UserLoginSerializer,
    UserSerializer,
    SessionSerializer,
    MembershipSerializer,
    JoinRequestSerializer,
    SessionAuditLogSerializer,
)
from django.http import StreamingHttpResponse, HttpResponse
from django.db.models import Q
from django.utils import timezone
from datetime import timedelta
import json
import queue
import zipfile
import io
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
@permission_classes([IsAuthenticated])
def list_fires(request):
    # Пожары только из сессий, участником которых является текущий пользователь
    allowed_session_ids = _session_ids_for_user(request.user)
    # Базовый запрос: только пожары из доступных сессий; по умолчанию не скрытые
    include_hidden = request.GET.get('include_hidden', '').lower() in ('1', 'true', 'yes')
    fires = Fire.objects.filter(session_id__in=allowed_session_ids)
    if not include_hidden:
        fires = fires.filter(hidden=False)

    # Получаем параметры пагинации
    page = request.GET.get('page', 1)
    page_size = request.GET.get('page_size', 10)
    
    # Получаем параметры фильтрации
    location = request.GET.get('location')
    conf_min = request.GET.get('conf_min')
    conf_max = request.GET.get('conf_max')
    sort_field = request.GET.get('sort_field', 'time')
    sort_order = request.GET.get('sort_order', 'desc')
    
    # Фильтр по сессии (если указан session_id) — только если сессия доступна пользователю
    session_id = request.GET.get('session_id')
    if session_id:
        try:
            sid = int(session_id)
            if sid in allowed_session_ids:
                fires = fires.filter(session_id=sid)
        except ValueError:
            pass
    
    # Поиск по отчётам (id, локация, описание)
    search = (request.GET.get('search') or request.GET.get('q') or '').strip()
    if search:
        q = Q(location__icontains=search) | Q(description__icontains=search)
        if search.isdigit():
            q = q | Q(id=int(search))
        fires = fires.filter(q)

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
@permission_classes([IsAuthenticated])
def export_fires_zip(request):
    """Скачать выбранные отчёты в ZIP (изображения + манифест). Параметр ids=1,2,3."""
    allowed_session_ids = _session_ids_for_user(request.user)
    ids_param = request.GET.get('ids', '')
    if not ids_param:
        return Response({'error': 'ids is required (comma-separated)'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        ids = [int(x.strip()) for x in ids_param.split(',') if x.strip()]
    except ValueError:
        return Response({'error': 'Invalid ids'}, status=status.HTTP_400_BAD_REQUEST)
    if not ids:
        return Response({'error': 'No valid ids'}, status=status.HTTP_400_BAD_REQUEST)

    fires = Fire.objects.filter(id__in=ids, session_id__in=allowed_session_ids).select_related('session')
    if not fires.exists():
        return Response({'error': 'No accessible reports found'}, status=status.HTTP_404_NOT_FOUND)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        lines = []
        for f in fires:
            prefix = f'report_{f.id}'
            # Текстовый манифест по отчёту
            info = (
                f"ID: {f.id}\n"
                f"Локация: {f.location}\n"
                f"Время: {f.time.strftime('%Y-%m-%d %H:%M:%S')}\n"
                f"Координаты: {f.latitude},{f.longitude}\n"
                f"Точность: {f.conf}\n"
                f"Сессия: {f.session.name if f.session_id else '—'}\n"
                f"Описание: {f.description or '—'}\n"
            )
            zf.writestr(f'{prefix}_info.txt', info.encode('utf-8'))
            if f.image:
                try:
                    f.image.open('rb')
                    zf.writestr(f'{prefix}.jpg', f.image.read())
                finally:
                    f.image.close()
            lines.append(f"{f.id};{f.location};{f.time.isoformat()};{f.latitude};{f.longitude};{f.conf}")
        zf.writestr('manifest.csv', '\n'.join(['id;location;time;lat;lon;conf'] + lines).encode('utf-8'))

    buf.seek(0)
    response = HttpResponse(buf.getvalue(), content_type='application/zip')
    response['Content-Disposition'] = 'attachment; filename="fire_reports.zip"'
    return response


@api_view(['PATCH', 'POST'])
@permission_classes([IsAuthenticated])
def set_fire_approved(request, fire_id: int):
    """Установить/снять статус «подтверждён» у отчёта. Только для отчётов из своих сессий."""
    allowed_session_ids = _session_ids_for_user(request.user)
    fire = Fire.objects.filter(id=fire_id, session_id__in=allowed_session_ids).first()
    if not fire:
        return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
    approved = request.data.get('approved')
    if approved is None:
        fire.approved = not fire.approved
    else:
        fire.approved = bool(approved)
    fire.save(update_fields=['approved'])
    return Response(FireSerializer(fire).data, status=status.HTTP_200_OK)


def _parse_older_than(request):
    """Вернуть (cutoff_datetime, error_response) или (cutoff, None)."""
    try:
        n = int(request.GET.get('older_than') or request.data.get('older_than', 0))
    except (TypeError, ValueError):
        return None, Response({'error': 'older_than must be a positive integer'}, status=status.HTTP_400_BAD_REQUEST)
    if n <= 0:
        return None, Response({'error': 'older_than must be positive'}, status=status.HTTP_400_BAD_REQUEST)
    unit = (request.GET.get('unit') or request.data.get('unit') or 'days').strip().lower()
    unit_map = {
        'minute': timedelta(minutes=1),
        'minutes': timedelta(minutes=1),
        'hour': timedelta(hours=1),
        'hours': timedelta(hours=1),
        'day': timedelta(days=1),
        'days': timedelta(days=1),
        'week': timedelta(weeks=1),
        'weeks': timedelta(weeks=1),
        'month': timedelta(days=30),
        'months': timedelta(days=30),
    }
    delta = unit_map.get(unit)
    if not delta:
        return None, Response({'error': 'unit must be: minutes, hours, days, weeks, months'}, status=status.HTTP_400_BAD_REQUEST)
    cutoff = timezone.now() - (delta * n)
    return cutoff, None


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def hide_fires_by_age(request):
    """Скрыть отчёты старше N единиц времени (из своих сессий). Возвращает hidden_ids для отмены."""
    allowed_session_ids = _session_ids_for_user(request.user)
    cutoff, err = _parse_older_than(request)
    if err:
        return err
    qs = Fire.objects.filter(
        session_id__in=allowed_session_ids,
        time__lt=cutoff,
        hidden=False,
    )
    hidden_ids = list(qs.values_list('id', flat=True))
    qs.update(hidden=True)
    return Response({'hidden_count': len(hidden_ids), 'hidden_ids': hidden_ids}, status=status.HTTP_200_OK)


@api_view(['DELETE', 'POST'])
@permission_classes([IsAuthenticated])
def delete_fires_by_age(request):
    """Безвозвратно удалить отчёты старше N единиц времени (из своих сессий). DELETE/POST ?older_than=N&unit=days."""
    allowed_session_ids = _session_ids_for_user(request.user)
    cutoff, err = _parse_older_than(request)
    if err:
        return err
    deleted, _ = Fire.objects.filter(
        session_id__in=allowed_session_ids,
        time__lt=cutoff,
    ).delete()
    return Response({'deleted_count': deleted}, status=status.HTTP_200_OK)


@api_view(['PATCH', 'POST'])
@permission_classes([IsAuthenticated])
def unhide_fire(request, fire_id: int):
    """Вернуть отчёт из скрытых (только из своих сессий)."""
    allowed_session_ids = _session_ids_for_user(request.user)
    fire = Fire.objects.filter(id=fire_id, session_id__in=allowed_session_ids).first()
    if not fire:
        return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
    fire.hidden = False
    fire.save(update_fields=['hidden'])
    return Response(FireSerializer(fire).data, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def unhide_fires(request):
    """Вернуть из скрытых отчёты по списку id (для отмены скрытия). POST body: { fire_ids: [1,2,3] }."""
    allowed_session_ids = _session_ids_for_user(request.user)
    fire_ids = request.data.get('fire_ids') or request.data.get('ids') or []
    if not fire_ids:
        return Response({'unhidden_count': 0}, status=status.HTTP_200_OK)
    try:
        ids = [int(x) for x in fire_ids]
    except (TypeError, ValueError):
        return Response({'error': 'fire_ids must be list of integers'}, status=status.HTTP_400_BAD_REQUEST)
    updated = Fire.objects.filter(
        id__in=ids,
        session_id__in=allowed_session_ids,
        hidden=True,
    ).update(hidden=False)
    return Response({'unhidden_count': updated}, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def map_fires(request):
    allowed_session_ids = _session_ids_for_user(request.user)
    fires = Fire.objects.filter(
        session_id__in=allowed_session_ids,
        hidden=False,
        latitude__isnull=False,
        longitude__isnull=False,
    ).order_by('-time')
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
    if not created:
        if jr.status == 'denied':
            jr.status = 'pending'
            jr.save(update_fields=['status'])
        elif jr.status == 'approved':
            # Был исключён: заявка снова должна попасть в ожидающие для повторного одобрения
            is_active_member = Membership.objects.filter(
                user=request.user, session=session, is_active=True
            ).exists()
            if not is_active_member:
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


def _session_ids_for_user(user: User):
    """Сессии, в которых пользователь владелец или активный участник (для фильтрации пожаров)."""
    if not user or not user.is_authenticated:
        return []
    owned = set(Session.objects.filter(owner=user).values_list('id', flat=True))
    member = set(Membership.objects.filter(user=user, is_active=True).values_list('session_id', flat=True))
    return list(owned | member)


def _ensure_admin(user: User, session: Session) -> bool:
    return (
        session.owner_id == user.id or
        Membership.objects.filter(user=user, session=session, role='admin', is_active=True).exists()
    )

def _ensure_admin_or_moderator(user: User, session: Session) -> bool:
    """Проверяет, является ли пользователь админом или модератором"""
    return (
        session.owner_id == user.id or
        Membership.objects.filter(user=user, session=session, role__in=['admin', 'moderator'], is_active=True).exists()
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
    membership, created = Membership.objects.get_or_create(
        user=jr.requester, session=jr.session, defaults={'role': 'member', 'is_active': True}
    )
    if not created and not membership.is_active:
        membership.is_active = True
        membership.save(update_fields=['is_active'])
    SessionAuditLog.objects.create(session=jr.session, actor=request.user, action='approved', target_user=jr.requester)
    return Response(JoinRequestSerializer(jr).data, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def deny_request(request, request_id: int):
    try:
        jr = JoinRequest.objects.select_related('session', 'requester').get(id=request_id)
    except JoinRequest.DoesNotExist:
        return Response({'error': 'Request not found'}, status=status.HTTP_404_NOT_FOUND)

    if not _ensure_admin(request.user, jr.session):
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    jr.status = 'denied'
    jr.save(update_fields=['status'])
    SessionAuditLog.objects.create(session=jr.session, actor=request.user, action='denied', target_user=jr.requester)
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

    Membership.objects.filter(user_id=user_id, session=session).update(is_active=False)
    SessionAuditLog.objects.create(session=session, actor=request.user, action='blocked', target_user_id=user_id)

    return Response(JoinRequestSerializer(jr).data, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def unblock_user(request, session_id: int, user_id: int):
    try:
        session = Session.objects.get(id=session_id)
    except Session.DoesNotExist:
        return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)

    if not _ensure_admin(request.user, session):
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    jr = JoinRequest.objects.filter(session=session, requester_id=user_id, status='blocked').first()
    if not jr:
        return Response({'error': 'User is not blocked'}, status=status.HTTP_400_BAD_REQUEST)

    jr.status = 'denied'
    jr.save(update_fields=['status'])
    SessionAuditLog.objects.create(session=session, actor=request.user, action='unblocked', target_user_id=user_id)
    return Response({'status': 'unblocked'}, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def session_members(request, session_id: int):
    try:
        session = Session.objects.get(id=session_id)
    except Session.DoesNotExist:
        return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)

    if not _ensure_admin(request.user, session):
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    members = Membership.objects.filter(session=session, is_active=True).select_related('user').order_by('role', 'user__username')
    return Response(MembershipSerializer(members, many=True).data, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def session_blocked(request, session_id: int):
    try:
        session = Session.objects.get(id=session_id)
    except Session.DoesNotExist:
        return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)

    if not _ensure_admin(request.user, session):
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    blocked = JoinRequest.objects.filter(session=session, status='blocked').select_related('requester').order_by('requester__username')
    return Response(JoinRequestSerializer(blocked, many=True).data, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def session_audit_log(request, session_id: int):
    try:
        session = Session.objects.get(id=session_id)
    except Session.DoesNotExist:
        return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)

    if not _ensure_admin(request.user, session):
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    logs = SessionAuditLog.objects.filter(session=session).select_related('actor', 'target_user').order_by('-created_at')[:100]
    return Response(SessionAuditLogSerializer(logs, many=True).data, status=status.HTTP_200_OK)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def rename_session(request, session_id: int):
    """Переименование сессии (только владелец или админ)"""
    try:
        session = Session.objects.get(id=session_id)
    except Session.DoesNotExist:
        return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)

    if not _ensure_admin(request.user, session):
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    new_name = request.data.get('name')
    if not new_name or not new_name.strip():
        return Response({'error': 'name is required'}, status=status.HTTP_400_BAD_REQUEST)

    session.name = new_name.strip()
    session.save(update_fields=['name'])
    SessionAuditLog.objects.create(session=session, actor=request.user, action='removed', target_user=None)
    return Response(SessionSerializer(session).data, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_member_role(request, session_id: int, user_id: int):
    """Изменение роли участника (только админ, модератор не может давать админку)"""
    try:
        session = Session.objects.get(id=session_id)
    except Session.DoesNotExist:
        return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)

    # Проверяем права - только админ или модератор
    if not _ensure_admin_or_moderator(request.user, session):
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    # Проверяем, является ли текущий пользователь модератором
    current_membership = Membership.objects.filter(user=request.user, session=session, is_active=True).first()
    is_moderator = current_membership and current_membership.role == 'moderator'

    new_role = request.data.get('role')
    if new_role not in ['admin', 'moderator', 'member']:
        return Response({'error': 'Invalid role'}, status=status.HTTP_400_BAD_REQUEST)

    # Модератор не может давать админку
    if is_moderator and new_role == 'admin':
        return Response({'error': 'Moderators cannot assign admin role'}, status=status.HTTP_403_FORBIDDEN)

    # Нельзя изменить роль владельца
    if session.owner_id == user_id:
        return Response({'error': 'Cannot change owner role'}, status=status.HTTP_400_BAD_REQUEST)

    membership = Membership.objects.filter(user_id=user_id, session=session).first()
    if not membership:
        return Response({'error': 'User is not a member of this session'}, status=status.HTTP_404_NOT_FOUND)

    old_role = membership.role
    membership.role = new_role
    membership.save(update_fields=['role'])

    SessionAuditLog.objects.create(
        session=session,
        actor=request.user,
        action='role_changed',
        target_user_id=user_id,
        role_granted=new_role,
    )

    return Response(MembershipSerializer(membership).data, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def remove_member(request, session_id: int, user_id: int):
    """Исключить участника из сессии (админ или модератор). Владельца исключить нельзя."""
    try:
        session = Session.objects.get(id=session_id)
    except Session.DoesNotExist:
        return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)

    if not _ensure_admin_or_moderator(request.user, session):
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    if session.owner_id == user_id:
        return Response({'error': 'Cannot remove session owner'}, status=status.HTTP_400_BAD_REQUEST)

    membership = Membership.objects.filter(user_id=user_id, session=session).first()
    if not membership:
        return Response({'error': 'User is not a member of this session'}, status=status.HTTP_404_NOT_FOUND)
    if not membership.is_active:
        return Response({'error': 'User is already removed from session'}, status=status.HTTP_400_BAD_REQUEST)

    membership.is_active = False
    membership.save(update_fields=['is_active'])
    SessionAuditLog.objects.create(
        session=session,
        actor=request.user,
        action='removed',
        target_user_id=user_id,
    )
    return Response({'status': 'ok'}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def refresh_join_code(request, session_id: int):
    """Обновить код сессии: старый код становится недействительным, выдаётся новый. Только владелец или админ."""
    try:
        session = Session.objects.get(id=session_id)
    except Session.DoesNotExist:
        return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)

    if not _ensure_admin(request.user, session):
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    old_code = session.join_code
    new_code = get_random_string(8)
    while new_code == old_code:
        new_code = get_random_string(8)
    session.join_code = new_code
    session.save(update_fields=['join_code'])
    session.refresh_from_db()
    return Response(SessionSerializer(session).data, status=status.HTTP_200_OK)
