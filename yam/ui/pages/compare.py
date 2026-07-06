"""院校对比."""

from nicegui import ui

from yam.ui.theme import PRIMARY


def build_compare_page(major_code: str) -> None:
    """构建对比页."""
    ui.label(f"{major_code} 院校对比").classes("text-h4").style(f"color: {PRIMARY};")
    ui.label("这里将展示 2-3 所院校并排对比。").classes("text-body1 text-grey-7")
