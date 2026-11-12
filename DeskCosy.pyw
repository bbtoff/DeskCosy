"""DeskCosy — lanceur « bureau ».

Ouvre le jeu dans une fenêtre sans bordure, toujours au premier plan,
ancrée en bas de l'écran (ou en haut / à gauche / à droite / libre).
La sauvegarde est stockée dans %APPDATA%\\DeskCosy\\save.json.
"""
import atexit
import ctypes
import functools
import http.server
import json
import os
import socketserver
import sys
import threading
import time
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.environ.get('APPDATA') or os.path.expanduser('~'), 'DeskCosy')
SAVE = os.path.join(DATA, 'save.json')
os.makedirs(DATA, exist_ok=True)

try:
    import webview
except ImportError:
    # pywebview absent : on joue dans le navigateur à la place.
    ctypes.windll.user32.MessageBoxW(
        0,
        "Le module 'pywebview' n'est pas installé.\n\n"
        "Lancez « Lancer DeskCosy.bat » pour l'installer automatiquement.\n"
        "Le jeu va s'ouvrir dans votre navigateur.",
        "DeskCosy", 0x40)
    webbrowser.open('file:///' + os.path.join(HERE, 'index.html').replace('\\', '/'))
    sys.exit(0)

WINDOW = None


# ---------------------------------------------------------------- serveur local
class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


def start_server():
    handler = functools.partial(_QuietHandler, directory=HERE)
    for port in (47821, 47822, 47823, 0):
        try:
            srv = socketserver.ThreadingTCPServer(('127.0.0.1', port), handler)
            break
        except OSError:
            continue
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv.server_address[1]


# ---------------------------------------------------------------- géométrie
class _RECT(ctypes.Structure):
    _fields_ = [('left', ctypes.c_long), ('top', ctypes.c_long),
                ('right', ctypes.c_long), ('bottom', ctypes.c_long)]


def work_area():
    """Zone de travail de l'écran principal (sans la barre des tâches), en pixels logiques."""
    try:
        scr = webview.screens[0]
        sw, sh = scr.width, scr.height
    except Exception:
        sw, sh = 1920, 1080
    try:
        u = ctypes.windll.user32
        r = _RECT()
        u.SystemParametersInfoW(0x30, 0, ctypes.byref(r), 0)  # SPI_GETWORKAREA
        k = u.GetSystemMetrics(0) / sw if sw else 1.0          # physique / logique
        if k <= 0:
            k = 1.0
        return r.left / k, r.top / k, (r.right - r.left) / k, (r.bottom - r.top) / k
    except Exception:
        return 0, 0, sw, sh - 48


def geometry(mode, size):
    x, y, w, h = work_area()
    size = max(140, min(int(size or 240), 900))
    side = max(300, size)
    if mode == 'top':
        return x, y, w, size
    if mode == 'left':
        return x, y, side, h
    if mode == 'right':
        return x + w - side, y, side, h
    if mode == 'free':
        fw, fh = min(1100, w - 80), min(680, h - 80)
        return x + (w - fw) / 2, y + (h - fh) / 2, fw, fh
    return x, y + h - size, w, size  # bottom


def read_save():
    try:
        with open(SAVE, 'r', encoding='utf-8') as f:
            return f.read()
    except OSError:
        return None


def window_handle():
    """HWND natif de la fenêtre du jeu (ou None)."""
    try:
        return int(WINDOW.native.Handle.ToInt64())
    except Exception:
        h = ctypes.windll.user32.FindWindowW(None, 'DeskCosy')
        return h or None


# ---------------------------------------------------------------- barre d'application
# En mode « réserver l'espace », la bande s'enregistre comme une barre d'application
# Windows (comme la barre des tâches) : les autres fenêtres, surtout maximisées,
# sont décalées pour ne plus passer dessous.
class _APPBARDATA(ctypes.Structure):
    _fields_ = [('cbSize', ctypes.c_uint32), ('hWnd', ctypes.c_void_p),
                ('uCallbackMessage', ctypes.c_uint32), ('uEdge', ctypes.c_uint32),
                ('rc', _RECT), ('lParam', ctypes.c_ssize_t)]


_shell32 = ctypes.windll.shell32
_shell32.SHAppBarMessage.argtypes = [ctypes.c_uint32, ctypes.POINTER(_APPBARDATA)]
_shell32.SHAppBarMessage.restype = ctypes.c_size_t
ABM_NEW, ABM_REMOVE, ABM_QUERYPOS, ABM_SETPOS = 0, 1, 2, 3
EDGES = {'left': 0, 'top': 1, 'right': 2, 'bottom': 3}
_appbar = {'on': False, 'lock': threading.Lock()}


def _abd(hwnd):
    d = _APPBARDATA()
    d.cbSize = ctypes.sizeof(_APPBARDATA)
    d.hWnd = hwnd
    d.uCallbackMessage = 0x0400 + 0x1DC
    return d


def appbar_remove():
    with _appbar['lock']:
        if not _appbar['on']:
            return
        hwnd = window_handle()
        if hwnd:
            _shell32.SHAppBarMessage(ABM_REMOVE, ctypes.byref(_abd(hwnd)))
        _appbar['on'] = False


def appbar_dock(mode, size):
    """Réserve un bord de l'écran et y place la fenêtre (coordonnées physiques)."""
    hwnd = window_handle()
    if not hwnd or mode not in EDGES:
        return False
    u = ctypes.windll.user32
    sw, sh = u.GetSystemMetrics(0), u.GetSystemMetrics(1)
    try:
        k = sw / webview.screens[0].width
    except Exception:
        k = 1.0
    size = max(140, min(int(size or 240), 900))
    thick = int((size if mode in ('top', 'bottom') else max(300, size)) * k)
    with _appbar['lock']:
        d = _abd(hwnd)
        if not _appbar['on']:
            _shell32.SHAppBarMessage(ABM_NEW, ctypes.byref(d))
            _appbar['on'] = True
        d.uEdge = EDGES[mode]
        d.rc.left, d.rc.top, d.rc.right, d.rc.bottom = 0, 0, sw, sh
        _shell32.SHAppBarMessage(ABM_QUERYPOS, ctypes.byref(d))  # évite la barre des tâches
        if mode == 'bottom':
            d.rc.top = d.rc.bottom - thick
        elif mode == 'top':
            d.rc.bottom = d.rc.top + thick
        elif mode == 'left':
            d.rc.right = d.rc.left + thick
        else:
            d.rc.left = d.rc.right - thick
        _shell32.SHAppBarMessage(ABM_SETPOS, ctypes.byref(d))
        r = d.rc
    SWP_NOZORDER, SWP_NOACTIVATE = 0x0004, 0x0010
    u.SetWindowPos(ctypes.c_void_p(hwnd), None, r.left, r.top,
                   r.right - r.left, r.bottom - r.top, SWP_NOZORDER | SWP_NOACTIVATE)
    return True


# ---------------------------------------------------------------- API JS
class Api:
    def load(self):
        return read_save()

    def save(self, data):
        tmp = SAVE + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            f.write(data)
        os.replace(tmp, SAVE)
        return True

    def apply(self, mode, size, on_top, reserve, rect=None):
        """Applique position, premier plan et réservation d'espace en une fois."""
        if not WINDOW:
            return False
        self.set_on_top(on_top)
        if reserve and on_top and mode in EDGES:
            return appbar_dock(mode, size)
        appbar_remove()
        if mode == 'free' and rect and len(rect) == 4:
            # garder la fenêtre visible (écran changé, résolution modifiée…)
            u = ctypes.windll.user32
            vx, vy, vw, vh = u.GetSystemMetrics(76), u.GetSystemMetrics(77), u.GetSystemMetrics(78), u.GetSystemMetrics(79)
            x, y, w, h = rect
            w, h = min(w, vw), min(h, vh)
            x = max(vx - w + 120, min(x, vx + vw - 120))
            y = max(vy, min(y, vy + vh - 60))
            return self.set_rect(x, y, w, h)
        x, y, w, h = geometry(mode, size)
        WINDOW.resize(int(w), int(h))
        WINDOW.move(int(x), int(y))
        return True

    # --- déplacement / redimensionnement manuels (coordonnées physiques) ---
    def win_rect(self):
        hwnd = window_handle()
        if not hwnd:
            return None
        r = _RECT()
        ctypes.windll.user32.GetWindowRect(ctypes.c_void_p(hwnd), ctypes.byref(r))
        return [r.left, r.top, r.right, r.bottom]

    def set_rect(self, x, y, w, h):
        hwnd = window_handle()
        if not hwnd:
            return False
        SWP_NOZORDER, SWP_NOACTIVATE = 0x0004, 0x0010
        ctypes.windll.user32.SetWindowPos(ctypes.c_void_p(hwnd), None, int(x), int(y),
                                          max(240, int(w)), max(140, int(h)), SWP_NOZORDER | SWP_NOACTIVATE)
        return True

    def undock(self):
        appbar_remove()
        return True

    def set_on_top(self, value):
        # Ne pas utiliser WINDOW.on_top : pywebview modifie alors Form.TopMost depuis
        # le thread de l'API JS, ce qui détruit la vue web et fige la fenêtre.
        # SetWindowPos est sûr depuis n'importe quel thread.
        hwnd = window_handle()
        if hwnd:
            HWND_TOPMOST, HWND_NOTOPMOST = -1, -2
            SWP_NOSIZE, SWP_NOMOVE, SWP_NOACTIVATE = 0x0001, 0x0002, 0x0010
            ctypes.windll.user32.SetWindowPos(
                ctypes.c_void_p(hwnd),
                ctypes.c_void_p(HWND_TOPMOST if value else HWND_NOTOPMOST),
                0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE)
        return True

    def minimize(self):
        if WINDOW:
            WINDOW.minimize()
        return True

    def quit(self):
        if _appbar['on']:
            appbar_remove()
            time.sleep(0.6)  # laisser Windows notifier le changement avant de fermer
        if WINDOW:
            WINDOW.destroy()
        return True


def main():
    global WINDOW
    port = start_server()

    mode, size, on_top = 'bottom', 240, True
    raw = read_save()
    if raw:
        try:
            opts = json.loads(raw).get('opts', {})
            mode = opts.get('dock', mode)
            size = opts.get('dockSize', size)
            on_top = opts.get('onTop', on_top)
        except ValueError:
            pass
    x, y, w, h = geometry(mode, size)

    WINDOW = webview.create_window(
        'DeskCosy',
        url=f'http://127.0.0.1:{port}/index.html?desktop=1',
        js_api=Api(),
        x=int(x), y=int(y), width=int(w), height=int(h),
        min_size=(200, 120),
        frameless=True, easy_drag=False, on_top=on_top,
        background_color='#5a9e4b',
    )
    def on_closing():
        if _appbar['on']:
            appbar_remove()
            time.sleep(0.6)

    WINDOW.events.closing += on_closing
    atexit.register(appbar_remove)
    webview.start(private_mode=False, storage_path=os.path.join(DATA, 'webview'))


if __name__ == '__main__':
    main()
