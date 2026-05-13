import signal
import sys
import os
import threading
import webbrowser

from siteindexer.constants import DEFAULT_SERVER_PORT, BROWSER_OPEN_DELAY

if getattr(sys, "frozen", False):
    DATA_DIR = os.path.dirname(sys.executable)
    STATIC_DIR = os.path.join(sys._MEIPASS, "static")
    ICON_PATH = os.path.join(sys._MEIPASS, "android-chrome-192x192.png")
else:
    DATA_DIR = os.path.dirname(os.path.abspath(__file__))
    STATIC_DIR = os.path.join(DATA_DIR, "web_local", "frontend", "dist")
    ICON_PATH = os.path.join(DATA_DIR, "web_local", "frontend", "public", "android-chrome-192x192.png")

os.chdir(DATA_DIR)
os.environ["SMARTINDEX_DATA_DIR"] = DATA_DIR
os.environ["SMARTINDEX_STATIC_DIR"] = STATIC_DIR

PORT = DEFAULT_SERVER_PORT

_server_instance = None


def open_browser():
    webbrowser.open(f"http://localhost:{PORT}")


def run_server():
    global _server_instance
    try:
        import uvicorn
        from web_local.backend.routes import app
        config = uvicorn.Config(
            app,
            host="127.0.0.1",
            port=PORT,
            log_config=None,
        )
        _server_instance = uvicorn.Server(config)
        _server_instance.run()
    except Exception as e:
        import traceback
        log_path = os.path.join(DATA_DIR, "siteindexer_error.log")
        with open(log_path, "w") as f:
            f.write(traceback.format_exc())
        raise


def build_tray_icon():
    from PIL import Image
    import pystray

    image = Image.open(ICON_PATH)

    def on_open(_icon, _item):
        webbrowser.open(f"http://localhost:{PORT}")

    def on_quit(icon, _item):
        icon.stop()
        if _server_instance is not None:
            _server_instance.should_exit = True
        threading.Timer(1.0, lambda: sys.exit(0)).start()

    menu = pystray.Menu(
        pystray.MenuItem("Open SiteIndexer", on_open, default=True),
        pystray.MenuItem("Quit", on_quit)
    )
    return pystray.Icon("SiteIndexer", image, "SiteIndexer", menu)


if __name__ == "__main__":
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    threading.Timer(BROWSER_OPEN_DELAY, open_browser).start()

    icon = build_tray_icon()
    icon.run()
