"""YAM 桌面 UI 重新实现."""

from yam.ui.app import build_app
from nicegui import ui


def run(major_code: str | None = None, port: int = 8080) -> None:
    """启动 UI 服务.

    Args:
        major_code: 专业代码。为None时显示启动画面选择专业。
        port: 端口号。
    """
    build_app(major_code)
    ui.run(title="研喵 YAM", port=port, reload=False, show=False)
