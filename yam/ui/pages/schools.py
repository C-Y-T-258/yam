"""院校库列表."""

from collections.abc import Callable
from typing import Any

from nicegui import ui

from yam.ui import router
from yam.ui.service import SchoolDataService
from yam.ui.theme import BG_CARD, BORDER, PRIMARY, TEXT_SECONDARY, WARNING

_VIEW_CARD = "card"
_VIEW_TABLE = "table"

_ANOMALY_ALL = "all"
_ANOMALY_ANOMALY = "anomaly"
_ANOMALY_NORMAL = "normal"

_filter_state = {
    "keyword": "",
    "provinces": [],
    "levels": [],
    "min_plan": None,
    "max_plan": None,
    "has_anomaly": _ANOMALY_ALL,
    "sort": "name",
}

_view_state = {"view": _VIEW_CARD}


_sort_options = {
    "name": "按名称",
    "yanzhao_total": "按研招网招生人数",
    "zskyy_total": "按掌上考研招生人数",
    "province": "按省份",
}


def build_schools_page(major_code: str, has_anomaly: bool | None = None) -> None:
    """构建院校库页面."""
    service = SchoolDataService(major_code)
    options = service.get_filter_options()

    if has_anomaly is not None:
        _filter_state["has_anomaly"] = has_anomaly

    ui.label("院校库").classes("text-h4 q-mb-md").style(f"color: {PRIMARY};")

    result_container = ui.element("div").classes("w-full")

    def refresh() -> None:
        result_container.clear()
        anomaly_value = _filter_state["has_anomaly"]
        has_anomaly: bool | None = None
        if anomaly_value == _ANOMALY_ANOMALY:
            has_anomaly = True
        elif anomaly_value == _ANOMALY_NORMAL:
            has_anomaly = False
        schools = service.search_schools(
            keyword=_filter_state["keyword"],
            provinces=_filter_state["provinces"] or None,
            levels=_filter_state["levels"] or None,
            min_plan=_filter_state["min_plan"],
            max_plan=_filter_state["max_plan"],
            has_anomaly=has_anomaly,
            sort=_filter_state["sort"],
        )
        with result_container:
            _render_results(major_code, service, schools)

    # 筛选面板
    with ui.element("div").classes("yam-card q-pa-md q-mb-md"):
        with ui.row().classes("items-end wrap gap-md"):
            ui.input(
                label="搜索院校",
                placeholder="输入院校名称...",
                value=_filter_state["keyword"],
            ).props("clearable debounce='300'").classes("col-grow").on(
                "update:model-value", lambda e: _update_filter("keyword", e.value, refresh)
            )
            ui.select(
                options=options["provinces"],
                label="省份",
                multiple=True,
                value=_filter_state["provinces"],
            ).props("use-chips clearable").classes("col").on(
                "update:model-value", lambda e: _update_filter("provinces", e.value or [], refresh)
            )
            ui.select(
                options=options["levels"],
                label="学校层次",
                multiple=True,
                value=_filter_state["levels"],
            ).props("use-chips clearable").classes("col").on(
                "update:model-value", lambda e: _update_filter("levels", e.value or [], refresh)
            )
        with ui.row().classes("items-end wrap gap-md q-mt-md"):
            ui.number(
                label="最小招生人数",
                min=0,
                value=_filter_state["min_plan"],
            ).props("clearable").classes("col").on(
                "update:model-value", lambda e: _update_filter("min_plan", e.value, refresh)
            )
            ui.number(
                label="最大招生人数",
                min=0,
                value=_filter_state["max_plan"],
            ).props("clearable").classes("col").on(
                "update:model-value", lambda e: _update_filter("max_plan", e.value, refresh)
            )
            ui.select(
                options=[_ANOMALY_ALL, _ANOMALY_ANOMALY, _ANOMALY_NORMAL],
                label="数据状态",
                value=_filter_state["has_anomaly"],
            ).classes("col").on(
                "update:model-value", lambda e: _update_filter("has_anomaly", e.value, refresh)
            )
            ui.select(
                options=list(_sort_options.keys()),
                label="排序",
                value=_filter_state["sort"],
            ).classes("col").on(
                "update:model-value", lambda e: _update_filter("sort", e.value, refresh)
            )

    # 视图切换与操作栏
    with ui.row().classes("items-center justify-between q-mb-md"):
        with ui.row().classes("gap-sm"):
            ui.button("卡片视图", on_click=lambda: _set_view(_VIEW_CARD, refresh)).props(
                "flat" if _view_state["view"] != _VIEW_CARD else "color=primary"
            )
            ui.button("表格视图", on_click=lambda: _set_view(_VIEW_TABLE, refresh)).props(
                "flat" if _view_state["view"] != _VIEW_TABLE else "color=primary"
            )
        ui.button("导出当前列表", on_click=lambda: _export_list(service)).props("flat color=primary")

    refresh()


def _update_filter(key: str, value: Any, refresh: callable) -> None:
    _filter_state[key] = value
    refresh()


def _set_view(view: str, refresh: callable) -> None:
    _view_state["view"] = view
    refresh()


def _render_results(major_code: str, service: SchoolDataService, schools: list[dict[str, Any]]) -> None:
    if not schools:
        ui.label("未找到符合条件的院校").classes("text-body1 text-grey-6 q-pa-md")
        return

    ui.label(f"共 {len(schools)} 所院校").classes("text-caption text-grey-6 q-mb-sm")

    if _view_state["view"] == _VIEW_CARD:
        with ui.row().classes("w-full wrap gap-md"):
            for school in schools:
                _school_card(major_code, service, school)
    else:
        _school_table(major_code, service, schools)


def _school_card(major_code: str, service: SchoolDataService, school: dict[str, Any]) -> None:
    with ui.element("div").classes("yam-card q-pa-md").style("width: 280px;"):
        with ui.row().classes("items-center justify-between q-mb-sm"):
            ui.label(school["name"]).classes("text-subtitle1 text-weight-bold").style(f"color: {PRIMARY};")
            if school["has_issue"]:
                ui.badge("异常", color="warning").props("rounded")
        with ui.row().classes("gap-sm q-mb-sm"):
            ui.badge(school["province"] or "未知", color="primary").props("rounded")
            ui.badge(school["level"] or "未知", color="secondary").props("rounded")
        ui.label(f"研招网 2026: {school['yanzhao_total']} 人").classes("text-body2")
        ui.label(f"掌上考研 2026: {school['zskyy_total']} 人").classes("text-body2")
        with ui.row().classes("justify-end gap-sm q-mt-md"):
            _favorite_button(service, school["school_id"])
            ui.button("对比", on_click=lambda sid=school["school_id"]: _add_compare(sid)).props("flat dense color=primary")
            ui.button("详情", on_click=lambda sid=school["school_id"]: _go_detail(major_code, sid)).props("dense color=primary")


def _school_table(major_code: str, service: SchoolDataService, schools: list[dict[str, Any]]) -> None:
    columns = [
        {"name": "name", "label": "院校", "field": "name", "align": "left", "sortable": False},
        {"name": "province", "label": "省份", "field": "province", "align": "center"},
        {"name": "level", "label": "层次", "field": "level", "align": "center"},
        {"name": "yanzhao_total", "label": "研招网 2026", "field": "yanzhao_total", "align": "right"},
        {"name": "zskyy_total", "label": "掌上考研 2026", "field": "zskyy_total", "align": "right"},
        {"name": "status", "label": "状态", "field": "status", "align": "center"},
        {"name": "action", "label": "操作", "field": "action", "align": "center"},
    ]
    rows = []
    for s in schools:
        rows.append(
            {
                **s,
                "status": "异常" if s["has_issue"] else "正常",
            }
        )
    ui.table(columns=columns, rows=rows, row_key="school_id").classes("w-full")


def _favorite_button(service: SchoolDataService, school_id: str) -> None:
    is_fav = service.is_favorite(school_id)
    btn = ui.button("⭐" if is_fav else "☆").props("flat dense round")

    def toggle():
        if service.is_favorite(school_id):
            service.remove_favorite(school_id)
            btn.set_text("☆")
        else:
            service.add_favorite(school_id)
            btn.set_text("⭐")

    btn.on("click", toggle)


def _add_compare(school_id: str) -> None:
    compare_ids = router.get_state().get("compare_ids", [])
    if school_id in compare_ids:
        ui.notify("已在对比列表中", type="info")
        return
    if len(compare_ids) >= 3:
        ui.notify("最多对比 3 所院校", type="warning")
        return
    compare_ids.append(school_id)
    router.set_state("compare_ids", compare_ids)
    ui.notify("已加入对比", type="positive")


def _go_detail(major_code: str, school_id: str) -> None:
    service = SchoolDataService(major_code)
    service.add_recent_view(school_id)
    service.close()
    router.set_state("school_id", school_id)
    router.navigate_to(router.PAGE_DETAIL, major_code=major_code, school_id=school_id)


def _export_list(service: SchoolDataService) -> None:
    csv_text = service.export_csv()
    ui.download(csv_text.encode("utf-8-sig"), "院校列表.csv")
