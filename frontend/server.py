#!/usr/bin/env python3
"""
Simple HTTP server that serves index.html for all routes (SPA support)
"""
import http.server
import socketserver
import os
from urllib.parse import unquote

PORT = 8080

class SPAHandler(http.server.SimpleHTTPRequestHandler):
    """Handler that serves index.html for all routes except static files"""

    def do_GET(self):
        # Decode the URL path
        path = unquote(self.path.split('?')[0])

        # Remove leading slash
        if path.startswith('/'):
            path = path[1:]

        # If no path, serve index.html
        if not path:
            path = 'index.html'

        # Check if file exists
        if os.path.isfile(path):
            # Serve the file (CSS, JS, images, etc.)
            return http.server.SimpleHTTPRequestHandler.do_GET(self)
        else:
            # Serve index.html for all other routes (SPA routing)
            self.path = '/index.html'
            return http.server.SimpleHTTPRequestHandler.do_GET(self)

    def end_headers(self):
        # Disable caching for development
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        http.server.SimpleHTTPRequestHandler.end_headers(self)

if __name__ == '__main__':
    with socketserver.TCPServer(("", PORT), SPAHandler) as httpd:
        print(f"🚀 Frontend server running at http://0.0.0.0:{PORT}")
        print(f"📂 Serving files from: {os.getcwd()}")
        print(f"🔄 SPA routing enabled - all routes serve index.html")
        print(f"🚫 Caching disabled for development")
        httpd.serve_forever()
