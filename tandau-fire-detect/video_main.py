import cv2
import os
from ultralytics import YOLO
from telegram_sender import send_telegram_photo  # Убедись, что у тебя есть этот модуль

# Загрузка модели
model = YOLO("model_v2.1.pt")

# Путь к видеофайлу на компьютере
video_path = "C:/Users/2/Desktop/Tandau Fire Detect/video_data/fire1.mp4"  # Заменить на свой путь
cap = cv2.VideoCapture(video_path)  # Открываем видеофайл
if not cap.isOpened():
    print("❌ Видео не открылось. Проверьте путь.")

# Папка для сохранения кадров с обнаружением
save_path = "fire_detections/"
os.makedirs(save_path, exist_ok=True)

frame_count = 0

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    results = model(frame)
    img_with_boxes = frame.copy()

    fire_detected = False
    for result in results:
        for box in result.boxes:
            class_id = int(box.cls[0])
            conf = float(box.conf[0])

            if conf > 0.65 and class_id == 0:  # Класс 0 — предполагается "огонь"
                fire_detected = True
                break

    if fire_detected:
        img_with_boxes = results[0].plot()
        filename = f"{save_path}fire_frame_{frame_count}.jpg"
        cv2.imwrite(filename, img_with_boxes)
        print(f"🔥 Огонь обнаружен! Кадр сохранен: {filename}")
        #send_telegram_photo(filename)

    frame_count += 1

    cv2.imshow("Fire Detection", img_with_boxes)
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()
