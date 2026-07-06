"""UI 独立入口.

NiceGUI 在响应页面请求时会重新执行入口脚本。如果入口脚本是 cli.py，
会再次触发 Typer 命令解析并导致进程退出。因此 UI 使用独立入口。
"""

import sys

from yam.ui import run


if __name__ == "__main__":
    major = sys.argv[1] if len(sys.argv) > 1 else None
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8080
    run(major, port)
