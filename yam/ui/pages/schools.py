"""院校库列表 — 全宽列表视图 + 内联展开."""

from typing import Any

from nicegui import ui

from yam.ui import router
from yam.ui.service import SchoolDataService
from yam.ui.theme import (
    BG_BODY, BORDER, PRIMARY, TEXT_SECONDARY, tag_color, score_color,
)

_expanded_schools: set[str] = set()


def build_schools_page(major_code: str, **kwargs: Any) -> None:
    """构建院校列表页面 — 全宽列表视图."""
    service = SchoolDataService(major_code)
    schools = service.search_schools(sort="name")

    with ui.column().classes("w-full"):
        # 院校数量
        ui.label(f"共 {len(schools)} 所院校").classes("text-caption q-mb-sm").style(f"color: {TEXT_SECONDARY};")

        # 院校列表
        for school in schools:
            _render_school_item(major_code, service, school)

    service.close()


def _render_school_item(major_code: str, service: SchoolDataService, school: dict[str, Any]) -> None:
    """渲染单个院校列表项 — 全宽，可展开."""
    sid = school["school_id"]
    is_expanded = sid in _expanded_schools

    with ui.element("div").classes(f"yam-school-item{' expanded' if is_expanded else ''}"):
        # 第一行：收藏 + 校名 + 对比复选框
        with ui.row().classes("items-center justify-between w-full"):
            with ui.row().classes("items-center gap-sm"):
                # 收藏按钮
                is_fav = service.is_favorite(sid)
                fav_btn = ui.button("❤️" if is_fav else "♡").props("flat dense round").style(
                    f"color: {'#E94560' if is_fav else '#CBD5E1'}; font-size: 18px;"
                )
                _setup_fav_toggle(fav_btn, service, sid)

                # 校名
                ui.label(school["name"]).classes("text-h6 text-weight-bold").style(f"color: {PRIMARY};")

                # 异常标记
                if school.get("has_issue"):
                    ui.badge("异常", color="warning").props("rounded")

            # 对比复选框
            ui.checkbox("", value=False).props("dense").style("color: #CBD5E1;")

        # 第二行：标签
        with ui.row().classes("gap-sm q-mt-sm"):
            level = school.get("level", "")
            if "985" in (level or ""):
                ui.html('<span class="yam-tag yam-tag-985">985</span>')
            elif "211" in (level or ""):
                ui.html('<span class="yam-tag yam-tag-211">211</span>')
            elif "一流" in (level or ""):
                ui.html('<span class="yam-tag yam-tag-double">双一流</span>')
            else:
                ui.html(f'<span class="yam-tag yam-tag-normal">{level or "普通"}</span>')
            ui.badge(school.get("province", "-"), color="grey-5").props("rounded")

        # 第三行：招生信息 + 分数线趋势
        with ui.row().classes("items-center gap-lg q-mt-sm"):
            yz = school.get("yanzhao_total", 0)
            zs = school.get("zskyy_total", 0)
            ui.label(f"研招网 {yz} 人").classes("text-body2")
            ui.label(f"掌上考研 {zs} 人").classes("text-body2")

            # 分数线趋势
            score_years = service.get_score_years(sid) if hasattr(service, 'get_score_years') else []
            if score_years:
                trend_parts = []
                for y in sorted(score_years)[-4:]:
                    sc = service.get_score_for_year(sid, y) if hasattr(service, 'get_score_for_year') else None
                    if sc:
                        trend_parts.append(f"{str(y)[-2:]}:{sc}")
                    else:
                        trend_parts.append(f"{str(y)[-2:]}:-")
                if trend_parts:
                    with ui.row().classes("items-center gap-xs"):
                        ui.label("分数线:").classes("text-caption").style(f"color: {TEXT_SECONDARY};")
                        for part in trend_parts:
                            ui.label(part).classes("text-caption")

        # 第四行：展开/收起按钮
        with ui.row().classes("w-full q-mt-sm"):
            expand_text = "收起 ▲" if is_expanded else "展开详情 ▼"
            ui.button(expand_text, on_click=lambda s=sid: _toggle_expand(s, major_code)).classes("yam-expand-btn")


def _toggle_expand(school_id: str, major_code: str) -> None:
    """切换院校展开状态."""
    if school_id in _expanded_schools:
        _expanded_schools.discard(school_id)
    else:
        _expanded_schools.add(school_id)
    # 刷新列表
    _refresh_list(major_code)


def _refresh_list(major_code: str) -> None:
    """刷新院校列表."""
    router.navigate_to(router.PAGE_SCHOOLS, major_code=major_code)


def _setup_fav_toggle(btn: ui.button, service: SchoolDataService, school_id: str) -> None:
    """设置收藏按钮切换."""
    def toggle():
        if service.is_favorite(school_id):
            service.remove_favorite(school_id)
            btn.set_text("♡")
            btn.style("color: #CBD5E1; font-size: 18px;")
        else:
            service.add_favorite(school_id)
            btn.set_text("❤️")
            btn.style("color: #E94560; font-size: 18px;")
    btn.on("click", toggle)
