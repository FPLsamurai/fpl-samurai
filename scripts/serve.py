# -*- coding: utf-8 -*-
"""
ローカル確認用の簡易サーバー（public/ フォルダを配信します）

使い方:
  python3 scripts/serve.py
  → ブラウザで http://localhost:8000 を開く（Ctrl+C で停止）
"""

import functools
import http.server
import os
import socketserver

PORT = 8000
HERE = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.abspath(os.path.join(HERE, "..", "public"))

Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=PUBLIC_DIR)

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"サーバーを起動しました: http://localhost:{PORT}")
    print(f"配信フォルダ: {PUBLIC_DIR}")
    print("停止するには Ctrl+C を押してください")
    httpd.serve_forever()
