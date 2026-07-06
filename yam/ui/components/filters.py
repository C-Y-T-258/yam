"""筛选与排序组件."""

from nicegui import ui

from yam.ui.theme import BG_CARD, BORDER


def filter_panel(
    provinces: list[str],
    levels: list[str],
    on_search: callable,
    on_filter_change: callable,
) -> None:
    """筛选面板."""
    with ui.element("div").classes("yam-card q-pa-md q-mb-md"):
        with ui.row().classes("items-center wrap gap-md"):
            ui.input(label="搜索院校", placeholder="输入院校名称...").props("clearable").on(
                "blur", lambda e: on_search(e.value)
            ).classes("col-grow")
            ui.select(
                options=provinces,
                label="省份",
                multiple=True,
                clearable=True,
            ).props("use-chips").on("update:model-value", lambda e: on_filter_change("provinces", e.value))
            ui.select(
                options=levels,
                label="学校层次",
                multiple=True,
                clearable=True,
            ).props("use-chips").on("update:model-value", lambda e: on_filter_change("levels", e.value))
