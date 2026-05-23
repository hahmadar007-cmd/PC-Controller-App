"""
SysCtrl v5.3 — Desktop Agent Core (Production Matrix Build)
Stability Release: Dynamic physical interface auto-binding & error guard optimization.
Developed https://www.linkedin.com/in/muhammad-ahmad-3387a7382/
"""

import asyncio
import base64
import ctypes
import io
import json
import logging
import os
import platform
import shutil
import socket
import subprocess
import sys
import threading
import time
import winreg
from collections import defaultdict
from pathlib import Path
from typing import Any, Callable, Coroutine, Optional

import psutil
import pyautogui
import pygetwindow as gw
import websockets
from PIL import Image, ImageDraw, ImageGrab

# ── Optional UI Dependencies ──────────────────────────────────────────────────
try:
    from aiohttp import web as aio_web
    HAS_AIOHTTP = True
except Exception:
    HAS_AIOHTTP = False

try:
    import qrcode
    HAS_QRCODE = True
except Exception:
    HAS_QRCODE = False

try:
    import tkinter as tk
    HAS_TKINTER = True
except Exception:
    HAS_TKINTER = False

# ── Logging & Config ──────────────────────────────────────────────────────────
CONFIG_DIR = Path(os.environ.get("APPDATA", ".")) / "SysCtrl"
CONFIG_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE   = CONFIG_DIR / "agent.log"

logging.basicConfig(level=logging.INFO, format="[%(asctime)s][%(name)s] %(levelname)s %(message)s")
log = logging.getLogger("SysCtrl.Core")

pyautogui.FAILSAFE = False
pyautogui.PAUSE    = 0.0

WS_PORT    = 9996
HTTP_PORT  = 9997
PUSH_HZ    = 1.0       

def get_local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

LOCAL_IP = get_local_ip()

# ─────────────────────────────────────────────────────────────────────────────
# PAIRING WINDOW (Cinematic QR UI)
# ─────────────────────────────────────────────────────────────────────────────

_BG       = "#0D0D0F"
_CARD     = "#131317"
_ACCENT   = "#00E5FF"
_ACCENT2  = "#7C3AED"
_TEXT_PRI = "#F0F0F5"
_TEXT_SEC = "#6B7280"
_QR_BG    = "#FFFFFF"
_QR_FG    = "#0D0D0F"
_RADIUS   = 18
_WIN_W    = 420
_WIN_H    = 580

def _build_qr_pil(ip: str, ws_port: int, http_port: int, size: int = 300) -> "Image.Image":
    payload = json.dumps({"ip": ip, "ws_port": ws_port, "http_port": http_port})
    if not HAS_QRCODE:
        return Image.new("RGB", (size, size), "#CCCCCC")
    qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=10, border=2)
    qr.add_data(payload)
    qr.make(fit=True)
    img = qr.make_image(fill_color=_QR_FG, back_color=_QR_BG).convert("RGB")
    return img.resize((size, size), Image.NEAREST)

def _rounded_rect_image(width: int, height: int, radius: int, fill: str) -> "Image.Image":
    img  = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([(0, 0), (width - 1, height - 1)], radius=radius, fill=fill)
    return img

class PairingWindow:
    _instance: Optional["PairingWindow"] = None

    def __init__(self):
        self._root: Optional[tk.Tk] = None
        self._dismissed = False

    @classmethod
    def launch(cls):
        if not HAS_TKINTER: return
        inst = cls()
        cls._instance = inst
        threading.Thread(target=inst._run, daemon=True, name="SysCtrl-PairingUI").start()

    @classmethod
    def dismiss(cls):
        inst = cls._instance
        if inst and not inst._dismissed:
            inst._safe_hide()

    def _safe_hide(self):
        self._dismissed = True
        if self._root:
            try: self._root.after(0, self._do_hide)
            except Exception: pass

    def _do_hide(self):
        if not self._root: return
        try: self._fade_out(self._root, 1.0)
        except Exception:
            try: self._root.withdraw()
            except Exception: pass

    def _fade_out(self, root: "tk.Tk", alpha: float):
        if alpha <= 0:
            try: root.withdraw()
            except Exception: pass
            return
        try:
            root.attributes("-alpha", alpha)
            root.after(18, lambda: self._fade_out(root, alpha - 0.08))
        except Exception: pass

    def _run(self):
        try:
            root = tk.Tk()
            self._root = root
            root.overrideredirect(True)
            root.attributes("-topmost", True)
            root.attributes("-alpha", 0.0)
            root.configure(bg=_BG)

            sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
            x, y  = (sw - _WIN_W) // 2, (sh - _WIN_H) // 2
            root.geometry(f"{_WIN_W}x{_WIN_H}+{x}+{y}")

            root._drag_x, root._drag_y = 0, 0
            root.bind("<ButtonPress-1>", lambda e: setattr(root, '_drag_x', e.x) or setattr(root, '_drag_y', e.y))
            root.bind("<B1-Motion>", lambda e: root.geometry(f"+{root.winfo_x() + (e.x - root._drag_x)}+{root.winfo_y() + (e.y - root._drag_y)}"))

            canvas = tk.Canvas(root, width=_WIN_W, height=_WIN_H, bg=_BG, highlightthickness=0)
            canvas.pack(fill="both", expand=True)

            card_img = _rounded_rect_image(_WIN_W - 32, _WIN_H - 32, _RADIUS, _CARD)
            top_line = Image.new("RGBA", (_WIN_W - 32, 3), (0, 229, 255, 220))
            card_img.paste(top_line, (0, 0), top_line)

            from PIL import ImageTk
            _card_ph = ImageTk.PhotoImage(card_img)
            canvas.create_image(16, 16, anchor="nw", image=_card_ph)
            canvas._card_ph = _card_ph

            canvas.create_text(_WIN_W // 2, 44,  text="SysCtrl", fill=_ACCENT, font=("Courier New", 22, "bold"), anchor="center")
            canvas.create_text(_WIN_W // 2, 68,  text=f"v5.3  ·  {LOCAL_IP}", fill=_TEXT_SEC, font=("Courier New", 10), anchor="center")

            qr_pil  = _build_qr_pil(LOCAL_IP, WS_PORT, HTTP_PORT, size=264)
            qr_card = Image.new("RGBA", (qr_pil.width + 16, qr_pil.height + 16), (255, 255, 255, 255))
            qr_card.paste(qr_pil, (8, 8))
            _qr_ph = ImageTk.PhotoImage(qr_card)
            canvas.create_image(_WIN_W // 2, _WIN_H // 2 - 12, anchor="center", image=_qr_ph)
            canvas._qr_ph = _qr_ph

            canvas.create_text(_WIN_W // 2, _WIN_H - 138, text="Scan with SysCtrl Mobile App to Connect", fill=_TEXT_PRI, font=("Courier New", 11, "bold"), anchor="center")
            canvas.create_text(_WIN_W // 2, _WIN_H - 118, text=f"ws://{LOCAL_IP}:{WS_PORT}", fill=_TEXT_SEC, font=("Courier New", 9), anchor="center")

            dot = canvas.create_oval(_WIN_W // 2 - 82, _WIN_H - 42, _WIN_W // 2 - 74, _WIN_H - 34, fill=_ACCENT, outline="")
            canvas.create_text(_WIN_W // 2 - 68, _WIN_H - 38, text="Waiting for connection…", fill=_TEXT_SEC, font=("Courier New", 9), anchor="w")

            close_btn = canvas.create_text(_WIN_W - 24, 28, text="×", fill=_TEXT_SEC, font=("Courier New", 18, "bold"), anchor="center", tags="close")
            canvas.tag_bind("close", "<Button-1>", lambda e: self._do_hide())

            _pulse_state = [True]
            def _pulse():
                if self._dismissed: return
                try:
                    canvas.itemconfig(dot, fill=_ACCENT if _pulse_state[0] else _ACCENT2)
                    _pulse_state[0] = not _pulse_state[0]
                    root.after(700, _pulse)
                except Exception: pass
            root.after(700, _pulse)

            def _fade_in(alpha=0.0):
                if alpha >= 1.0: root.attributes("-alpha", 1.0); return
                root.attributes("-alpha", alpha)
                root.after(16, lambda: _fade_in(alpha + 0.06))
            
            root.after(50, _fade_in)
            root.mainloop()
        except Exception as e: log.error(f"PairingWindow error: {e}")

# ─────────────────────────────────────────────────────────────────────────────
# EVENT BUS & TELEMETRY
# ─────────────────────────────────────────────────────────────────────────────

class EventBus:
    def __init__(self):
        self._handlers: dict[str, list[Callable]] = defaultdict(list)
    def subscribe(self, event: str, handler: Callable):
        self._handlers[event].append(handler)
    async def emit(self, event: str, payload: Any = None):
        for handler in list(self._handlers.get(event, [])):
            try:
                if asyncio.iscoroutinefunction(handler): await handler(payload)
                else: handler(payload)
            except Exception: pass

BUS = EventBus()

class TelemetryEngine:
    def __init__(self):
        self._cache: dict = {}
        self._lock = asyncio.Lock()

    async def refresh(self) -> dict:
        cpu  = psutil.cpu_percent(interval=None)
        ram  = psutil.virtual_memory()
        disk = psutil.disk_usage("/")
        batt = psutil.sensors_battery()

        snapshot = {
            "cpu": round(cpu, 1),
            "ram": round(ram.percent, 1),
            "disk_percent": round(disk.percent, 1),
            "battery": round(batt.percent, 1) if batt else 100,
            "plugged": batt.power_plugged if batt else True,
            "ts": time.time(),
        }

        async with self._lock:
            self._cache = snapshot
        return snapshot

    def get(self) -> dict:
        return self._cache.copy()

TELEMETRY = TelemetryEngine()

# ─────────────────────────────────────────────────────────────────────────────
# COMMAND REGISTRY & HANDLERS
# ─────────────────────────────────────────────────────────────────────────────

HandlerFn = Callable[[dict], Coroutine[Any, Any, dict]]

class CommandRegistry:
    def __init__(self):
        self._handlers: dict[str, HandlerFn] = {}
    def register_many(self, mapping: dict[str, HandlerFn]):
        for action, handler in mapping.items():
            self._handlers[action] = handler
    async def dispatch(self, payload: dict) -> dict:
        action = payload.get("action", "")
        handler = self._handlers.get(action)
        if not handler: return {"ok": False, "error": f"Unknown action: '{action}'"}
        try:
            return await handler(payload) or {"ok": True}
        except Exception as e:
            return {"ok": False, "error": str(e)}

REGISTRY = CommandRegistry()

# -- Window Controls --
def _get_windows() -> list[dict]:
    results, seen_hwnd = [], set()
    for win in gw.getAllWindows():
        title = win.title.strip()
        if not title or win.isMinimized: continue
        try:
            hwnd = win._hWnd
            if not hwnd or hwnd in seen_hwnd: continue
            seen_hwnd.add(hwnd)
            results.append({"title": title, "hwnd": hwnd})
        except Exception: continue
    return results

async def handle_get_windows(p: dict) -> dict:
    windows = await asyncio.get_event_loop().run_in_executor(None, _get_windows)
    return {"ok": True, "windows": windows}

async def handle_window_action(p: dict) -> dict:
    hwnd = p.get("hwnd")
    action_type = p.get("type", "focus")
    if not hwnd: return {"ok": False, "error": "No HWND provided"}
    
    def _do():
        target_win = None
        for win in gw.getAllWindows():
            if win._hWnd == hwnd:
                target_win = win
                break
                
        if not target_win: return False

        try:
            if action_type == "focus":
                target_win.restore()    
                target_win.activate()   
            elif action_type == "minimize":
                target_win.minimize()
            elif action_type == "maximize":
                target_win.maximize()
            elif action_type == "close":
                target_win.close()
            return True
        except Exception as e:
            if action_type == "close":
                try:
                    pid = ctypes.c_ulong()
                    ctypes.windll.user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
                    psutil.Process(pid.value).terminate()
                    return True
                except Exception: pass
            return False

    return {"ok": await asyncio.get_event_loop().run_in_executor(None, _do)}

# -- Capture --
async def capture_screenshot(quality: int = 40) -> str:
    def _cap():
        img = ImageGrab.grab(all_screens=True).convert("RGB")
        img.thumbnail((1280, 720), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True)
        return base64.b64encode(buf.getvalue()).decode()
    return await asyncio.get_event_loop().run_in_executor(None, _cap)

# -- Mouse & Keyboard Controls --
async def handle_mouse_move(p: dict) -> dict:
    dx, dy = p.get("dx", 0), p.get("dy", 0)
    sens = p.get("sensitivity", 1.5)
    x, y = pyautogui.position()
    sw, sh = pyautogui.size()
    nx = max(0, min(sw - 1, x + dx * sens))
    ny = max(0, min(sh - 1, y + dy * sens))
    await asyncio.get_event_loop().run_in_executor(None, lambda: pyautogui.moveTo(nx, ny, duration=0))
    return {"ok": True}

async def handle_mouse_click(p: dict) -> dict:
    fn = pyautogui.doubleClick if p.get("double", False) else pyautogui.click
    await asyncio.get_event_loop().run_in_executor(None, lambda: fn(button=p.get("button", "left")))
    return {"ok": True}

async def handle_mouse_scroll(p: dict) -> dict:
    amt = p.get("amount", 3)
    if p.get("direction", "down") == "up": amt = -amt
    await asyncio.get_event_loop().run_in_executor(None, lambda: pyautogui.scroll(-amt))
    return {"ok": True}

async def handle_key(p: dict) -> dict:
    keys = [k.strip() for k in p.get("value", "").split("+")]
    fn = (lambda: pyautogui.hotkey(*keys)) if len(keys) > 1 else (lambda: pyautogui.press(keys[0]))
    await asyncio.get_event_loop().run_in_executor(None, fn)
    return {"ok": True}

# Windows System Advanced Clipboard Input Bypass
async def handle_type(p: dict) -> dict:
    text = p.get("value", "")
    def _type():
        try:
            import win32clipboard
            win32clipboard.OpenClipboard()
            win32clipboard.EmptyClipboard()
            win32clipboard.SetClipboardText(text, win32clipboard.CF_UNICODETEXT)
            win32clipboard.CloseClipboard()
            time.sleep(0.05)
            pyautogui.hotkey('ctrl', 'v')
        except Exception:
            pyautogui.typewrite(text, interval=0.01)
            
    await asyncio.get_event_loop().run_in_executor(None, _type)
    return {"ok": True}

# -- App Launcher & System --
async def scan_installed_apps() -> list[dict]:
    apps = {}
    reg_keys = [
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_CURRENT_USER,  r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
    ]
    def _scan():
        for hive, path in reg_keys:
            try:
                key = winreg.OpenKey(hive, path)
                for i in range(winreg.QueryInfoKey(key)[0]):
                    try:
                        sub  = winreg.OpenKey(key, winreg.EnumKey(key, i))
                        name = winreg.QueryValueEx(sub, "DisplayName")[0]
                        exe  = ""
                        try: exe = winreg.QueryValueEx(sub, "DisplayIcon")[0].split(",")[0].strip('"')
                        except Exception: pass
                        if name and name not in apps: apps[name] = {"name": name, "exe": exe, "source": "registry"}
                    except Exception: continue
            except Exception: continue
        for d in [
            Path(os.environ.get("APPDATA", "")) / "Microsoft/Windows/Start Menu/Programs",
            Path(r"C:\ProgramData\Microsoft\Windows\Start Menu\Programs"),
        ]:
            for lnk in d.rglob("*.lnk"):
                if lnk.stem not in apps: apps[lnk.stem] = {"name": lnk.stem, "exe": str(lnk), "source": "startmenu"}
        return sorted(apps.values(), key=lambda x: x["name"].lower())
    return await asyncio.get_event_loop().run_in_executor(None, _scan)

async def handle_get_apps(p: dict) -> dict:
    return {"ok": True, "apps": await scan_installed_apps()}

async def handle_launch(p: dict) -> dict:
    try:
        subprocess.Popen([p.get("value", "")], shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return {"ok": True}
    except Exception as e: return {"ok": False, "error": str(e)}

async def handle_media(p: dict) -> dict:
    vk = {"play_pause": 0xB3, "next": 0xB0, "prev": 0xB1, "vol_up": 0xAF, "vol_down": 0xAE, "mute": 0xAD}.get(p.get("value", ""))
    if vk: await asyncio.get_event_loop().run_in_executor(None, lambda: (ctypes.windll.user32.keybd_event(vk, 0, 0, 0), ctypes.windll.user32.keybd_event(vk, 0, 2, 0)))
    return {"ok": True}

async def handle_system(p: dict) -> dict:
    v = p.get("value", "")
    loop = asyncio.get_event_loop()
    if v == "lock": await loop.run_in_executor(None, lambda: ctypes.windll.user32.LockWorkStation())
    elif v == "sleep": await loop.run_in_executor(None, lambda: ctypes.windll.powrprof.SetSuspendState(0, 1, 0))
    elif v == "restart": await loop.run_in_executor(None, lambda: os.system("shutdown /r /t 5"))
    elif v == "shutdown": await loop.run_in_executor(None, lambda: os.system("shutdown /s /t 5"))
    return {"ok": True}

REGISTRY.register_many({
    "media": handle_media,
    "system": handle_system,
    "window_action": handle_window_action,
    "get_windows": handle_get_windows,
    "mouse_move": handle_mouse_move,
    "mouse_click": handle_mouse_click,
    "mouse_scroll": handle_mouse_scroll,
    "key": handle_key,
    "type": handle_type,
    "launch": handle_launch,
    "get_apps": handle_get_apps
})

# ─────────────────────────────────────────────────────────────────────────────
# WEBSOCKET HANDLER
# ─────────────────────────────────────────────────────────────────────────────

WS_CLIENTS: dict[str, Any] = {}
WS_LOCK = asyncio.Lock()
_pairing_dismissed = False

async def ws_push_loop():
    while True:
        await asyncio.sleep(PUSH_HZ)
        if not WS_CLIENTS: continue
        
        snap = await TELEMETRY.refresh()
        try: windows = await asyncio.get_event_loop().run_in_executor(None, _get_windows)
        except Exception: windows = []
        
        frame = json.dumps({
            "type": "telemetry",
            **snap,
            "windows": windows,
            "taskbar_apps_count": len(windows),
        })

        dead = []
        async with WS_LOCK:
            for addr, ws in list(WS_CLIENTS.items()):
                try: await ws.send(frame)
                except Exception: dead.append(addr)
            for a in dead: WS_CLIENTS.pop(a, None)

async def ws_handler(websocket):
    global _pairing_dismissed
    addr = str(websocket.remote_address)
    
    async with WS_LOCK: 
        WS_CLIENTS[addr] = websocket

    if not _pairing_dismissed:
        _pairing_dismissed = True
        threading.Thread(target=PairingWindow.dismiss, daemon=True).start()

    await websocket.send(json.dumps({"type": "auth_ok", "version": "5.3"}))

    try:
        async for raw in websocket:
            try:
                msg = json.loads(raw)
                mtype = msg.get("type", "command")
                action = msg.get("action", "")

                if mtype == "ping":
                    await websocket.send(json.dumps({ "type": "pong" }))
                elif mtype == "command":
                    if action == "screenshot":
                        try:
                            image = await capture_screenshot()
                            await websocket.send(json.dumps({
                                "type": "screenshot",
                                "image": image,
                                "_id": msg.get("_id") 
                            }))
                        except Exception as e:
                            await websocket.send(json.dumps({
                                "type": "screenshot",
                                "image": None,
                                "error": str(e),
                                "_id": msg.get("_id")
                            }))
                    else:
                        res = await REGISTRY.dispatch(msg)
                        await websocket.send(json.dumps({
                            "type": "ack",
                            "action": action,
                            "result": res,
                            "_id": msg.get("_id")
                        }))
            except Exception as e: log.warning(f"Error handling message: {e}")
    except Exception: pass
    finally:
        async with WS_LOCK: WS_CLIENTS.pop(addr, None)

# ─────────────────────────────────────────────────────────────────────────────
# HTTP SERVER
# ─────────────────────────────────────────────────────────────────────────────

def _make_aiohttp_app():
    app = aio_web.Application()
    async def _json(data, status=200):
        return aio_web.Response(text=json.dumps(data, ensure_ascii=False), content_type="application/json", status=status, headers={"Access-Control-Allow-Origin": "*"})
    async def ping(r): return await _json({"hostname": socket.gethostname(), "ip": LOCAL_IP, "ws_port": WS_PORT, "http_port": HTTP_PORT, "version": "5.3"})
    async def apps(r): return await _json({"apps": await scan_installed_apps()})
    
    app.router.add_get("/ping", ping)
    app.router.add_get("/apps", apps)
    return app

async def _main():
    psutil.cpu_percent(interval=None)
    await TELEMETRY.refresh()
    
    PairingWindow.launch()
    log.info(f"SysCtrl Desktop Agent v5.3 Booted | IP: {LOCAL_IP}")

    # CRITICAL ADVANCED BOUNDARY: Forces servers to bind explicitly to the resolved physical network adapter
    ws_server = await websockets.serve(
        ws_handler, LOCAL_IP, WS_PORT,
        reuse_address=True,
        ping_interval=20,
        ping_timeout=20,
        max_size=10_485_760 
    )

    if HAS_AIOHTTP:
        runner = aio_web.AppRunner(_make_aiohttp_app())
        await runner.setup()
        site = aio_web.TCPSite(runner, LOCAL_IP, HTTP_PORT)
        await site.start()

    try: await asyncio.gather(ws_push_loop())
    finally:
        ws_server.close()
        await ws_server.wait_closed()
        if HAS_AIOHTTP: await runner.cleanup()

if __name__ == "__main__":
    asyncio.run(_main())