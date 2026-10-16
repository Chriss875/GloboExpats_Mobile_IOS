#!/usr/bin/env python3
"""Static server for the Flutter web build that falls back to index.html for
non-file paths (SPA routing). Serves :9101. Same as python -m http.server but
deep links like /product/42 return the app shell instead of 404."""
import http.server, socketserver, os, sys

ROOT = os.path.expanduser("~/GloboExpats_Mobile/build/web")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9101

class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def send_head(self):
        path = self.translate_path(self.path)
        if not os.path.exists(path) and not self.path.startswith("/assets"):
            # SPA fallback: serve the app shell for any route path
            self.path = "/"
        return super().send_head()

class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True

if __name__ == "__main__":
    with Server(("0.0.0.0", PORT), SPAHandler) as httpd:
        print(f"SPA server on :{PORT} root={ROOT}", flush=True)
        httpd.serve_forever()
