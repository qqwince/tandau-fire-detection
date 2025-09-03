import requests
from datetime import datetime

SITE_API_URL = "http://192.168.100.111:9999/api/fire/"  # адрес при локальной работе

# можно заранее задать координаты камер:
CAMERA_COORDINATES = {
    "Камера №1": (53.279068, 69.3852623),  # МШГ №5
    "Камера №2": (59.9343, 30.3351),  # Санкт-Петербург
    "Камера №3": (56.8389, 60.6057),  # Екатеринбург
}

def send_to_site(image_path, location):
    now = datetime.now().isoformat()
    lat, lon = CAMERA_COORDINATES.get(location, (None, None))

    if lat is None or lon is None:
        print(f"⚠️ Неизвестные координаты для {location}, данные не отправлены.")
        return

    data = {
        "location": location,
        "time": now,
        "description": f"Автоматическое обнаружение на {location}",
        "latitude": lat,
        "longitude": lon,
    }

    files = {
        "image": open(image_path, "rb")
    }

    try:
        response = requests.post(SITE_API_URL, data=data, files=files)
        if response.status_code == 201:
            print(f"✅ Данные и изображение с {location} отправлены на сайт.")
        else:
            print(f"❌ Ошибка отправки: {response.status_code} — {response.text}")
    except Exception as e:
        print(f"❌ Ошибка соединения: {e}")
