from django.urls import path
from .views import (
    receive_fire, list_fires, map_fires, export_fires_zip, set_fire_approved,
    hide_fires_by_age, delete_fires_by_age, unhide_fire, unhide_fires,
    register_user, login_user, refresh_token, get_user_profile,
    create_session, my_sessions, request_join_by_code,
    pending_requests_for_session, approve_request, deny_request, block_requester,
    unblock_user, session_members, session_blocked, session_audit_log,
    rename_session, change_member_role, remove_member, refresh_join_code,
    fire_stream,
)

urlpatterns = [
    # Аутентификация
    path('api/auth/register/', register_user, name='register_user'),
    path('api/auth/login/', login_user, name='login_user'),
    path('api/auth/refresh/', refresh_token, name='refresh_token'),
    path('api/auth/profile/', get_user_profile, name='get_user_profile'),
    
    # Пожары
    path('api/fire/', receive_fire, name='receive_fire'),       # POST для создания пожара
    path('api/fire', receive_fire),                             # без слэша на случай POST без APPEND_SLASH
    path('api/fires/', list_fires, name='list_fires'),         # GET для всех пожаров
    path('api/fires/export/', export_fires_zip, name='export_fires_zip'),  # GET ?ids=1,2,3 → ZIP
    path('api/fires/<int:fire_id>/approve/', set_fire_approved, name='set_fire_approved'),  # PATCH/POST { approved: bool }
    path('api/fires/hide-by-age/', hide_fires_by_age, name='hide_fires_by_age'),   # POST ?older_than=N&unit=days
    path('api/fires/delete-by-age/', delete_fires_by_age, name='delete_fires_by_age'),  # DELETE/POST ?older_than=N&unit=days
    path('api/fires/unhide/', unhide_fires, name='unhide_fires'),  # POST { fire_ids: [1,2,3] } — отмена скрытия
    path('api/fires/<int:fire_id>/unhide/', unhide_fire, name='unhide_fire'),  # PATCH/POST — точечно вернуть один
    path('api/fires/map/', map_fires, name='map_fires'),       # GET для данных с координатами
    path('api/fires/stream/', fire_stream, name='fire_stream'),# SSE stream for new fires

    # Сессии и заявки
    path('api/sessions/', create_session, name='create_session'),            # POST create
    path('api/sessions/mine/', my_sessions, name='my_sessions'),             # GET my sessions
    path('api/sessions/join/', request_join_by_code, name='request_join_by_code'),  # POST join by code
    path('api/sessions/<int:session_id>/requests/', pending_requests_for_session, name='pending_requests_for_session'),  # GET pending
    path('api/requests/<int:request_id>/approve/', approve_request, name='approve_request'),   # POST approve
    path('api/requests/<int:request_id>/deny/', deny_request, name='deny_request'),            # POST deny
    path('api/sessions/<int:session_id>/block/<int:user_id>/', block_requester, name='block_requester'), # POST block
    path('api/sessions/<int:session_id>/unblock/<int:user_id>/', unblock_user, name='unblock_user'),
    path('api/sessions/<int:session_id>/members/', session_members, name='session_members'),
    path('api/sessions/<int:session_id>/blocked/', session_blocked, name='session_blocked'),
    path('api/sessions/<int:session_id>/audit-log/', session_audit_log, name='session_audit_log'),
    path('api/sessions/<int:session_id>/rename/', rename_session, name='rename_session'),
    path('api/sessions/<int:session_id>/members/<int:user_id>/role/', change_member_role, name='change_member_role'),
    path('api/sessions/<int:session_id>/members/<int:user_id>/remove/', remove_member, name='remove_member'),
    path('api/sessions/<int:session_id>/refresh-code/', refresh_join_code, name='refresh_join_code'),
]
