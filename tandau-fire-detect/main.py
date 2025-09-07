import cv2
import os
from ultralytics import YOLO
import threading
import time
from site_sender import send_to_site

# Настройки оптимизации
CONFIG = {
    'skip_frames': True,  # Включить/выключить пропуск кадров (True = обрабатывать только последний кадр)
    'reduce_quality': True,  # Включить/выключить понижение качества
    'quality_scale': 0.5,  # Масштаб качества (0.5 = 50% от оригинала)
    'process_every_n_frames': 1,  # Обрабатывать каждый N-й кадр (для skip_frames=True)
    'detection_confidence': 0.8,  # Порог уверенности для детекции
}

model = YOLO("model_v2.1.pt")
save_path = "fire_detections/"
os.makedirs(save_path, exist_ok=True)

stop_all = False


def detect_fire_from_camera(camera_index, location_name):
    global stop_all
    cap = cv2.VideoCapture(camera_index)

    if not cap.isOpened():
        print(f"❌ {location_name} ({camera_index}) не доступна.")
        return

    # Настройка буфера камеры для уменьшения задержки
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    print(f"✅ {location_name} запущена")
    print(f"   • Пропуск кадров: {'Да' if CONFIG['skip_frames'] else 'Нет'}")
    print(f"   • Понижение качества: {int(CONFIG['quality_scale'] * 100)}%" if CONFIG[
        'reduce_quality'] else "   • Понижение качества: Нет")

    frame_count = 0
    processed_count = 0
    detection_count = 0
    last_time = time.time()
    fps = 0

    # Инициализация переменных для отслеживания последней детекции
    last_detection_frame = -1
    frames_to_show_detection = 10  # Количество кадров для показа красной индикации после детекции
    last_detection_boxes = None  # Последний кадр с детекцией
    frames_to_show_boxes = 15  # Количество кадров для показа боксов после детекции

    while cap.isOpened() and not stop_all:
        ret, frame = cap.read()
        if not ret:
            print(f"⚠️ Не удалось получить кадр с {location_name}")
            break

        frame_count += 1

        # Пропуск кадров если включена опция
        if CONFIG['skip_frames']:
            # Обрабатываем каждый N-й кадр
            if frame_count % CONFIG['process_every_n_frames'] != 0:
                # Просто показываем кадр без обработки
                display_frame = frame.copy()

                # Добавляем информацию
                info_color = (0, 0, 255) if (last_detection_frame > 0 and (
                            frame_count - last_detection_frame) < frames_to_show_detection) else (0, 255, 0)
                cv2.putText(display_frame,
                            f"FPS: {fps:.1f} | Frame: {frame_count} | Processed: {processed_count} | Detections: {detection_count}",
                            (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, info_color, 2)
                cv2.putText(display_frame, f"[SKIP MODE: Processing every {CONFIG['process_every_n_frames']} frames]",
                            (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 1)

                # Если есть сохраненные боксы и прошло недостаточно времени - показываем их
                if last_detection_boxes is not None and last_detection_frame > 0 and (
                        frame_count - last_detection_frame) < frames_to_show_boxes:
                    # Накладываем последние детекции на текущий кадр
                    display_frame = last_detection_boxes.copy()
                    # Добавляем информацию поверх
                    cv2.putText(display_frame,
                                f"FPS: {fps:.1f} | Frame: {frame_count} | Processed: {processed_count} | Detections: {detection_count}",
                                (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, info_color, 2)
                    cv2.putText(display_frame, f"[SKIP MODE: Processing every {CONFIG['process_every_n_frames']} frames]",
                                (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 1)
                    cv2.putText(display_frame, f"[SHOWING LAST DETECTION]",
                                (10, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1)

                cv2.imshow(f"Fire Detection - {location_name}", display_frame)

                if cv2.waitKey(1) & 0xFF == 27:
                    stop_all = True
                    break
                continue

        # Понижение качества для обработки если включено
        process_frame = frame.copy()
        if CONFIG['reduce_quality'] and CONFIG['quality_scale'] < 1.0:
            height, width = process_frame.shape[:2]
            new_width = int(width * CONFIG['quality_scale'])
            new_height = int(height * CONFIG['quality_scale'])
            process_frame = cv2.resize(process_frame, (new_width, new_height), interpolation=cv2.INTER_AREA)

        # Обработка кадра моделью
        results = model(process_frame)
        processed_count += 1

        # Проверка на обнаружение огня
        fire_detected = False
        max_conf = 0

        for result in results:
            if result.boxes is not None:
                for box in result.boxes:
                    class_id = int(box.cls[0])
                    conf = float(box.conf[0])
                    if conf > CONFIG['detection_confidence'] and class_id == 0:
                        fire_detected = True
                        max_conf = max(max_conf, conf)

        # Отрисовка результатов на оригинальном кадре
        if fire_detected:
            # Обновляем последний кадр с детекцией
            last_detection_frame = frame_count

            # Получаем изображение с боксами
            img_with_boxes = results[0].plot()

            # Если качество было понижено, масштабируем боксы обратно
            if CONFIG['reduce_quality'] and CONFIG['quality_scale'] < 1.0:
                img_with_boxes = cv2.resize(img_with_boxes, (frame.shape[1], frame.shape[0]))

            display_frame = img_with_boxes
            # Сохраняем кадр с боксами для показа на пропущенных кадрах
            last_detection_boxes = display_frame.copy()

            # Сохранение детекции
            detection_count += 1
            filename = f"{save_path}{location_name.replace(' ', '_')}_fire_{detection_count}.jpg"
            cv2.imwrite(filename, display_frame)
            print(f"🔥 Огонь! [{location_name}] Кадр {frame_count} сохранен: {filename} (уверенность: {max_conf:.2f})")

            try:
                send_to_site(filename, location_name, max_conf)
            except Exception as e:
                print(f"⚠️ Ошибка отправки на сайт: {e}")
        else:
            display_frame = frame

        # Расчет FPS
        current_time = time.time()
        if current_time - last_time >= 1.0:
            fps = frame_count / (current_time - last_time)
            last_time = current_time
            frame_count = 0

        # Определяем цвет информации (красный если была недавняя детекция, зеленый если нет)
        if fire_detected or (
                last_detection_frame > 0 and (frame_count - last_detection_frame) < frames_to_show_detection):
            info_color = (0, 0, 255)  # Красный
        else:
            info_color = (0, 255, 0)  # Зеленый

        # Добавляем информацию на кадр
        cv2.putText(display_frame,
                    f"FPS: {fps:.1f} | Frame: {frame_count} | Processed: {processed_count} | Detections: {detection_count}",
                    (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, info_color, 2)

        if CONFIG['skip_frames']:
            cv2.putText(display_frame, f"[SKIP MODE: Every {CONFIG['process_every_n_frames']} frames]",
                        (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 1)

        if CONFIG['reduce_quality']:
            cv2.putText(display_frame, f"[Quality: {int(CONFIG['quality_scale'] * 100)}%]",
                        (10, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 1)

        # Показ кадра
        cv2.imshow(f"Fire Detection - {location_name}", display_frame)

        # Проверка на нажатие ESC
        if cv2.waitKey(1) & 0xFF == 27:
            stop_all = True
            break

    cap.release()
    cv2.destroyWindow(f"Fire Detection - {location_name}")
    print(f"📊 {location_name} - Обработано кадров: {processed_count}, Обнаружений: {detection_count}")


def print_config():
    """Вывод текущей конфигурации"""
    print("\n" + "=" * 50)
    print("📋 КОНФИГУРАЦИЯ ОБРАБОТКИ:")
    print("=" * 50)
    print(f"• Пропуск кадров: {'✅ Включен' if CONFIG['skip_frames'] else '❌ Выключен'}")
    if CONFIG['skip_frames']:
        print(f"  └─ Обработка каждого {CONFIG['process_every_n_frames']}-го кадра")
    print(f"• Понижение качества: {'✅ Включено' if CONFIG['reduce_quality'] else '❌ Выключено'}")
    if CONFIG['reduce_quality']:
        print(f"  └─ Масштаб: {int(CONFIG['quality_scale'] * 100)}%")
    print(f"• Порог детекции: {CONFIG['detection_confidence']}")
    print("=" * 50)
    print("ℹ️  Нажмите ESC в окне для остановки")
    print("=" * 50 + "\n")


if __name__ == "__main__":
    # Печать конфигурации
    print_config()

    # Список камер
    cameras = [
        # (0, "Камера №1"),
        # (1, "Камера №2"),
        ("./fire1.mp4", "Камера №3"),
        # ("rtsp://admin:Amirhan1181111811@192.168.100.59:554/cam/realmonitor?channel=1&subtype=1", "Камера IP"),
    ]

    threads = []

    # Запуск потока для каждой камеры
    for cam_index, cam_name in cameras:
        t = threading.Thread(target=detect_fire_from_camera, args=(cam_index, cam_name))
        t.start()
        threads.append(t)

    # Ожидание завершения всех потоков
    for t in threads:
        t.join()

    cv2.destroyAllWindows()
    print("\n🛑 Все камеры остановлены.")