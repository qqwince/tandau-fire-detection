from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.core.paginator import Paginator
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth.models import User
from .models import Fire
from .serializers import FireSerializer, UserRegistrationSerializer, UserLoginSerializer, UserSerializer


class FirePagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100


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
def receive_fire(request):
    serializer = FireSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
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
    
    # Базовый запрос
    fires = Fire.objects.all()
    
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
