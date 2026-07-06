"""YAM 桌面 UI 重新实现."""

from yam.ui.app import build_app
from nicegui import ui


def run(major_code: str, port: int = 8080) -> None:
    """启动 UI 服务."""
    build_app(major_code)
    ui.run(title=f"YAM {major_code}", port=port, reload=False, show=False)
