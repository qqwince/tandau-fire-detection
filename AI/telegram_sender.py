import requests
import threading
from datetime import datetime
from site_sender import get_computer_coordinates

TOKEN = "7737693112:AAHE0iaX8El7RoVsuz0FO_8t40cMMHPF96A"
CHAT_ID = "7514218752"

TELEGRAM_URL = f"https://api.telegram.org/bot{TOKEN}/sendPhoto"

def _send_photo_with_message(photo_path):
    try:
        current_time = datetime.now().strftime("%H:%M:%S")
        
        # Получаем реальные координаты компьютера
        lat, lon = get_computer_coordinates()
        if lat is not None and lon is not None:
            coords_text = f"{lat:.6f}, {lon:.6f}"
        else:
            coords_text = "неизвестны"
        
        message = f"🔥 Огонь обнаружен!\n🕒 Время: {current_time}\n📍 Координаты: {coords_text}"

        with open(photo_path, "rb") as photo_file:
            response = requests.post(TELEGRAM_URL, data={
                "chat_id": CHAT_ID,
                "caption": message
            }, files={"photo": photo_file}, timeout=10)

        if response.status_code == 200:
            print(f"✅ Изображение {photo_path} и сообщение отправлены в Telegram!")
        else:
            print(f"❌ Ошибка при отправке в Telegram (код {response.status_code}): {response.text}")
    except FileNotFoundError:
        print(f"❌ Файл {photo_path} не найден для отправки в Telegram")
    except Exception as e:
        print(f"❌ Ошибка при отправке в Telegram: {e}")

def send_telegram_photo(photo_path):
    thread = threading.Thread(target=_send_photo_with_message, args=(photo_path,))
    thread.start()