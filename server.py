import http.server
import socketserver
import os
import sys
import threading
import time

PORT = 8765
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
LAST_HEARTBEAT = time.time()
TIMEOUT_SECONDS = 30

class AeroHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_POST(self):
        global LAST_HEARTBEAT
        if self.path == '/api/ping':
            LAST_HEARTBEAT = time.time()
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'pong')
            return
        elif self.path == '/api/shutdown':
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'bye')
            def stop():
                time.sleep(0.3)
                os._exit(0)
            threading.Thread(target=stop).start()
            return
        super().do_POST()

    def do_GET(self):
        global LAST_HEARTBEAT
        if self.path == '/api/ping':
            LAST_HEARTBEAT = time.time()
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'pong')
            return
        super().do_GET()

def watchdog():
    time.sleep(8) # initial grace period to let browser connect
    while True:
        time.sleep(3)
        if time.time() - LAST_HEARTBEAT > TIMEOUT_SECONDS:
            print("No browser connected for > 15s. Shutting down server.")
            os._exit(0)

if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    threading.Thread(target=watchdog, daemon=True).start()
    with socketserver.TCPServer(("", PORT), AeroHandler) as httpd:
        print(f"AeroMetric server running on port {PORT} in {DIRECTORY}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
