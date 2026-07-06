"""院校详情."""

from nicegui import ui

from yam.ui.theme import PRIMARY


def build_detail_page(major_code: str, school_id: str | None = None) -> None:
    """构建院校详情."""
    ui.label(f"院校详情 - {school_id or '未选择'}").classes("text-h4").style(f"color: {PRIMARY};")
    ui.label("这里将展示顶部摘要和 Tab 分组信息。").classes("text-body1 text-grey-7")
