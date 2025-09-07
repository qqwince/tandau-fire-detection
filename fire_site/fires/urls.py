from django.urls import path
from .views import (
    receive_fire, list_fires, map_fires,
    register_user, login_user, refresh_token, get_user_profile,
    create_session, my_sessions, request_join_by_code,
    pending_requests_for_session, approve_request, deny_request, block_requester,
)

urlpatterns = [
    # Аутентификация
    path('api/auth/register/', register_user, name='register_user'),
    path('api/auth/login/', login_user, name='login_user'),
    path('api/auth/refresh/', refresh_token, name='refresh_token'),
    path('api/auth/profile/', get_user_profile, name='get_user_profile'),
    
    # Пожары
    path('api/fire/', receive_fire, name='receive_fire'),       # POST для создания пожара
    path('api/fires/', list_fires, name='list_fires'),         # GET для всех пожаров
    path('api/fires/map/', map_fires, name='map_fires'),       # GET для данных с координатами

    # Сессии и заявки
    path('api/sessions/', create_session, name='create_session'),            # POST create
    path('api/sessions/mine/', my_sessions, name='my_sessions'),             # GET my sessions
    path('api/sessions/join/', request_join_by_code, name='request_join_by_code'),  # POST join by code
    path('api/sessions/<int:session_id>/requests/', pending_requests_for_session, name='pending_requests_for_session'),  # GET pending
    path('api/requests/<int:request_id>/approve/', approve_request, name='approve_request'),   # POST approve
    path('api/requests/<int:request_id>/deny/', deny_request, name='deny_request'),            # POST deny
    path('api/sessions/<int:session_id>/block/<int:user_id>/', block_requester, name='block_requester'), # POST block
]
