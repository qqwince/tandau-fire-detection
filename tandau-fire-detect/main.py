import argparse
import os
# Подавление логов HEVC/FFmpeg ("Could not find ref with POC") — до импорта cv2
os.environ.setdefault("OPENCV_FFMPEG_LOGLEVEL", "-8")

import cv2
import shutil
import subprocess
import numpy as np
from ultralytics import YOLO
import threading
import time
from site_sender import send_to_site, ensure_configuration_interactive
from ptz import start_ptz_sweeper_if_configured, get_ptz_controller, load_ptz_config
from telegram_sender import send_telegram_photo

# Опции FFMPEG для RTSP (fallback OpenCV): TCP, увеличенный буфер для стабильности
os.environ.setdefault(
    "OPENCV_FFMPEG_CAPTURE_OPTIONS",
    "rtsp_transport;tcp|analyzeduration;5000000|probesize;5000000|max_delay;5000000"
)

# Настройки оптимизации
CONFIG = {
    'skip_frames': False,  # Включить/выключить пропуск кадров (True = обрабатывать только последний кадр)
    'reduce_quality': True,  # Включить/выключить понижение качества
    'quality_scale': 1,  # Масштаб качест`ва (0.5 = 50% от оригинала)
    'process_every_n_frames': 15,  # Обрабатывать каждый N-й кадр (для skip_frames=True)
    'detection_confidence': 0.6,  # Порог уверенности для детекции
}

# Модель YOLO — загружается только при распознавании (не в режиме --view-only)
model = None

def _load_model():
    global model
    if model is not None:
        return model
    _custom_weights = "1702_1420.pt"
    try:
        model = YOLO(_custom_weights)
    except AttributeError as e:
        if "E2ELoss" in str(e) or "find_class" in str(e):
            print("Warning: custom weights incompatible with this ultralytics version. Using yolov8n.pt.")
            model = YOLO("yolov8n.pt")
        else:
            raise
    return model
save_path = "fire_detections/"
os.makedirs(save_path, exist_ok=True)

stop_all = False

# Реестр PTZ sweepers для паузы при управлении джойстиком
_ptz_sweepers = {}
_ptz_sweepers_lock = threading.Lock()


def _run_ptz_joystick_window():
    """Отдельное окно джойстика с выбором камеры. Пауза патруля 5 сек при управлении."""
    try:
        import tkinter as tk
        from tkinter import ttk
        import math
    except ImportError:
        return
    cfg = load_ptz_config()
    cams = cfg.get("cameras") or {}
    cameras = [n for n in cams if cams.get(n, {}).get("onvif") or cams.get(n, {}).get("left_url")]
    if not cameras:
        return
    controllers = {}

    def get_ctrl(name):
        if name not in controllers:
            c = get_ptz_controller(name)
            if c:
                controllers[name] = c
        return controllers.get(name)

    def pause_sweeper(name):
        with _ptz_sweepers_lock:
            sw = _ptz_sweepers.get(name)
        if sw:
            sw.pause(5.0)

    root = tk.Tk()
    root.title("PTZ Joystick")
    root.resizable(False, False)
    root.configure(bg="#0f0f1a")

    f = tk.Frame(root, bg="#0f0f1a", padx=16, pady=12)
    f.pack()

    tk.Label(f, text="Камера:", fg="#94a3b8", bg="#0f0f1a").pack(anchor="w", pady=(0, 4))
    var = tk.StringVar(value=cameras[0])
    cb_frame = tk.Frame(f, bg="#1e1e2e", highlightbackground="#334155", highlightthickness=1)
    cb_frame.pack(fill=tk.X, pady=(0, 12))
    cb = ttk.Combobox(cb_frame, textvariable=var, values=cameras, state="readonly", width=22)
    cb.pack(padx=8, pady=6, fill=tk.X)

    # Canvas для джойстика
    joy_size = 240
    joy_radius = 100
    knob_radius = 28
    joy_cx = joy_size // 2
    joy_cy = joy_size // 2

    canvas = tk.Canvas(
        f, width=joy_size, height=joy_size,
        bg="#0f0f1a", highlightthickness=0,
        borderwidth=0
    )
    canvas.pack(pady=4)

    # Фон джойстика — тёмное кольцо
    pad = 4
    canvas.create_oval(pad, pad, joy_size - pad, joy_size - pad, fill="#1e1e2e", outline="#334155", width=2)
    # Внешнее кольцо с акцентом
    canvas.create_oval(joy_cx - joy_radius - 8, joy_cy - joy_radius - 8,
                      joy_cx + joy_radius + 8, joy_cy + joy_radius + 8,
                      fill="#16161e", outline="#f59e0b", width=2)
    # Внутренняя зона
    canvas.create_oval(joy_cx - joy_radius, joy_cy - joy_radius,
                      joy_cx + joy_radius, joy_cy + joy_radius,
                      fill="#1a1a2e", outline="#475569", width=1)
    # Крест — направляющие
    for dx, dy in [(1, 0), (0, 1)]:
        canvas.create_line(joy_cx - joy_radius * dx, joy_cy, joy_cx + joy_radius * dx, joy_cy,
                          fill="#334155", width=1, dash=(4, 4))
        canvas.create_line(joy_cx, joy_cy - joy_radius * dy, joy_cx, joy_cy + joy_radius * dy,
                          fill="#334155", width=1, dash=(4, 4))

    KNOB_TAG = "knob"
    max_dist = joy_radius - knob_radius

    def xy_to_velocity(dx, dy):
        dist = math.sqrt(dx * dx + dy * dy)
        if dist <= 0:
            return 0.0, 0.0
        scale = min(1.0, dist / max_dist)
        pan = (dx / max_dist) * scale
        tilt = -(dy / max_dist) * scale
        return pan, tilt

    def draw_knob(dx, dy):
        dist = math.sqrt(dx * dx + dy * dy)
        if dist > max_dist and dist > 0:
            dx, dy = dx * max_dist / dist, dy * max_dist / dist
        nx, ny = joy_cx + dx, joy_cy + dy
        canvas.delete(KNOB_TAG)
        # Тень под ручкой
        canvas.create_oval(nx - knob_radius - 2, ny - knob_radius + 2,
                          nx + knob_radius - 2, ny + knob_radius + 2,
                          fill="#0a0a12", outline="", tags=KNOB_TAG)
        # Ручка (янтарный акцент)
        canvas.create_oval(nx - knob_radius, ny - knob_radius, nx + knob_radius, ny + knob_radius,
                          fill="#f59e0b", outline="#fbbf24", width=2, tags=KNOB_TAG)
        canvas.create_oval(nx - knob_radius * 0.55, ny - knob_radius * 0.55,
                          nx + knob_radius * 0.55, ny + knob_radius * 0.55,
                          fill="#fcd34d", outline="#f59e0b", width=1, tags=KNOB_TAG)

    def on_joy_press(evt):
        name = var.get()
        if not name:
            return
        ctrl = get_ctrl(name)
        if not ctrl:
            return
        pause_sweeper(name)
        dx = evt.x - joy_cx
        dy = evt.y - joy_cy
        pan, tilt = xy_to_velocity(dx, dy)
        draw_knob(dx, dy)
        try:
            ctrl.move(pan, tilt)
        except Exception:
            pass

    def on_joy_drag(evt):
        name = var.get()
        ctrl = controllers.get(name) if name else None
        dx = evt.x - joy_cx
        dy = evt.y - joy_cy
        pan, tilt = xy_to_velocity(dx, dy)
        draw_knob(dx, dy)
        if ctrl:
            try:
                ctrl.move(pan, tilt)
            except Exception:
                pass

    def on_joy_release(evt=None):
        name = var.get()
        if name:
            ctrl = controllers.get(name)
            if ctrl:
                try:
                    ctrl.stop()
                except Exception:
                    pass
        draw_knob(0, 0)

    draw_knob(0, 0)
    canvas.bind("<ButtonPress-1>", on_joy_press)
    canvas.bind("<B1-Motion>", on_joy_drag)
    canvas.bind("<ButtonRelease-1>", on_joy_release)

    hint = tk.Label(f, text="Перетащите ручку или кликните в нужном направлении", fg="#64748b", bg="#0f0f1a", font=("", 9))
    hint.pack(pady=(8, 0))

    root.protocol("WM_DELETE_WINDOW", lambda: (on_joy_release(), root.destroy()))
    root.mainloop()


class RTSPStream:
    """
    Чтение кадров в отдельном потоке — как в VLC.
    Предотвращает забивание буфера декодера при долгой обработке (YOLO) и уменьшает артефакты.
    """
    def __init__(self, cap):
        self.cap = cap
        self._frame = None
        self._lock = threading.Lock()
        self._running = True
        self._ret = False
        self._thread = threading.Thread(target=self._update, daemon=True)
        self._thread.start()

    def _update(self):
        while self._running and self.cap.isOpened():
            ret, frame = self.cap.read()
            if ret and frame is not None:
                with self._lock:
                    self._frame = frame.copy()
                    self._ret = True
            else:
                with self._lock:
                    self._ret = False

    def get_frame(self):
        """Возвращает последний полученный кадр или None."""
        with self._lock:
            if self._ret and self._frame is not None:
                return self._frame.copy()
            return None

    def read(self):
        """Совместимость с cap.read(): (ret, frame)."""
        f = self.get_frame()
        return (f is not None, f) if f is not None else (False, None)

    def is_opened(self):
        return self.cap.isOpened()

    def release(self):
        self._running = False
        self._thread.join(timeout=1.0)
        self.cap.release()


def _get_ffmpeg_path():
    """Путь к ffmpeg (для pipe-режима RTSP)."""
    for name in ("ffmpeg", "ffmpeg.exe"):
        path = shutil.which(name)
        if path:
            return path
    return None


def _get_rtsp_dimensions(url):
    """Получить width, height RTSP-потока через ffprobe."""
    ffprobe = shutil.which("ffprobe") or shutil.which("ffprobe.exe")
    if not ffprobe:
        return None
    try:
        cmd = [
            ffprobe,
            "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height",
            "-of", "csv=p=0",
            "-rtsp_transport", "tcp",
            url
        ]
        out = subprocess.check_output(cmd, timeout=10, stderr=subprocess.DEVNULL, text=True)
        parts = out.strip().split(",")
        if len(parts) >= 2:
            return int(parts[0]), int(parts[1])
    except Exception:
        pass
    return None


class FFmpegPipeCapture:
    """
    RTSP через FFmpeg subprocess — полный контроль над декодером.
    Стабильнее OpenCV+FFmpeg, меньше артефактов (опции как у VLC).
    """
    def __init__(self, url, width, height):
        self.url = url
        self.width = width
        self.height = height
        self.frame_size = width * height * 3
        self._proc = None
        self._start()

    def _start(self):
        url = _normalize_rtsp_url(self.url)
        cmd = [
            _get_ffmpeg_path(),
            "-loglevel", "-8",
            "-rtsp_transport", "tcp",
            "-analyzeduration", "5000000", "-probesize", "5000000",
            "-timeout", "5000000", "-max_delay", "5000000",
            "-err_detect", "ignore_err",
            "-i", url,
            "-an", "-f", "rawvideo", "-pix_fmt", "bgr24",
            "-s", f"{self.width}x{self.height}",
            "-max_muxing_queue_size", "1024",
            "-"
        ]
        kwargs = {"stdout": subprocess.PIPE, "stderr": subprocess.DEVNULL, "bufsize": self.frame_size * 16}
        if os.name == "nt":
            kwargs["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        self._proc = subprocess.Popen(cmd, **kwargs)

    def read(self):
        try:
            raw = self._proc.stdout.read(self.frame_size)
            if len(raw) != self.frame_size:
                return False, None
            frame = np.frombuffer(raw, dtype=np.uint8).reshape((self.height, self.width, 3))
            return True, frame
        except Exception:
            return False, None

    def isOpened(self):
        return self._proc is not None and self._proc.poll() is None

    def release(self):
        if self._proc:
            try:
                self._proc.terminate()
                self._proc.wait(timeout=2)
            except Exception:
                self._proc.kill()
            self._proc = None

    def set(self, prop, value):
        pass  # заглушка для совместимости


def _normalize_rtsp_url(src):
    """Для RTSP принудительно TCP — меньше потерь и серых кадров из-за ffmpeg."""
    if not isinstance(src, str) or not src.strip().lower().startswith("rtsp://"):
        return src
    url = src.strip()
    if "rtsp_transport=" in url:
        return url
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}rtsp_transport=tcp"


def _is_frame_corrupted(frame, gray_std_threshold=18, block_size=32):
    """
    Кадр считаем битым: серый (низкий std), зелёный/пурпурный оттенок (сбой H.264),
    или сильная блочность (макроблочные артефакты).
    """
    try:
        mean, std = cv2.meanStdDev(frame)
        frame_std = float(std.mean())
        if frame_std < gray_std_threshold:
            return True, "gray"
        # Зелёный или пурпурный оттенок — типичный сбой декодера H.264
        b, g, r = (float(x) for x in mean.ravel()[:3])
        if g > 1.4 * r and g > 1.4 * b:
            return True, "green"
        if (r > 1.5 * g and b > 1.5 * g) or (r < 0.5 * g and b < 0.5 * g):
            return True, "tint"
        # Блочность: разбиваем на блоки, считаем дисперсию по блокам; если разброс огромный — артефакты
        h, w = frame.shape[:2]
        if h < block_size * 2 or w < block_size * 2:
            return False, ""
        block_stds = []
        for y in range(0, h - block_size, block_size):
            for x in range(0, w - block_size, block_size):
                bl = frame[y:y + block_size, x:x + block_size]
                _, s = cv2.meanStdDev(bl)
                block_stds.append(float(s.mean()))
        if len(block_stds) < 4:
            return False, ""
        block_stds_arr = np.array(block_stds)
        # Много блоков с аномально высокой или нулевой вариацией — макроблоки
        median_std = np.median(block_stds_arr)
        very_high = np.sum(block_stds_arr > median_std * 3) if median_std > 0.1 else 0
        very_low = np.sum(block_stds_arr < 5)
        if very_high > len(block_stds) * 0.2 or very_low > len(block_stds) * 0.2:
            return True, "blocky"
        return False, ""
    except Exception:
        return True, "error"


def detect_fire_from_camera(camera_index, location_name, view_only=False):
    global stop_all
    def open_capture(src):
        if isinstance(src, str) and src.strip().lower().startswith("rtsp://"):
            # RTSP: пробуем FFmpeg pipe (стабильнее OpenCV)
            ffmpeg_path = _get_ffmpeg_path()
            dims = _get_rtsp_dimensions(_normalize_rtsp_url(src))
            if ffmpeg_path and dims:
                w, h = dims
                try:
                    cap = FFmpegPipeCapture(src, w, h)
                    if cap.isOpened():
                        print(f"   [RTSP] FFmpeg pipe mode (w={w} h={h})")
                        return cap
                    cap.release()
                except Exception:
                    pass
            # fallback на OpenCV
            src = _normalize_rtsp_url(src)
            cap = cv2.VideoCapture(src, cv2.CAP_FFMPEG)
        elif isinstance(src, str):
            cap = cv2.VideoCapture(src)
        else:
            cap = cv2.VideoCapture(src)
        # Настройки таймаутов (если поддерживается сборкой OpenCV)
        try:
            cv2.CAP_PROP_OPEN_TIMEOUT_MSEC
            cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 7000)
        except Exception:
            pass
        try:
            cv2.CAP_PROP_READ_TIMEOUT_MSEC
            cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 7000)
        except Exception:
            pass
        # Минимальный буфер — меньше задержки и меньше «залипания» на битых кадрах
        try:
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        except Exception:
            pass
        return cap

    cap = open_capture(camera_index)

    if not cap.isOpened():
        print(f"⚠️ {location_name}: первая попытка подключения не удалась, пробую ещё раз...")
        time.sleep(2)
        cap.release()
        cap = open_capture(camera_index)
        if not cap.isOpened():
            print(f"❌ {location_name} ({camera_index}) не доступна.")
            return

    # Настройка буфера камеры для уменьшения задержки
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    # Потоковое чтение RTSP — буфер не переполняется при медленной обработке (YOLO)
    use_threaded = True
    stream = RTSPStream(cap) if use_threaded else None

    print(f"✅ {location_name} запущена")
    # PTZ запускаем с задержкой, чтобы видеопоток успел стабилизироваться
    ptz_sweeper = None
    ptz_start_time = time.time()
    PTZ_DELAY_SEC = 12

    if not view_only:
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

    last_good_frame = None  # Последний нормальный кадр (подмена при серых/битых кадрах от камеры)
    bad_frame_count = 0
    none_count = 0  # для потокового чтения: подряд None = потеря потока
    MAX_BAD_FRAMES_BEFORE_RECONNECT = 12  # переподключение после стольких подряд плохих кадров
    FLUSH_FRAMES_ON_BAD = 25  # при первом битом кадре выбросить N кадров (для non-threaded)
    MAX_NONE_BEFORE_RECONNECT = 15  # для threaded: столько подряд None → переподключение

    def _read_frame():
        if stream is not None:
            f = stream.get_frame()
            return (f is not None, f) if f is not None else (False, None)
        return cap.read()

    def _reconnect():
        nonlocal cap, stream, bad_frame_count, last_good_frame, none_count
        s = stream
        if s is not None:
            s.release()
        else:
            cap.release()
        time.sleep(1)
        cap = open_capture(camera_index)
        if not cap.isOpened():
            return False
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        if use_threaded:
            stream = RTSPStream(cap)
        bad_frame_count = 0
        none_count = 0
        last_good_frame = None
        return True

    winname = f"View - {location_name}" if view_only else f"Fire Detection - {location_name}"
    cv2.namedWindow(winname, cv2.WINDOW_NORMAL)

    # Для потокового RTSP — ожидание первого кадра (до 5 сек)
    if stream is not None:
        for _ in range(250):
            if stream.get_frame() is not None:
                break
            # Показываем заглушку, пока ждём поток
            placeholder = np.zeros((480, 640, 3), dtype=np.uint8)
            placeholder[:] = (40, 40, 40)
            cv2.putText(placeholder, "Waiting for stream...", (180, 250), cv2.FONT_HERSHEY_SIMPLEX, 1, (200, 200, 200), 2)
            cv2.imshow(winname, placeholder)
            if cv2.waitKey(1) & 0xFF == 27:
                stop_all = True
                break
            time.sleep(0.02)
        else:
            print(f"⚠️ {location_name}: нет первого кадра за 5 сек, продолжаем...")

    while (stream.is_opened() if stream else cap.isOpened()) and not stop_all:
        ret, frame = _read_frame()
        if not ret or frame is None:
            none_count += 1
            if none_count >= MAX_NONE_BEFORE_RECONNECT or (stream is None and none_count >= 3):
                print(f"⚠️ Потеря потока с {location_name}, переподключение...")
                if not _reconnect():
                    print(f"❌ Не удалось переподключиться к {location_name}")
                    break
                continue
            if last_good_frame is not None:
                frame = last_good_frame.copy()
            else:
                # Нет кадра — показываем заглушку, чтобы окно не исчезало
                placeholder = np.zeros((480, 640, 3), dtype=np.uint8)
                placeholder[:] = (40, 40, 40)
                cv2.putText(placeholder, "Waiting for stream...", (180, 250), cv2.FONT_HERSHEY_SIMPLEX, 1, (200, 200, 200), 2)
                cv2.imshow(winname, placeholder)
                if cv2.waitKey(1) & 0xFF == 27:
                    stop_all = True
                    break
                time.sleep(0.02)
                continue
        else:
            none_count = 0

        # Запуск PTZ после задержки (поток уже стабилен)
        if ptz_sweeper is None and (time.time() - ptz_start_time) >= PTZ_DELAY_SEC:
            ptz_sweeper = start_ptz_sweeper_if_configured(location_name)
            if ptz_sweeper:
                with _ptz_sweepers_lock:
                    _ptz_sweepers[location_name] = ptz_sweeper

        # Проверка на битый кадр: серый, зелёный/пурпурный оттенок, макроблочные артефакты
        is_bad, reason = _is_frame_corrupted(frame)
        if is_bad:
            bad_frame_count += 1
            # При первом битом кадре — сброс буфера (только для non-threaded; для threaded кадры уже свежие)
            if bad_frame_count == 1 and last_good_frame is not None and stream is None:
                for _ in range(FLUSH_FRAMES_ON_BAD):
                    cap.read()
                ret2, frame2 = cap.read()
                if ret2 and frame2 is not None:
                    is_bad2, _ = _is_frame_corrupted(frame2)
                    if not is_bad2:
                        frame = frame2
                        last_good_frame = frame.copy()
                        bad_frame_count = 0
            if bad_frame_count > 0:
                if last_good_frame is not None:
                    frame = last_good_frame.copy()
                # иначе показываем кадр как есть (лучше артефакты, чем черный экран)
                if bad_frame_count >= MAX_BAD_FRAMES_BEFORE_RECONNECT:
                    print(f"⚠️ Серия битых кадров ({reason}) с {location_name}, переподключение...")
                    if not _reconnect():
                        print(f"❌ Не удалось переподключиться к {location_name}")
                        break
                    continue
        else:
            bad_frame_count = 0
            last_good_frame = frame.copy()

        frame_count += 1

        if view_only:
            display_frame = frame.copy()
        # Пропуск кадров если включена опция (только при распознавании)
        elif CONFIG['skip_frames']:
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

                cv2.imshow(winname, display_frame)

                if cv2.waitKey(1) & 0xFF == 27:
                    stop_all = True
                    break
                continue

        else:
            # Понижение качества для обработки если включено
            process_frame = frame.copy()
            if CONFIG['reduce_quality'] and CONFIG['quality_scale'] < 1.0:
                height, width = process_frame.shape[:2]
                new_width = int(width * CONFIG['quality_scale'])
                new_height = int(height * CONFIG['quality_scale'])
                process_frame = cv2.resize(process_frame, (new_width, new_height), interpolation=cv2.INTER_AREA)

            # Обработка кадра моделью
            results = _load_model()(process_frame)
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
                last_detection_frame = frame_count
                img_with_boxes = results[0].plot()
                if CONFIG['reduce_quality'] and CONFIG['quality_scale'] < 1.0:
                    img_with_boxes = cv2.resize(img_with_boxes, (frame.shape[1], frame.shape[0]))
                display_frame = img_with_boxes
                last_detection_boxes = display_frame.copy()
                detection_count += 1
                filename = f"{save_path}{location_name.replace(' ', '_')}_fire_{detection_count}.jpg"
                cv2.imwrite(filename, display_frame)
                print(f"🔥 Огонь! [{location_name}] Кадр {frame_count} сохранен: {filename} (уверенность: {max_conf:.2f})")
                try:
                    send_to_site(filename, location_name, max_conf)
                except Exception as e:
                    print(f"⚠️ Ошибка отправки на сайт: {e}")
                try:
                    send_telegram_photo(filename)
                except Exception as e:
                    print(f"⚠️ Ошибка отправки в Telegram: {e}")
            else:
                display_frame = frame

        # Расчет FPS
        current_time = time.time()
        if current_time - last_time >= 1.0:
            fps = frame_count / (current_time - last_time)
            last_time = current_time
            frame_count = 0

        # Определяем цвет информации и добавляем оверлей
        if view_only:
            cv2.putText(display_frame, f"FPS: {fps:.1f} | [VIEW ONLY - no detection]",
                        (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        else:
            if fire_detected or (
                    last_detection_frame > 0 and (frame_count - last_detection_frame) < frames_to_show_detection):
                info_color = (0, 0, 255)
            else:
                info_color = (0, 255, 0)
            cv2.putText(display_frame,
                        f"FPS: {fps:.1f} | Frame: {frame_count} | Processed: {processed_count} | Detections: {detection_count}",
                        (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, info_color, 2)

        if not view_only and CONFIG['skip_frames']:
            cv2.putText(display_frame, f"[SKIP MODE: Every {CONFIG['process_every_n_frames']} frames]",
                        (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 1)

        if not view_only and CONFIG['reduce_quality']:
            cv2.putText(display_frame, f"[Quality: {int(CONFIG['quality_scale'] * 100)}%]",
                        (10, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 1)

        # Показ кадра
        cv2.imshow(winname, display_frame)

        # Проверка на нажатие ESC
        if cv2.waitKey(1) & 0xFF == 27:
            stop_all = True
            break

    if stream is not None:
        stream.release()
    else:
        cap.release()
    # Останавливаем PTZ, если был запущен
    try:
        if ptz_sweeper is not None:
            with _ptz_sweepers_lock:
                _ptz_sweepers.pop(location_name, None)
            ptz_sweeper.stop()
    except Exception:
        pass
    cv2.destroyWindow(winname)
    if view_only:
        print(f"📊 {location_name} - просмотр завершён")
    else:
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
    parser = argparse.ArgumentParser(description="Система детекции огня с RTSP-камерами")
    parser.add_argument("--view-only", action="store_true", help="Только воспроизведение и управление PTZ, без распознавания")
    args = parser.parse_args()
    view_only = args.view_only

    if view_only:
        print("📺 Режим просмотра (без распознавания огня)")
    else:
        ensure_configuration_interactive()
        print_config()

    # Список камер
    cameras = [
        #(0, "Камера №1"),
        #(1, "Камера №2"),
        #("./fire1.mp4", "Камера №3"),
        ("rtsp://operator:qwert321@firecam.myddns.me:554/Streaming/channels/1", "FireCam1"),
    ]

    cams_cfg = load_ptz_config().get("cameras") or {}
    has_ptz = any(cams_cfg.get(n, {}).get("onvif") or cams_cfg.get(n, {}).get("left_url") for n in cams_cfg)
    if has_ptz:
        threading.Thread(target=_run_ptz_joystick_window, daemon=True).start()

    threads = []

    # Запуск потока для каждой камеры
    for cam_index, cam_name in cameras:
        t = threading.Thread(target=detect_fire_from_camera, args=(cam_index, cam_name, view_only))
        t.start()
        threads.append(t)

    # Ожидание завершения всех потоков
    for t in threads:
        t.join()

    cv2.destroyAllWindows()
    print("\n🛑 Все камеры остановлены.")