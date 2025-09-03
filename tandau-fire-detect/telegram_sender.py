import requests
import threading
from datetime import datetime

TOKEN = "7737693112:AAHE0iaX8El7RoVsuz0FO_8t40cMMHPF96A"
CHAT_ID = "7514218752"

TELEGRAM_URL = f"https://api.telegram.org/bot{TOKEN}/sendPhoto"

def _send_photo_with_message(photo_path):
    current_time = datetime.now().strftime("%H:%M:%S")
    message = f"🔥 Огонь обнаружен!\n🕒 Время: {current_time}\n📍 Координаты: неизвестны"

    with open(photo_path, "rb") as photo:
        response = requests.post(TELEGRAM_URL, data={
            "chat_id": CHAT_ID,
            "caption": message
        }, files={"photo": photo})

    if response.status_code == 200:
        print(f"✅ Изображение {photo_path} и сообщение отправлены в Telegram!")
    else:
        print(f"❌ Ошибка при отправке: {response.text}")

def send_telegram_photo(photo_path):
    thread = threading.Thread(target=_send_photo_with_message, args=(photo_path,))
    thread.start()