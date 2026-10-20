# -*- coding: utf-8 -*-
"""Máy chủ tĩnh dùng cho kiểm thử: giống `python -m http.server` nhưng LUÔN trả config.js ở CHẾ ĐỘ THỬ (backend 'local'),
để kiểm thử không chạm vào Firebase thật dù config.js của dự án đã nối Firebase.
Chạy:  python kiem_thu/serve_test.py <cổng> [thư_mục_gốc]"""
import functools
import http.server
import sys

DEMO_CONFIG = b"window.PYLAB_CONFIG = { backend: 'local', firebase: {}, maxFileKB: 700 };\n"


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split("?")[0].endswith("/config.js"):
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript")
            self.send_header("Content-Length", str(len(DEMO_CONFIG)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(DEMO_CONFIG)
            return
        super().do_GET()

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1])
    root = sys.argv[2] if len(sys.argv) > 2 else "."
    http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Handler, directory=root)).serve_forever()
