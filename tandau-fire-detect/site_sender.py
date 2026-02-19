import os
import requests
from datetime import datetime, timezone

SITE_API_URL = "http://127.0.0.1:8000/api/fire/"  # адрес при локальной работе (можно переопределить env FIRE_SITE_API_URL)


def _get_site_api_url() -> str:
    """
    URL для отправки отчёта на сайт.
    Переопределение: переменная окружения FIRE_SITE_API_URL.
    """
    url = (os.getenv("FIRE_SITE_API_URL") or "").strip()
    return url or SITE_API_URL


class FatalConfigError(Exception):
    """Критическая ошибка конфигурации (неверный токен/сессия) — работу ИИ нужно остановить."""
    pass

# Кэш для координат компьютера (чтобы не запрашивать каждый раз)
_computer_coordinates_cache = None

# можно заранее задать координаты камер (используются как fallback, если не удалось определить реальные):
CAMERA_COORDINATES = {
    "Камера №1": (53.279068, 69.3852623),  # МШГ №5
    "Камера №2": (59.9343, 30.3351),  # Санкт-Петербург
    "Камера №3": (56.8389, 60.6057),  # Екатеринбург
}


def get_computer_coordinates():
    """
    Определяет реальные координаты компьютера по его внешнему IP-адресу.
    Использует бесплатные API для геолокации.
    Возвращает (latitude, longitude) или (None, None) при ошибке.
    """
    global _computer_coordinates_cache
    
    # Если координаты уже были получены, возвращаем из кэша
    if _computer_coordinates_cache is not None:
        return _computer_coordinates_cache
    
    # Пробуем несколько бесплатных API по очереди
    apis = [
        # ip-api.com (бесплатно до 45 запросов/минуту)
        {
            'url': 'http://ip-api.com/json/',
            'parse': lambda r: (r.json().get('lat'), r.json().get('lon')) if r.status_code == 200 and r.json().get('status') == 'success' else (None, None)
        },
        # geojs.io (бесплатно, без лимитов)
        {
            'url': 'https://get.geojs.io/v1/ip/geo.json',
            'parse': lambda r: (float(r.json().get('latitude')), float(r.json().get('longitude'))) if r.status_code == 200 and r.json().get('latitude') and r.json().get('longitude') else (None, None)
        },
        # ipapi.co (бесплатно до 1000 запросов/день)
        {
            'url': 'https://ipapi.co/json/',
            'parse': lambda r: (r.json().get('latitude'), r.json().get('longitude')) if r.status_code == 200 and r.json().get('latitude') and r.json().get('longitude') else (None, None)
        },
    ]
    
    for api in apis:
        try:
            response = requests.get(api['url'], timeout=5)
            lat, lon = api['parse'](response)
            
            if lat is not None and lon is not None:
                # Проверяем валидность координат
                try:
                    lat_float = float(lat)
                    lon_float = float(lon)
                    if -90 <= lat_float <= 90 and -180 <= lon_float <= 180:
                        _computer_coordinates_cache = (lat_float, lon_float)
                        print(f"✅ Определены координаты компьютера: {lat_float:.6f}, {lon_float:.6f}")
                        return (lat_float, lon_float)
                except (ValueError, TypeError):
                    continue
        except Exception as e:
            print(f"⚠️ Ошибка при определении координат через {api['url']}: {e}")
            continue
    
    print("⚠️ Не удалось определить координаты компьютера по IP. Будет использован fallback.")
    return (None, None)


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


def _save_text(filepath: str, content: str) -> None:
    try:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content.strip())
    except Exception as e:
        print(f"⚠️ Не удалось сохранить файл {filepath}: {e}")


def ensure_configuration_interactive() -> None:
    """Проверяет наличие токена и сессии, при отсутствии предлагает ввести и сохраняет в файлы."""
    base_dir = os.path.dirname(__file__)
    token = _get_access_token()
    if not token:
        print("\nНастройка доступа к сайту:")
        token = input("Введите JWT Access Token (скопируйте из профиля/логина): ").strip()
        if token:
            _save_text(os.path.join(base_dir, "token.txt"), token)
            print("✅ token.txt сохранён.")
        else:
            print("⚠️ Токен не указан. Отправка на сайт может не работать.")

    # Если нет ни числового ID, ни кода — запросим у пользователя
    session_id = _get_session_id()
    session_code = _get_session_code()
    if session_id is None and not session_code:
        print("\nПривязка к сессии:")
        value = input("Введите ID сессии (число) или код (например ML6GW81a): ").strip()
        if value:
            # Сохраняем в session.txt в том виде, как введено
            _save_text(os.path.join(base_dir, "session.txt"), value)
            print("✅ session.txt сохранён.")
        else:
            print("ℹ️ Сессия не задана. Детекции не будут привязаны к конкретной сессии.")


def send_to_site(image_path, location, conf):
    now = datetime.now(timezone.utc).isoformat()
<<<<<<< HEAD
    
    # Пытаемся получить реальные координаты компьютера
    lat, lon = get_computer_coordinates()
    
    # Если не удалось определить реальные координаты, используем fallback из CAMERA_COORDINATES
    if lat is None or lon is None:
        lat, lon = CAMERA_COORDINATES.get(location, (None, None))
        if lat is not None and lon is not None:
            print(f"ℹ️ Используются координаты из конфигурации для {location}: {lat}, {lon}")
    
    # Если и fallback не помог, не отправляем данные
    if lat is None or lon is None:
        print(f"⚠️ Не удалось определить координаты для {location}, данные не отправлены.")
        return
=======
    lat, lon = CAMERA_COORDINATES.get(location, (None, None))
>>>>>>> 2cd8816fa75fb43fb4b68a15c4614b93ef5f753d

    data = {
        "location": location,
        "time": now,
        "description": f"Автоматическое обнаружение на {location}",
        "conf": conf*100,
    }
    # Координаты необязательны: если неизвестны — просто не отправляем их
    if lat is not None and lon is not None:
        data["latitude"] = lat
        data["longitude"] = lon
    else:
        print(f"⚠️ Неизвестные координаты для {location} — отправляю без lat/lon.")

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
            # API приёма отчётов на сервере сейчас открыт (AllowAny), поэтому токен не обязателен.
            # Но оставляем предупреждение, чтобы было понятно, почему могут не работать другие API.
            print("⚠️ Токен не найден (token.txt / FIRE_API_TOKEN). Отправляю без авторизации.")

        if session_id is not None:
            data["session"] = session_id
        elif session_code:
            data["join_code"] = session_code
        else:
            print("❌ ID/код сессии не задан. Установите FIRE_SESSION_ID / FIRE_SESSION_CODE или создайте session.txt.")
            raise FatalConfigError("Не задана сессия для привязки детекций.")

        url = _get_site_api_url()
        print(f"→ POST {url} (session={data.get('session')}, join_code={data.get('join_code')}, location='{location}')")
        response = requests.post(url, data=data, files=files, headers=headers, timeout=15)
        if response.status_code == 201:
            print(f"✅ Данные и изображение с {location} отправлены на сайт.")
        else:
            print(f"❌ Ошибка отправки: {response.status_code} — {response.text}")
            # Для ошибок авторизации / неверной сессии — останавливаем работу
            if response.status_code in (400, 401, 403, 404):
                raise FatalConfigError(
                    f"Сервер отклонил запрос (код {response.status_code}). "
                    f"Проверьте токен и код/ID сессии."
                )
    except FatalConfigError:
        # Пробрасываем дальше, чтобы верхний уровень мог остановить работу
        raise
    except Exception as e:
        print(f"❌ Ошибка соединения: {e}")
    finally:
        try:
            if file_obj:
                file_obj.close()
        except Exception:
            pass
