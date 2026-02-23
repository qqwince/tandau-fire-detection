import argparse
import os
# Подавление логов HEVC/FFmpeg ("Could not find ref with POC") — до импорта cv2
os.environ.setdefault("OPENCV_FFMPEG_LOGLEVEL", "-8")

# Совместимость со старыми чекпоинтами, сохранёнными с E2ELoss (ultralytics менял API)
import ultralytics.utils.loss as _uloss
if not hasattr(_uloss, "E2ELoss"):
    try:
        from ultralytics.utils.loss import v8DetectionLoss
        _uloss.E2ELoss = v8DetectionLoss
    except ImportError:
        class _E2ELossStub:
            pass
        _uloss.E2ELoss = _E2ELossStub

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


def is_rtsp_source(src) -> bool:
    """True, если источник — ссылка RTSP (тогда работаем как PTZ: джойстик, переподключения)."""
    return isinstance(src, str) and src.strip().lower().startswith("rtsp://")


def is_ptz_camera(location_name: str) -> bool:
    """Есть ли у камеры с таким именем PTZ в ptz_config (для списка в джойстике)."""
    cfg = load_ptz_config()
    cams = cfg.get("cameras") or {}
    cam = cams.get(location_name) if isinstance(cams, dict) else None
    if not cam or not isinstance(cam, dict):
        return False
    return bool(cam.get("onvif") or cam.get("isapi") or cam.get("left_url"))

# Опции FFMPEG для RTSP (fallback OpenCV): TCP, увеличенный буфер для стабильности
os.environ.setdefault(
    "OPENCV_FFMPEG_CAPTURE_OPTIONS",
    "rtsp_transport;tcp|analyzeduration;5000000|probesize;5000000|max_delay;5000000"
)

# Настройки оптимизации
CONFIG = {
    'reduce_quality': False,  # Понижение разрешения кадра перед YOLO для ускорения
    'quality_scale': 0.5,   # Масштаб (0.5 = 50% от оригинала — быстрее инференс)
    'detection_confidence': 0.6,  # Порог уверенности для детекции
    'inference_size': 416,   # Размер стороны для YOLO (меньше = быстрее, 320–640)
}

# Модель YOLO — загружается только при распознавании (не в режиме --view-only)
model = None

def _load_model():
    global model
    if model is not None:
        return model
    _custom_weights = "2302_0054.pt"
    if not os.path.isfile(_custom_weights):
        raise FileNotFoundError(
            f"Файл весов не найден: {_custom_weights}. "
            "Положите чекпоинт модели детекции огня в каталог со скриптом."
        )
    model = YOLO(_custom_weights)
    return model
save_path = "fire_detections/"
os.makedirs(save_path, exist_ok=True)

stop_all = False

# Реестр PTZ sweepers для паузы при управлении джойстиком
_ptz_sweepers = {}
_ptz_sweepers_lock = threading.Lock()
# Камеры, для которых пользователь вручную остановил автопатруль (не перезапускать)
_user_stopped_sweep = set()


def stop_sweeper_for_camera(camera_name: str) -> None:
    """Останавливает автоматическое движение влево-вправо для указанной камеры."""
    with _ptz_sweepers_lock:
        _user_stopped_sweep.add(camera_name)
        sw = _ptz_sweepers.pop(camera_name, None)
    if sw:
        sw.stop()
        print(f"[PTZ] Автопатруль остановлен для камеры '{camera_name}'.")


def resume_sweeper_for_camera(camera_name: str) -> None:
    """Разрешает снова запустить автопатруль для камеры (цикл камеры подхватит на следующем кадре)."""
    with _ptz_sweepers_lock:
        _user_stopped_sweep.discard(camera_name)
    print(f"[PTZ] Автопатруль будет снова запущен для камеры '{camera_name}'.")


def _run_ptz_joystick_window(camera_names: set):
    """Окно джойстика только для RTSP-камер из camera_names с PTZ в ptz_config. Не создаём окно, если нечего показывать."""
    if not camera_names:
        return
    try:
        import tkinter as tk
        from tkinter import ttk
        import math
    except ImportError:
        return
    cfg = load_ptz_config()
    cams = cfg.get("cameras") or {}
    cameras = [
        n for n in cams
        if n in camera_names and (cams.get(n, {}).get("onvif") or cams.get(n, {}).get("isapi") or cams.get(n, {}).get("left_url"))
    ]
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

    def on_stop_sweep():
        name = var.get()
        if name:
            stop_sweeper_for_camera(name)
            status = tk.Label(f, text="Автопатруль остановлен", fg="#22c55e", bg="#0f0f1a", font=("", 9))
            status.pack(pady=(6, 0))
            root.after(2000, status.destroy)

    def on_resume_sweep():
        name = var.get()
        if name:
            resume_sweeper_for_camera(name)
            status = tk.Label(f, text="Автопатруль будет запущен", fg="#22c55e", bg="#0f0f1a", font=("", 9))
            status.pack(pady=(6, 0))
            root.after(2000, status.destroy)

    btn_frame = tk.Frame(f, bg="#0f0f1a")
    btn_frame.pack(pady=(12, 0))
    btn_stop = tk.Button(btn_frame, text="Остановить автопатруль", command=on_stop_sweep,
                         bg="#1e293b", fg="#f8fafc", activebackground="#334155", activeforeground="#f8fafc",
                         relief=tk.FLAT, padx=12, pady=6, cursor="hand2", font=("", 10))
    btn_stop.pack(side=tk.LEFT, padx=(0, 8))
    btn_resume = tk.Button(btn_frame, text="Запустить автопатруль", command=on_resume_sweep,
                           bg="#1e293b", fg="#f8fafc", activebackground="#334155", activeforeground="#f8fafc",
                           relief=tk.FLAT, padx=12, pady=6, cursor="hand2", font=("", 10))
    btn_resume.pack(side=tk.LEFT)

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


def detect_fire_from_camera(camera_index, location_name, view_only=False, window_index=1):
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
        # Минимальный буфер — меньше задержки
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

    # Потоковый читатель только для RTSP (для файла/веб-камеры читаем из cap напрямую — иначе ложная «потеря потока»)
    use_threaded = is_rtsp_source(camera_index)
    stream = RTSPStream(cap) if use_threaded else None

    print(f"✅ {location_name} запущена")
    is_ptz = is_rtsp_source(camera_index)  # RTSP — джойстик, повороты, переподключения; не RTSP — только показ
    ptz_sweeper = None
    ptz_start_time = time.time()
    PTZ_DELAY_SEC = 12

    if not view_only:
        print(f"   • Понижение качества: {int(CONFIG['quality_scale'] * 100)}%" if CONFIG['reduce_quality'] else "   • Понижение качества: Нет")
        print(f"   • Размер инференса YOLO: {CONFIG['inference_size']}px")

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

    none_count = 0
    MAX_NONE_BEFORE_RECONNECT = 15
    window_size_set = False  # один раз подгоняем окно под разрешение кадра

    def _read_frame():
        if stream is not None:
            f = stream.get_frame()
            return (f is not None, f) if f is not None else (False, None)
        return cap.read()

    def _reconnect():
        nonlocal cap, stream, none_count
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
        none_count = 0
        return True

    # Уникальный ASCII-заголовок: без кириллицы (кракозябры на Windows) и разное окно на каждый поток
    winname = f"View {window_index}" if view_only else f"Fire Detection {window_index}"
    cv2.namedWindow(winname, cv2.WINDOW_NORMAL)

    def _wait_first_frame():
        """Ожидание первого кадра (до 5 сек). Возвращает False если пользователь нажал ESC."""
        if stream is None:
            return True
        for _ in range(250):
            if stream.get_frame() is not None:
                return True
            placeholder = np.zeros((480, 640, 3), dtype=np.uint8)
            placeholder[:] = (40, 40, 40)
            cv2.putText(placeholder, "Waiting for stream...", (180, 250), cv2.FONT_HERSHEY_SIMPLEX, 1, (200, 200, 200), 2)
            cv2.imshow(winname, placeholder)
            if cv2.waitKey(1) & 0xFF == 27:
                return False
            time.sleep(0.02)
        print(f"⚠️ {location_name}: нет первого кадра за 5 сек, продолжаем...")
        return True

    if not _wait_first_frame():
        stop_all = True

    while not stop_all:
        while (stream.is_opened() if stream else cap.isOpened()) and not stop_all:
            ret, frame = _read_frame()
            if not ret or frame is None:
                none_count += 1
                if none_count >= MAX_NONE_BEFORE_RECONNECT or (stream is None and none_count >= 3):
                    if is_ptz:
                        print(f"⚠️ Потеря потока с {location_name}, переподключение...")
                        if not _reconnect():
                            print(f"❌ Не удалось переподключиться к {location_name}")
                            break
                        continue
                    else:
                        print(f"⚠️ Потеря потока с {location_name}, выход.")
                        break
                placeholder = np.zeros((480, 640, 3), dtype=np.uint8)
                placeholder[:] = (40, 40, 40)
                cv2.putText(placeholder, "Waiting for stream...", (180, 250), cv2.FONT_HERSHEY_SIMPLEX, 1, (200, 200, 200), 2)
                cv2.imshow(winname, placeholder)
                if cv2.waitKey(1) & 0xFF == 27:
                    stop_all = True
                    break
                time.sleep(0.02)
                continue
            none_count = 0

            # Один раз выставляем размер окна по разрешению кадра (исходное разрешение)
            if not window_size_set:
                try:
                    h, w = frame.shape[:2]
                    cv2.resizeWindow(winname, w, h)
                except Exception:
                    pass
                window_size_set = True

            # PTZ только для камер, у которых в ptz_config реально настроен PTZ
            if is_ptz:
                if ptz_sweeper is not None and not ptz_sweeper.is_alive():
                    ptz_sweeper = None
                    with _ptz_sweepers_lock:
                        _ptz_sweepers.pop(location_name, None)
                if ptz_sweeper is None and (time.time() - ptz_start_time) >= PTZ_DELAY_SEC:
                    with _ptz_sweepers_lock:
                        skip_start = location_name in _user_stopped_sweep
                    if not skip_start:
                        ptz_sweeper = start_ptz_sweeper_if_configured(location_name)
                        if ptz_sweeper:
                            with _ptz_sweepers_lock:
                                _ptz_sweepers[location_name] = ptz_sweeper

            frame_count += 1

            if view_only:
                display_frame = frame.copy()
            else:
                if CONFIG['reduce_quality'] and CONFIG['quality_scale'] < 1.0:
                    h, w = frame.shape[:2]
                    nw = int(w * CONFIG['quality_scale'])
                    nh = int(h * CONFIG['quality_scale'])
                    process_frame = cv2.resize(frame, (nw, nh), interpolation=cv2.INTER_AREA)
                else:
                    process_frame = frame

                results = _load_model()(process_frame, imgsz=CONFIG['inference_size'], verbose=False, half=False)
                processed_count += 1

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

            # Расчёт FPS
            current_time = time.time()
            if current_time - last_time >= 1.0:
                fps = frame_count / (current_time - last_time)
                last_time = current_time
                frame_count = 0

            # Оверлей и показ кадра
            if view_only:
                cv2.putText(display_frame, f"Cam {window_index} | FPS: {fps:.1f} | [VIEW ONLY]",
                           (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
            else:
                info_color = (0, 0, 255) if fire_detected else (0, 255, 0)
                cv2.putText(display_frame, f"Cam {window_index} | FPS: {fps:.1f} | Detections: {detection_count}",
                            (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, info_color, 2)
            cv2.imshow(winname, display_frame)

            # Проверка на нажатие ESC или S (остановить автопатруль)
            key = cv2.waitKey(1) & 0xFF
            if key == 27:
                stop_all = True
                break
            if is_ptz:
                if key == ord("s") or key == ord("S"):
                    stop_sweeper_for_camera(location_name)
                if key == ord("r") or key == ord("R"):
                    resume_sweeper_for_camera(location_name)

        # Поток закрылся — переподключение только для RTSP
        if stop_all:
            break
        if not is_ptz:
            print(f"⚠️ {location_name}: поток завершён.")
            break
        print(f"⚠️ {location_name}: поток закрыт, переподключение через 3 сек...")
        time.sleep(3)
        if not _reconnect():
            print(f"❌ Не удалось переподключиться к {location_name}")
            break
        if not _wait_first_frame():
            stop_all = True

    if stream is not None:
        stream.release()
    else:
        cap.release()
    if is_ptz:
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


def _mask_rtsp_url(url: str) -> str:
    """Скрывает пароль в RTSP URL для вывода в консоль."""
    if not isinstance(url, str) or "://" not in url:
        return str(url)
    try:
        from urllib.parse import urlparse, urlunparse
        p = urlparse(url)
        if p.password:
            netloc = f"{p.username or ''}:****@{p.hostname or ''}" + (f":{p.port}" if p.port else "")
        else:
            netloc = p.netloc
        return urlunparse((p.scheme, netloc, p.path or "", p.params, p.query, p.fragment))
    except Exception:
        return url


def confirm_cameras(cameras: list, skip_confirm: bool = False) -> bool:
    """
    Выводит список каналов и спрашивает: «Уверены ли вы, что хотите использовать канал N? (y/n)».
    Возвращает True для продолжения, False для выхода. При skip_confirm=True не спрашивает (--yes).
    """
    print("\n" + "=" * 60)
    print("📷 ВЫБРАННЫЕ КАНАЛЫ:")
    print("=" * 60)
    for i, (src, name) in enumerate(cameras, 1):
        display_src = _mask_rtsp_url(src) if isinstance(src, str) else str(src)
        print(f"  Канал {i}: {name}")
        print(f"     Источник: {display_src}")
    print("=" * 60)
    if skip_confirm:
        print("  Запуск без подтверждения (--yes).\n")
        return True
    try:
        answer = input("Уверены ли вы, что хотите использовать эти каналы? (y/n): ").strip().lower()
    except EOFError:
        answer = "n"
    if answer in ("y", "yes", "д", "да"):
        print("  Запуск.\n")
        return True
    print("  Выход. Измените список камер в main.py и запустите снова.\n")
    return False


def print_config():
    """Вывод текущей конфигурации"""
    print("\n" + "=" * 50)
    print("📋 КОНФИГУРАЦИЯ ОБРАБОТКИ:")
    print("=" * 50)
    print(f"• Понижение качества: {'✅ Включено' if CONFIG['reduce_quality'] else '❌ Выключено'}")
    if CONFIG['reduce_quality']:
        print(f"  └─ Масштаб: {int(CONFIG['quality_scale'] * 100)}%")
    print(f"• Размер инференса YOLO: {CONFIG['inference_size']}px")
    print(f"• Порог детекции: {CONFIG['detection_confidence']}")
    print("=" * 50)
    print("ℹ️  Нажмите ESC в окне для остановки")
    print("=" * 50 + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Система детекции огня с RTSP-камерами")
    parser.add_argument("--view-only", action="store_true", help="Только воспроизведение и управление PTZ, без распознавания")
    parser.add_argument("--yes", "-y", action="store_true", help="Не спрашивать подтверждение каналов")
    args = parser.parse_args()
    view_only = args.view_only

    if view_only:
        print("📺 Режим просмотра (без распознавания огня)")
    else:
        ensure_configuration_interactive()
        print_config()

    # Список камер (источник, отображаемое имя). Видео: RTSP/файл/индекс. PTZ: в ptz_config.json (protocol: "onvif" | "isapi")
    cameras = [
        #(0, "Камера №1"),
        #(1, "Камера №2"),
        ("./fire2.mp4", "Камера №1"),
        ("./fire5.mp4", "Камера №2"),
        ("./fire1.mp4", "Камера №3"),
        #("rtsp://operator:qwert321@firecam.myddns.me:554/Streaming/channels/2", "FireCam1"),
        #("rtsp://admin:L238872B@192.168.100.60:554/cam/realmonitor?channel=1&subtype=1", "FireCam2"),
    ]

    # Подтверждение каналов только при RTSP (для локального видео/файла не спрашиваем)
    if any(is_rtsp_source(src) for src, _ in cameras):
        if not confirm_cameras(cameras, skip_confirm=args.yes):
            raise SystemExit(0)

    # Окно джойстика только если в списке есть RTSP и у такой камеры настроен PTZ в ptz_config
    has_rtsp = any(is_rtsp_source(src) for src, _ in cameras)
    ptz_camera_names = {name for (src, name) in cameras if is_rtsp_source(src) and is_ptz_camera(name)}
    if has_rtsp and ptz_camera_names:
        threading.Thread(target=_run_ptz_joystick_window, args=(ptz_camera_names,), daemon=True).start()

    threads = []

    # Запуск потока для каждой камеры (у каждого — свой индекс окна: Fire Detection 1, 2, 3 …)
    for idx, (cam_index, cam_name) in enumerate(cameras, start=1):
        t = threading.Thread(target=detect_fire_from_camera, args=(cam_index, cam_name, view_only, idx))
        t.start()
        threads.append(t)

    # Ожидание завершения всех потоков
    for t in threads:
        t.join()

    cv2.destroyAllWindows()
    print("\n🛑 Все камеры остановлены.")