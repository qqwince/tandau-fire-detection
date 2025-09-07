import os
import requests
from datetime import datetime

SITE_API_URL = "http://127.0.0.1:8000/api/fire/"  # адрес при локальной работе

# можно заранее задать координаты камер:
CAMERA_COORDINATES = {
    "Камера №1": (53.279068, 69.3852623),  # МШГ №5
    "Камера №2": (59.9343, 30.3351),  # Санкт-Петербург
    "Камера №3": (56.8389, 60.6057),  # Екатеринбург
}

def _get_access_token() -> str | None:
    # Читаем токен из переменной окружения или файла token.txt рядом со скриптом
    token = os.getenv("FIRE_API_TOKEN") or os.getenv("ACCESS_TOKEN")
    if token:
        return token.strip()
    token_file = os.path.join(os.path.dirname(__file__), "token.txt")
    if os.path.exists(token_file):
        try:
            with open(token_file, "r", encoding="utf-8") as f:
                return f.read().strip()
        except Exception:
            pass
    return None


def _get_session_id() -> int | None:
    # Берём ID сессии из переменной окружения или файла session.txt
    raw = os.getenv("FIRE_SESSION_ID") or os.getenv("SESSION_ID")
    if raw:
        try:
            return int(str(raw).strip())
        except ValueError:
            print(f"⚠️ Некорректное значение переменной окружения FIRE_SESSION_ID/SESSION_ID: '{raw}' — ожидалось число.")

    session_file = os.path.join(os.path.dirname(__file__), "session.txt")
    if os.path.exists(session_file):
        try:
            with open(session_file, "r", encoding="utf-8") as f:
                content = f.read().strip().lstrip("\ufeff")
            # ID считаем валидным только если файл содержит ТОЛЬКО цифры
            import re
            if re.fullmatch(r"\d+", content):
                return int(content)
            # иначе пусть обработает ветка с кодом
        except Exception as e:
            print(f"⚠️ Ошибка чтения session.txt по пути {session_file}: {e}")
    else:
        print(f"ℹ️ Файл session.txt не найден по пути: {session_file}")
    return None


def _get_session_code() -> str | None:
    # Позволяем указывать код сессии (join_code) через переменную окружения или файл session.txt
    # Приоритет: явные переменные окружения, затем содержимое файла, если там не число
    code_env = os.getenv("FIRE_SESSION_CODE") or os.getenv("SESSION_CODE")
    if code_env:
        return str(code_env).strip()

    session_file = os.path.join(os.path.dirname(__file__), "session.txt")
    if os.path.exists(session_file):
        try:
            with open(session_file, "r", encoding="utf-8") as f:
                content = f.read().strip().lstrip("\ufeff")
            # Если в файле не распозналось целое число — трактуем как код
            import re
            match = re.fullmatch(r"[A-Za-z0-9_-]+", content)
            if match:
                return content
        except Exception:
            pass
    return None


def send_to_site(image_path, location, conf):
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
        "conf": conf*100,
    }

    token = _get_access_token()
    session_id = _get_session_id()
    session_code = _get_session_code()

    files = None
    file_obj = None

    try:
        file_obj = open(image_path, "rb")
        files = {"image": file_obj}

        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        else:
            print("⚠️ Токен не найден. Установите переменную окружения FIRE_API_TOKEN или положите token.txt со значением токена рядом со скриптом.")
        if session_id is not None:
            data["session"] = session_id
        elif session_code:
            data["join_code"] = session_code
        else:
            print("ℹ️ ID/код сессии не задан. Установите FIRE_SESSION_ID или FIRE_SESSION_CODE, либо создайте session.txt с числом (ID) или кодом (например ML6GW81a).")

        response = requests.post(SITE_API_URL, data=data, files=files, headers=headers)
        if response.status_code == 201:
            print(f"✅ Данные и изображение с {location} отправлены на сайт.")
        else:
            print(f"❌ Ошибка отправки: {response.status_code} — {response.text}")
    except Exception as e:
        print(f"❌ Ошибка соединения: {e}")
    finally:
        try:
            if file_obj:
                file_obj.close()
        except Exception:
            pass
