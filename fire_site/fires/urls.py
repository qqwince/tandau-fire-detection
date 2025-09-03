from django.urls import path
from .views import receive_fire, list_fires, map_fires

urlpatterns = [
    path('api/fire/', receive_fire, name='receive_fire'),       # POST для создания пожара
    path('api/fires/', list_fires, name='list_fires'),         # GET для всех пожаров
    path('api/fires/map/', map_fires, name='map_fires'),       # GET для данных с координатами
]
