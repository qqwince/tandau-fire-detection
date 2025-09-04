import cv2
import os
from ultralytics import YOLO
import threading
from site_sender import send_to_site

model = YOLO("model_v2.1.pt")
save_path = "fire_detections/"
os.makedirs(save_path, exist_ok=True)

stop_all = False

def detect_fire_from_camera(camera_index, location_name):
    global stop_all
    cap = cv2.VideoCapture(camera_index)
    frame_count = 0

    if not cap.isOpened():
        print(f"❌ {location_name} ({camera_index}) не доступна.")
        return

    while cap.isOpened() and not stop_all:
        ret, frame = cap.read()
        if not ret:
            break

        results = model(frame)
        img_with_boxes = frame
        fire_detected = False

        for result in results:
            for box in result.boxes:
                class_id = int(box.cls[0])
                conf = float(box.conf[0])
                if conf > 0.8 and class_id == 0:
                    fire_detected = True
                    break

        if fire_detected:
            img_with_boxes = results[0].plot()
            filename = f"{save_path}{location_name.replace(' ', '_')}_fire_{frame_count}.jpg"
            cv2.imwrite(filename, img_with_boxes)
            print(f"🔥 Огонь! [{location_name}] Кадр сохранен: {filename}")
            send_to_site(filename, location_name, conf)

        frame_count += 1
        cv2.imshow(f"Fire Detection - {location_name}", img_with_boxes)

        if cv2.waitKey(1) & 0xFF == 27:
            stop_all = True
            break

    cap.release()
    cv2.destroyWindow(f"Fire Detection - {location_name}")


if __name__ == "__main__":
    cameras = [
        #(0, "Камера №1"),
        #(1, "Камера №2"),
         ("./fire1.mp4", "Камера №3"),
    ]

    threads = []

    for cam_index, cam_name in cameras:
        t = threading.Thread(target=detect_fire_from_camera, args=(cam_index, cam_name))
        t.start()
        threads.append(t)

    for t in threads:
        t.join()

    cv2.destroyAllWindows()
    print("🛑 Все камеры остановлены.")
