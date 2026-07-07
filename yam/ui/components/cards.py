"""通用卡片组件."""

from nicegui import ui

from yam.ui.theme import BG_CARD, BORDER, DANGER, PRIMARY, SUCCESS, TEXT_SECONDARY, WARNING


def kpi_card(title: str, value: str, subtitle: str = "", variant: str = "primary", icon: str = "") -> None:
    """KPI 数据卡片."""
    border_color = PRIMARY
    if variant == "warning":
        border_color = WARNING
    elif variant == "success":
        border_color = SUCCESS
    elif variant == "danger":
        border_color = DANGER

    with ui.element("div").classes("yam-kpi-card").style(f"border-left-color: {border_color};"):
        with ui.row().classes("items-center gap-sm q-mb-xs"):
            if icon:
                ui.icon(icon, size="18px").style(f"color: {border_color};")
            ui.label(title).classes("text-caption").style(f"color: {TEXT_SECONDARY};")
        ui.label(value).classes("text-h3 q-my-xs").style(f"color: {border_color}; font-weight: 700;")
        if subtitle:
            ui.label(subtitle).classes("text-caption").style(f"color: {TEXT_SECONDARY};")


def page_card() -> ui.element:
    """页面内容卡片容器."""
    return ui.element("div").classes("yam-card q-pa-md")


def anomaly_badge(text: str) -> None:
    """异常徽章."""
    ui.badge(text, color="warning").props("rounded")
