from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from .models import Fire
from .serializers import FireSerializer


@api_view(['POST'])
def receive_fire(request):
    serializer = FireSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
def list_fires(request):
    fires = Fire.objects.order_by('-time')
    serializer = FireSerializer(fires, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


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
