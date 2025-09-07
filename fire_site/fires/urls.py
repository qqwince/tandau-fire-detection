from django.urls import path
from .views import (
    receive_fire, list_fires, map_fires,
    register_user, login_user, refresh_token, get_user_profile
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
]
