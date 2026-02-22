import json
import os
import threading
import time
from typing import Any, Dict, Optional
from urllib.parse import urlparse, urlunparse

import requests

try:
    from onvif import ONVIFCamera  # type: ignore
except Exception:  # pragma: no cover
    ONVIFCamera = None  # type: ignore


class PTZController:
    def __init__(self, name: str, config: Dict[str, Any]):
        self.name = name
        self.left_url: Optional[str] = config.get("left_url")
        self.right_url: Optional[str] = config.get("right_url")
        self.stop_url: Optional[str] = config.get("stop_url")
        self.timeout: float = float(config.get("timeout", 3))
        # optional HTTP auth
        self.http_user: Optional[str] = config.get("http_user")
        self.http_password: Optional[str] = config.get("http_password")
        self.http_auth_type: str = str(config.get("http_auth", "none")).lower()
        self.insecure_tls: bool = bool(config.get("insecure_tls", False))

    def _call(self, url: Optional[str]) -> None:
        if not url:
            return
        try:
            print(f"[PTZ] {self.name}: GET {url}")
            auth = None
            if self.http_auth_type in ("basic", "digest") and self.http_user and self.http_password:
                try:
                    from requests.auth import HTTPBasicAuth, HTTPDigestAuth  # type: ignore
                    auth = HTTPDigestAuth(self.http_user, self.http_password) if self.http_auth_type == "digest" else HTTPBasicAuth(self.http_user, self.http_password)
                except Exception:
                    auth = None
            kwargs = {
                "timeout": self.timeout,
                "auth": auth,
                "allow_redirects": True,
            }
            if url.startswith("http://") and self.insecure_tls:
                kwargs["verify"] = False
            resp = requests.get(url, **kwargs)
            try:
                info = f"status={resp.status_code}"
                if resp.status_code in (401, 403):
                    wa = resp.headers.get('WWW-Authenticate', '')
                    info += f" auth_hint={wa[:80]}"
                print(f"[PTZ] {self.name}: response {info}")
            except Exception:
                pass
        except Exception as e:
            # Не роняем поток при ошибке PTZ
            print(f"[PTZ] {self.name}: ошибка PTZ-запроса: {e}")

    def left(self) -> None:
        self._call(self.left_url)

    def right(self) -> None:
        self._call(self.right_url)

    def stop(self) -> None:
        self._call(self.stop_url)


class HikvisionISAPIPTZController:
    """
    PTZ через Hikvision ISAPI (HTTP PUT /ISAPI/PTZCtrl/channels/N/continuous).
    Подходит для камер Hikvision с поддержкой ISAPI.
    """
    def __init__(self, name: str, cfg: Dict[str, Any]):
        self.name = name
        host = str(cfg.get("host", "")).strip()
        port = int(cfg.get("port", 80))
        self.username = str(cfg.get("username", ""))
        self.password = str(cfg.get("password", ""))
        self.channel = int(cfg.get("channel", 1))
        use_ssl = bool(cfg.get("use_ssl", False))
        if not (host and self.username and self.password):
            raise ValueError("ISAPI config requires host, username, password")

        self.base_url = f"{'https' if use_ssl else 'http'}://{host}:{port}"
        self.timeout = float(cfg.get("timeout", 5.0))
        self.step_seconds = float(cfg.get("step_seconds", 8.0))
        self.move_style = str(cfg.get("move_style", "continuous")).lower() or "continuous"
        self.pan_speed = int(cfg.get("pan_speed", 80))  # 1..100 для ISAPI

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    def _put_continuous(self, pan: int, tilt: int) -> bool:
        """PUT continuous move. pan/tilt от -100 до 100. 0,0 = стоп."""
        url = self._url(f"/ISAPI/PTZCtrl/channels/{self.channel}/continuous")
        xml = f'<?xml version="1.0" encoding="UTF-8"?><PTZData><pan>{pan}</pan><tilt>{tilt}</tilt></PTZData>'
        try:
            from requests.auth import HTTPDigestAuth, HTTPBasicAuth
            headers = {"Content-Type": "application/xml"}
            # Пробуем сначала Digest (стандарт для Hikvision), затем Basic как fallback
            for auth_type, auth in [
                ("Digest", HTTPDigestAuth(self.username, self.password)),
                ("Basic", HTTPBasicAuth(self.username, self.password)),
            ]:
                r = requests.put(
                    url,
                    data=xml.encode("utf-8"),
                    headers=headers,
                    auth=auth,
                    timeout=self.timeout,
                )
                if r.status_code == 200:
                    return True
                if r.status_code == 401 and auth_type == "Digest":
                    # Если Digest не прошёл, пробуем Basic
                    continue
                if r.status_code != 200:
                    print(f"[PTZ/ISAPI] {self.name}: {auth_type} auth — response {r.status_code}")
                    if r.status_code == 401:
                        # Показываем подсказку об аутентификации
                        www_auth = r.headers.get("WWW-Authenticate", "")
                        if www_auth:
                            print(f"[PTZ/ISAPI] {self.name}: WWW-Authenticate: {www_auth[:100]}")
            return False
        except Exception as e:
            print(f"[PTZ/ISAPI] {self.name}: ошибка {e}")
            return False

    def _continuous_move(self, x: float, y: float) -> None:
        pan = max(-100, min(100, int(x * self.pan_speed)))
        tilt = max(-100, min(100, int(y * self.pan_speed)))
        total_time = max(0.5, self.step_seconds)
        print(f"[PTZ/ISAPI] {self.name}: continuous movement pan={pan} tilt={tilt} for {total_time:.1f}s")
        self._put_continuous(pan, tilt)
        time.sleep(total_time)
        self.stop()
        print(f"[PTZ/ISAPI] {self.name}: movement complete")

    def _start_continuous_move(self, x: float, y: float) -> None:
        pan = max(-100, min(100, int(x * self.pan_speed)))
        tilt = max(-100, min(100, int(y * self.pan_speed)))
        print(f"[PTZ/ISAPI] {self.name}: move pan={pan} tilt={tilt}")
        self._put_continuous(pan, tilt)

    def move(self, pan: float, tilt: float) -> None:
        """Для джойстика: направление -1..1."""
        self._start_continuous_move(pan, tilt)

    def left(self) -> None:
        self._continuous_move(-1, 0)

    def right(self) -> None:
        self._continuous_move(1, 0)

    def up(self) -> None:
        self._start_continuous_move(0, 1)

    def down(self) -> None:
        self._start_continuous_move(0, -1)

    def stop(self) -> None:
        self._put_continuous(0, 0)
        print(f"[PTZ/ISAPI] {self.name}: stop")


class OnvifPTZController:
    def __init__(self, name: str, cfg: Dict[str, Any]):
        if ONVIFCamera is None:
            raise RuntimeError("ONVIFCamera module not available. Install onvif-zeep: pip install onvif-zeep")
        self.name = name
        host = cfg.get("host")
        port = int(cfg.get("port", 80))
        username = cfg.get("username")
        password = cfg.get("password")
        if not (host and username and password):
            raise ValueError("ONVIF config requires host, username, password")

        self.pan_speed = float(cfg.get("pan_speed", 0.6))
        self.tilt_speed = float(cfg.get("tilt_speed", 0.0))
        self.max_left = float(cfg.get("max_left", -1.0))
        self.max_right = float(cfg.get("max_right", 1.0))
        self.max_up = float(cfg.get("max_up", 1.0))
        self.max_down = float(cfg.get("max_down", -1.0))
        self.timeout = float(cfg.get("timeout", 1.0))
        # Длительность одного шага патруля (сек) — сколько двигать камеру влево/вправо
        self.step_seconds = float(cfg.get("step_seconds", 8.0))
        # "continuous" = плавное движение без пауз; "burst" = короткие рывки с паузами (под старые камеры)
        self.move_style = str(cfg.get("move_style", "continuous")).lower() or "continuous"

        wsdl_dir = _get_wsdl_dir()
        if wsdl_dir:
            self.cam = ONVIFCamera(host, port, username, password, wsdl_dir=wsdl_dir)
        else:
            self.cam = ONVIFCamera(host, port, username, password)
        _fix_xaddrs_use_config_host(self.cam, host, port)
        self.media = self.cam.create_media_service()
        self.ptz = self.cam.create_ptz_service()
        profiles = self.media.GetProfiles()
        self.profile = profiles[0]

    def _relative_move(self, x: float, y: float) -> None:
        """Относительное движение на заданный угол"""
        try:
            req = self.ptz.create_type('RelativeMove')
            req.ProfileToken = self.profile.token
            req.Translation = {'PanTilt': {'x': x, 'y': y}}
            print(f"[PTZ/ONVIF] {self.name}: relative move x={x} y={y}")
            self.ptz.RelativeMove(req)
            time.sleep(self.timeout)
        except Exception as e:
            print(f"[PTZ/ONVIF] {self.name}: relative move error {e}")
            # Fallback к continuous move
            self._continuous_move(1.0 if x > 0 else -1.0, 0.0)

    def _continuous_move(self, x: float, y: float) -> None:
        """Движение в направлении (x, y) на step_seconds секунд. Плавный режим по умолчанию."""
        total_time = max(0.5, self.step_seconds)
        try:
            req = self.ptz.create_type('ContinuousMove')
            req.ProfileToken = self.profile.token
            req.Velocity = {'PanTilt': {'x': x, 'y': y}}

            if self.move_style == "burst":
                burst_duration = 0.5
                pause_duration = 0.2
                cycle_time = burst_duration + pause_duration
                print(f"[PTZ/ONVIF] {self.name}: burst movement x={x} y={y} for {total_time:.1f}s")
                elapsed = 0
                while elapsed < total_time:
                    self.ptz.ContinuousMove(req)
                    time.sleep(burst_duration)
                    self.stop()
                    time.sleep(pause_duration)
                    elapsed += cycle_time
                print(f"[PTZ/ONVIF] {self.name}: movement complete")
            else:
                print(f"[PTZ/ONVIF] {self.name}: continuous movement x={x} y={y} for {total_time:.1f}s")
                self.ptz.ContinuousMove(req)
                time.sleep(total_time)
                self.stop()
                print(f"[PTZ/ONVIF] {self.name}: movement complete")
        except Exception as e:
            print(f"[PTZ/ONVIF] {self.name}: continuous move error {e}")

    def _absolute_move(self, x: float, y: float) -> None:
        try:
            req = self.ptz.create_type('AbsoluteMove')
            req.ProfileToken = self.profile.token
            req.Position = {'PanTilt': {'x': x, 'y': y}}
            print(f"[PTZ/ONVIF] {self.name}: absolute move to x={x} y={y}")
            self.ptz.AbsoluteMove(req)
            time.sleep(self.timeout)
        except Exception as e:
            print(f"[PTZ/ONVIF] {self.name}: absolute move error {e}")

    def _start_continuous_move(self, x: float, y: float) -> None:
        """Запуск непрерывного движения без ожидания (для джойстика: движение пока не вызван stop)."""
        try:
            req = self.ptz.create_type('ContinuousMove')
            req.ProfileToken = self.profile.token
            req.Velocity = {'PanTilt': {'x': x, 'y': y}}
            self.ptz.ContinuousMove(req)
            print(f"[PTZ/ONVIF] {self.name}: move pan={x:.2f} tilt={y:.2f}")
        except Exception as e:
            print(f"[PTZ/ONVIF] {self.name}: continuous move error {e}")

    def move(self, pan: float, tilt: float) -> None:
        """Задать направление движения (значения -1..1). Используем pan_speed/tilt_speed из конфига."""
        pan = max(-1.0, min(1.0, pan)) * self.pan_speed
        tilt_val = self.tilt_speed if self.tilt_speed else self.pan_speed
        tilt = max(-1.0, min(1.0, tilt)) * tilt_val
        self._start_continuous_move(pan, tilt)

    def left(self) -> None:
        self._continuous_move(-1.0, 0.0)  # Максимальная скорость влево

    def right(self) -> None:
        self._continuous_move(1.0, 0.0)  # Максимальная скорость вправо

    def up(self) -> None:
        self._start_continuous_move(0.0, self.tilt_speed if self.tilt_speed else 1.0)

    def down(self) -> None:
        self._start_continuous_move(0.0, -(self.tilt_speed if self.tilt_speed else 1.0))

    def stop(self) -> None:
        try:
            req = self.ptz.create_type('Stop')
            req.ProfileToken = self.profile.token
            req.PanTilt = True
            print(f"[PTZ/ONVIF] {self.name}: stop")
            self.ptz.Stop(req)
        except Exception as e:
            print(f"[PTZ/ONVIF] {self.name}: stop error {e}")


class PTZSweeper(threading.Thread):
    def __init__(self, controller: PTZController, step_seconds: float, pause_seconds: float, cycles: int):
        super().__init__(daemon=True)
        self.controller = controller
        self.step_seconds = step_seconds
        self.pause_seconds = pause_seconds
        self.cycles = cycles  # 0 = бесконечно
        self._stop_event = threading.Event()
        self._pause_until = 0.0  # time.time() до которого приостановлен (джойстик)
        self._pause_lock = threading.Lock()

    def pause(self, seconds: float = 5.0) -> None:
        """Приостановить патруль на seconds секунд (используется при управлении джойстиком)."""
        with self._pause_lock:
            self._pause_until = max(self._pause_until, time.time()) + seconds

    def _wait_pause(self) -> None:
        with self._pause_lock:
            until = self._pause_until
        while time.time() < until and not self._stop_event.is_set():
            time.sleep(0.1)
            with self._pause_lock:
                until = self._pause_until

    def stop(self) -> None:
        self._stop_event.set()
        try:
            self.controller.stop()
        except Exception:
            pass

    def run(self) -> None:
        iteration = 0
        while not self._stop_event.is_set() and (self.cycles == 0 or iteration < self.cycles):
            self._wait_pause()
            if self._stop_event.is_set():
                break
            # Влево
            self.controller.left()
            self._sleep_with_check(self.step_seconds)
            self.controller.stop()
            self._sleep_with_check(self.pause_seconds)

            if self._stop_event.is_set():
                break
            self._wait_pause()
            if self._stop_event.is_set():
                break

            # Вправо
            self.controller.right()
            self._sleep_with_check(self.step_seconds)
            self.controller.stop()
            self._sleep_with_check(self.pause_seconds)

            iteration += 1

    def _sleep_with_check(self, seconds: float) -> None:
        end_time = time.time() + seconds
        while time.time() < end_time and not self._stop_event.is_set():
            time.sleep(0.1)


def _fix_xaddrs_use_config_host(cam: Any, host: str, port: int) -> None:
    """Подменяет host:port в xaddrs на значения из конфига. Камера часто возвращает свой внутренний IP (192.168.x.x)."""
    netloc = f"{host}:{port}"
    for ns, xaddr in list(getattr(cam, "xaddrs", {}).items()):
        try:
            p = urlparse(xaddr)
            new_xaddr = urlunparse((p.scheme, netloc, p.path or "/", p.params, p.query, p.fragment))
            cam.xaddrs[ns] = new_xaddr
        except Exception:
            pass


def _get_wsdl_dir() -> Optional[str]:
    """Путь к папке wsdl (обход ошибки 'onvif.xsd not found' при установке из PyPI)."""
    base = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(base, "wsdl"),
        os.path.join(base, "..", "wsdl"),
    ]
    for d in candidates:
        path = os.path.normpath(d)
        if os.path.isfile(os.path.join(path, "onvif.xsd")):
            return path
    return None


def load_ptz_config() -> Dict[str, Any]:
    base_dir = os.path.dirname(__file__)
    cfg_path = os.path.join(base_dir, "ptz_config.json")
    if not os.path.exists(cfg_path):
        return {}
    try:
        with open(cfg_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _merge_ptz_opts_into_onvif(cam_cfg: Dict[str, Any], onvif_cfg: Dict[str, Any]) -> None:
    """Пробрасывает step_seconds и move_style из конфига камеры в onvif для универсальной работы."""
    if "step_seconds" not in onvif_cfg:
        onvif_cfg["step_seconds"] = float(cam_cfg.get("step_seconds", 8.0))
    if "move_style" not in onvif_cfg:
        onvif_cfg["move_style"] = str(cam_cfg.get("move_style", "continuous")).lower() or "continuous"


def _merge_ptz_opts_into_isapi(cam_cfg: Dict[str, Any], isapi_cfg: Dict[str, Any]) -> None:
    """Пробрасывает step_seconds, move_style, pan_speed из конфига камеры в isapi."""
    if "step_seconds" not in isapi_cfg:
        isapi_cfg["step_seconds"] = float(cam_cfg.get("step_seconds", 8.0))
    if "move_style" not in isapi_cfg:
        isapi_cfg["move_style"] = str(cam_cfg.get("move_style", "continuous")).lower() or "continuous"
    if "pan_speed" not in isapi_cfg:
        isapi_cfg["pan_speed"] = int(cam_cfg.get("pan_speed", 80))


def get_ptz_controller(camera_name: str) -> Optional[Any]:
    """Создаёт PTZ-контроллер для камеры (для джойстика), или None если камера без PTZ.
    Приоритет: isapi (Hikvision) → onvif → left_url/right_url (HTTP)."""
    cfg = load_ptz_config()
    cameras = cfg.get("cameras", {}) if isinstance(cfg, dict) else {}
    cam_cfg = cameras.get(camera_name)
    if not cam_cfg:
        return None
    protocol = str(cam_cfg.get("protocol", "")).lower()

    # ISAPI: только если есть блок isapi с обязательными полями (host, username, password)
    isapi_block = cam_cfg.get("isapi")
    if isapi_block and isinstance(isapi_block, dict):
        isapi_cfg = dict(isapi_block)
        if isapi_cfg.get("host") and isapi_cfg.get("username") and isapi_cfg.get("password"):
            isapi_cfg["timeout"] = float(cam_cfg.get("timeout", 5.0))
            _merge_ptz_opts_into_isapi(cam_cfg, isapi_cfg)
            try:
                return HikvisionISAPIPTZController(camera_name, isapi_cfg)
            except Exception:
                pass
    elif protocol == "isapi" and not isapi_block:
        # protocol="isapi" указан, но блока isapi нет — пропускаем ISAPI, используем ONVIF
        pass

    if cam_cfg.get("onvif"):
        onvif_cfg = dict(cam_cfg["onvif"])
        onvif_cfg["timeout"] = float(cam_cfg.get("timeout", 1.0))
        _merge_ptz_opts_into_onvif(cam_cfg, onvif_cfg)
        try:
            return OnvifPTZController(camera_name, onvif_cfg)
        except Exception:
            return None
    if cam_cfg.get("left_url") or cam_cfg.get("right_url"):
        return PTZController(camera_name, cam_cfg)
    return None


def start_ptz_sweeper_if_configured(camera_name: str) -> Optional[PTZSweeper]:
    cfg = load_ptz_config()
    cameras = cfg.get("cameras", {}) if isinstance(cfg, dict) else {}
    cam_cfg = cameras.get(camera_name)
    if not cam_cfg:
        print(f"[PTZ] Конфиг для камеры '{camera_name}' не найден. PTZ отключён.")
        return None

    protocol = str(cam_cfg.get("protocol", "")).lower()
    controller: Any = None

    # ISAPI: только если есть блок isapi с обязательными полями
    isapi_block = cam_cfg.get("isapi")
    if isapi_block and isinstance(isapi_block, dict):
        isapi_cfg = dict(isapi_block)
        if isapi_cfg.get("host") and isapi_cfg.get("username") and isapi_cfg.get("password"):
            isapi_cfg["timeout"] = float(cam_cfg.get("timeout", 5.0))
            _merge_ptz_opts_into_isapi(cam_cfg, isapi_cfg)
            try:
                controller = HikvisionISAPIPTZController(camera_name, isapi_cfg)
                print(f"[PTZ] Используется протокол: ISAPI (Hikvision)")
            except Exception as e:
                print(f"[PTZ] ISAPI не удалось: {e}. Пробуем ONVIF/HTTP...")
        elif protocol == "isapi":
            print(f"[PTZ] protocol='isapi' указан, но блок isapi неполный (нет host/username/password). Используем ONVIF/HTTP...")
    if controller is None and cam_cfg.get("onvif"):
        onvif_cfg = dict(cam_cfg["onvif"])
        onvif_cfg["timeout"] = float(cam_cfg.get("timeout", 1.0))
        _merge_ptz_opts_into_onvif(cam_cfg, onvif_cfg)
        try:
            controller = OnvifPTZController(camera_name, onvif_cfg)
            print(f"[PTZ] Используется протокол: ONVIF")
        except Exception as e:
            print(f"[PTZ] ONVIF не удалось: {e}. Пытаюсь HTTP режим...")
            controller = PTZController(camera_name, cam_cfg)
    if controller is None:
        controller = PTZController(camera_name, cam_cfg)
    # Рекомендуемые значения для леса: 8–12 секунд на шаг, пауза 2–3 секунды
    step_seconds = float(cam_cfg.get("step_seconds", 10))
    pause_seconds = float(cam_cfg.get("pause_seconds", 2))
    cycles = int(cam_cfg.get("sweep_cycles", 0))  # 0 = бесконечно

    sweeper = PTZSweeper(controller, step_seconds, pause_seconds, cycles)
    sweeper.start()
    print(f"[PTZ] Старт PTZ для '{camera_name}': шаг {step_seconds}s, пауза {pause_seconds}s, циклы {cycles or '∞'}")
    return sweeper


