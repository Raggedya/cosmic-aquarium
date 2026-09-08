from __future__ import annotations

import http.server
import socketserver
import threading
from pathlib import Path


class TourismPreviewHandler(http.server.SimpleHTTPRequestHandler):
    base_directory: Path

    def translate_path(self, path: str) -> str:
        if path.startswith("/cosmic-aquarium"):
            path = path[len("/cosmic-aquarium"):] or "/"
        original = self.path
        self.path = path
        try:
            return super().translate_path(path)
        finally:
            self.path = original

    def log_message(self, _format: str, *_args) -> None:
        return


def start_preview_server(directory: Path, port: int = 4173) -> tuple[socketserver.TCPServer, str]:
    handler = lambda *args, **kwargs: TourismPreviewHandler(*args, directory=str(directory), **kwargs)  # noqa: E731
    server = socketserver.ThreadingTCPServer(("127.0.0.1", port), handler)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True, name="tourism-preview-server").start()
    return server, f"http://127.0.0.1:{port}/cosmic-aquarium/tourism/"
