#!/usr/bin/env python3
"""
Визуальный джойстик для управления PTZ-камерой.
Параметры подключения читаются из ptz_config.json (рядом со скриптом).
"""
import json
import math
import os
import sys
import threading

# Добавляем путь к модулю ptz
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

try:
    import tkinter as tk
    from tkinter import ttk, messagebox
except ImportError:
    print("Требуется tkinter (обычно входит в поставку Python).")
    sys.exit(1)

from ptz import load_ptz_config, OnvifPTZController  # noqa: E402


def load_cameras():
    cfg = load_ptz_config()
    cameras = cfg.get("cameras", {}) if isinstance(cfg, dict) else {}
    return {name: c for name, c in cameras.items() if c.get("onvif")}


class PTZJoystickApp:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("PTZ Joystick")
        self.root.resizable(True, True)
        self.root.minsize(360, 400)
        self.root.configure(bg="#0f0f1a")

        self.controller = None
        self.cameras = load_cameras()
        self._move_thread = None
        self._keys_pressed = set()  # для клавиатуры
        self._joystick_active = False
        self._last_pan = 0.0
        self._last_tilt = 0.0

        self._build_ui()

    def _build_ui(self):
        top = tk.Frame(self.root, bg="#0f0f1a", padx=12, pady=10)
        top.pack(fill=tk.X)

        tk.Label(top, text="Камера:", fg="#94a3b8", bg="#0f0f1a").pack(side=tk.LEFT, padx=(0, 6))
        self.camera_var = tk.StringVar()
        names = list(self.cameras.keys())
        if not names:
            names = ["— Нет камер в ptz_config.json —"]
            self.camera_var.set(names[0])
        else:
            self.camera_var.set(names[0])
        cb_frame = tk.Frame(top, bg="#1e1e2e", highlightbackground="#334155", highlightthickness=1)
        cb_frame.pack(side=tk.LEFT, padx=(0, 8))
        self.camera_combo = ttk.Combobox(
            cb_frame, textvariable=self.camera_var, values=names, state="readonly", width=22
        )
        self.camera_combo.pack(padx=6, pady=4)

        self.connect_btn = ttk.Button(top, text="Подключить", command=self._on_connect)
        self.connect_btn.pack(side=tk.LEFT, padx=(0, 8))
        self.status_var = tk.StringVar(value="Выберите камеру и нажмите «Подключить»")
        tk.Label(top, textvariable=self.status_var, fg="#64748b", bg="#0f0f1a").pack(side=tk.LEFT, padx=4)

        # Область джойстика
        joy_container = tk.Frame(self.root, bg="#0f0f1a", padx=12, pady=8)
        joy_container.pack(fill=tk.BOTH, expand=True)
        tk.Label(joy_container, text="Джойстик", fg="#94a3b8", bg="#0f0f1a").pack(anchor="w")
        tk.Label(joy_container, text="Перетащите ручку или используйте стрелки", fg="#64748b", bg="#0f0f1a", font=("", 9)).pack(anchor="w", pady=(0, 6))

        canvas_frame = tk.Frame(joy_container, bg="#16161e", highlightbackground="#f59e0b", highlightthickness=2)
        canvas_frame.pack()
        self.joy_canvas = tk.Canvas(canvas_frame, width=280, height=280, bg="#0f0f1a", highlightthickness=0)
        self.joy_canvas.pack(padx=4, pady=4)

        self.joy_radius = 120
        self.joy_cx = 140
        self.joy_cy = 140
        self.knob_radius = 28
        self._knob_tag = "knob"
        self._draw_joystick_base()
        self._draw_knob(0, 0)

        self.joy_canvas.bind("<ButtonPress-1>", self._on_joy_press)
        self.joy_canvas.bind("<B1-Motion>", self._on_joy_drag)
        self.joy_canvas.bind("<ButtonRelease-1>", self._on_joy_release)

        self.root.bind_all("<KeyPress>", self._on_key_down)
        self.root.bind_all("<KeyRelease>", self._on_key_up)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _draw_joystick_base(self):
        c = self.joy_canvas
        r = self.joy_radius
        cx, cy = self.joy_cx, self.joy_cy
        c.create_oval(cx - r - 10, cy - r - 10, cx + r + 10, cy + r + 10, fill="#16161e", outline="#f59e0b", width=2)
        c.create_oval(cx - r, cy - r, cx + r, cy + r, fill="#1a1a2e", outline="#475569", width=1)
        c.create_line(cx - r, cy, cx + r, cy, fill="#334155", width=1, dash=(4, 4))
        c.create_line(cx, cy - r, cx, cy + r, fill="#334155", width=1, dash=(4, 4))

    def _draw_knob(self, dx: float, dy: float):
        r = self.joy_radius - self.knob_radius
        dist = math.sqrt(dx * dx + dy * dy)
        if dist > r and dist > 0:
            dx, dy = dx * r / dist, dy * r / dist
        nx = self.joy_cx + dx
        ny = self.joy_cy + dy
        self.joy_canvas.delete(self._knob_tag)
        self.joy_canvas.create_oval(nx - self.knob_radius - 2, ny - self.knob_radius + 2,
                                   nx + self.knob_radius - 2, ny + self.knob_radius + 2,
                                   fill="#0a0a12", outline="", tags=self._knob_tag)
        self.joy_canvas.create_oval(nx - self.knob_radius, ny - self.knob_radius,
                                   nx + self.knob_radius, ny + self.knob_radius,
                                   fill="#f59e0b", outline="#fbbf24", width=2, tags=self._knob_tag)
        self.joy_canvas.create_oval(nx - self.knob_radius * 0.55, ny - self.knob_radius * 0.55,
                                   nx + self.knob_radius * 0.55, ny + self.knob_radius * 0.55,
                                   fill="#fcd34d", outline="#f59e0b", width=1, tags=self._knob_tag)

    def _on_connect(self):
        name = self.camera_var.get().strip()
        if not name or name.startswith("—") or name not in self.cameras:
            self.status_var.set("Нет выбранной камеры с ONVIF")
            return
        cam_cfg = self.cameras[name]
        onvif_cfg = dict(cam_cfg.get("onvif", {}))
        onvif_cfg["timeout"] = float(cam_cfg.get("timeout", 1.0))
        self.connect_btn.state(["disabled"])
        self.status_var.set("Подключение...")
        self.root.update_idletasks()

        def connect():
            err_msg = None
            ctrl = None
            try:
                ctrl = OnvifPTZController(name, onvif_cfg)
            except Exception as e:
                err_msg = str(e)
            self.root.after(0, lambda: self._set_controller(ctrl, err_msg))

        threading.Thread(target=connect, daemon=True).start()

    def _set_controller(self, ctrl, err):
        if ctrl:
            self.controller = ctrl
            self.status_var.set(f"Подключено: {ctrl.name}")
            self.joy_canvas.focus_set()
        else:
            self.controller = None
            self.status_var.set(f"Ошибка: {err or 'неизвестно'}")
            if err:
                messagebox.showerror("PTZ", err)
        self.connect_btn.state(["!disabled"])

    def _send_move(self, pan: float, tilt: float):
        if not self.controller:
            return
        self._last_pan, self._last_tilt = pan, tilt
        try:
            self.controller.move(pan, tilt)
        except Exception as e:
            self.status_var.set(f"Ошибка: {e}")

    def _send_stop(self):
        if not self.controller:
            return
        try:
            self.controller.stop()
        except Exception as e:
            self.status_var.set(f"Ошибка: {e}")
        self._last_pan, self._last_tilt = 0.0, 0.0

    def _xy_to_velocity(self, dx: float, dy: float):
        r = self.joy_radius - self.knob_radius
        if r <= 0:
            return 0.0, 0.0
        import math
        dist = math.sqrt(dx * dx + dy * dy)
        if dist <= 0:
            return 0.0, 0.0
        scale = min(1.0, dist / r)
        pan = (dx / r) * scale
        tilt = -(dy / r) * scale
        return pan, tilt

    def _on_joy_press(self, event):
        self._joystick_active = True
        dx = event.x - self.joy_cx
        dy = event.y - self.joy_cy
        pan, tilt = self._xy_to_velocity(dx, dy)
        self._draw_knob(dx, dy)
        self._send_move(pan, tilt)

    def _on_joy_drag(self, event):
        if not self._joystick_active:
            return
        dx = event.x - self.joy_cx
        dy = event.y - self.joy_cy
        pan, tilt = self._xy_to_velocity(dx, dy)
        self._draw_knob(dx, dy)
        self._send_move(pan, tilt)

    def _on_joy_release(self, event):
        self._joystick_active = False
        self._draw_knob(0, 0)
        self._send_stop()

    def _on_key_down(self, event):
        key = event.keysym
        if key in self._keys_pressed:
            return
        self._keys_pressed.add(key)
        pan, tilt = 0.0, 0.0
        if key == "Left":
            pan = -1.0
        elif key == "Right":
            pan = 1.0
        elif key == "Up":
            tilt = 1.0
        elif key == "Down":
            tilt = -1.0
        else:
            self._keys_pressed.discard(key)
            return
        self._send_move(pan, tilt)
        self._update_knob_from_keys()

    def _on_key_up(self, event):
        key = event.keysym
        self._keys_pressed.discard(key)
        pan, tilt = 0.0, 0.0
        if self._keys_pressed:
            if "Left" in self._keys_pressed:
                pan -= 1.0
            if "Right" in self._keys_pressed:
                pan += 1.0
            if "Up" in self._keys_pressed:
                tilt += 1.0
            if "Down" in self._keys_pressed:
                tilt -= 1.0
            pan = max(-1.0, min(1.0, pan))
            tilt = max(-1.0, min(1.0, tilt))
            self._send_move(pan, tilt)
        else:
            self._send_stop()
        self._update_knob_from_keys()

    def _update_knob_from_keys(self):
        r = self.joy_radius - self.knob_radius
        dx = self._last_pan * r
        dy = -self._last_tilt * r
        self._draw_knob(dx, dy)

    def _on_close(self):
        self._send_stop()
        self.root.destroy()

    def run(self):
        self.root.mainloop()


def main():
    app = PTZJoystickApp()
    app.run()


if __name__ == "__main__":
    main()
