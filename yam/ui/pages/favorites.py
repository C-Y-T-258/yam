"""我的收藏."""

from nicegui import ui

from yam.ui.theme import PRIMARY


def build_favorites_page(major_code: str) -> None:
    """构建收藏页."""
    ui.label("我的收藏").classes("text-h4").style(f"color: {PRIMARY};")
    ui.label("这里将展示关注的院校列表。").classes("text-body1 text-grey-7")
