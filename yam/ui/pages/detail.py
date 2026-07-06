"""院校详情页."""

from nicegui import ui

from yam.ui import router
from yam.ui.components.cards import kpi_card
from yam.ui.service import SchoolDataService
from yam.ui.theme import BG_CARD, BORDER, DANGER, PRIMARY, SUCCESS, TEXT_SECONDARY, WARNING


def build_detail_page(major_code: str, school_id: str | None = None) -> None:
    """构建院校详情页."""
    if not school_id:
        ui.label("未选择院校").classes("text-h4 text-grey-6")
        ui.button("返回院校库", on_click=lambda: router.navigate_to(router.PAGE_SCHOOLS, major_code=major_code)).props("flat color=primary")
        return

    service = SchoolDataService(major_code)
    summary = service.get_school_summary(school_id)

    if not summary:
        ui.label("院校数据不存在").classes("text-h4 text-grey-6")
        service.close()
        return

    # 顶部：返回按钮 + 院校名称
    with ui.row().classes("items-center gap-sm q-mb-md"):
        ui.button("", on_click=lambda: router.navigate_to(router.PAGE_SCHOOLS, major_code=major_code)).props(
            "flat dense round icon=arrow_back"
        )
        ui.label(summary["name"]).classes("text-h4 text-weight-bold").style(f"color: {PRIMARY};")

    # 标签行
    with ui.row().classes("gap-sm q-mb-md"):
        if summary.get("province"):
            ui.badge(summary["province"], color="primary").props("rounded")
        if summary.get("level"):
            color = "primary" if "985" in (summary["level"] or "") else (
                "positive" if "211" in (summary["level"] or "") else (
                    "purple" if "一流" in (summary["level"] or "") else "grey"
                )
            )
            ui.badge(summary["level"], color=color).props("rounded")
        if summary.get("school_id"):
            ui.badge(summary["school_id"], color="grey").props("rounded")

    # KPI 概要
    with ui.row().classes("w-full gap-md q-mb-md"):
        with ui.column().classes("col"):
            kpi_card(
                "研招网 2026 招生",
                str(summary.get("yanzhao_2026", 0)),
                "人",
                variant="primary",
            )
        with ui.column().classes("col"):
            kpi_card(
                "掌上考研 2026 招生",
                str(summary.get("zhangshangkaoyan_2026", 0)),
                "人",
                variant="primary",
            )
        with ui.column().classes("col"):
            years = summary.get("score_years", [])
            kpi_card(
                "分数线年份",
                str(len(years)),
                ", ".join(str(y) for y in years) if years else "暂无",
                variant="success" if years else "warning",
            )
        with ui.column().classes("col"):
            issues = summary.get("issues", [])
            kpi_card(
                "异常提醒",
                str(len(issues)),
                "建议核实" if issues else "数据正常",
                variant="warning" if issues else "success",
            )

    # 收藏 + 导出按钮
    with ui.row().classes("gap-sm q-mb-md"):
        is_fav = summary.get("is_favorite", False)
        fav_btn = ui.button(
            "⭐ 取消收藏" if is_fav else "☆ 收藏",
            on_click=lambda: _toggle_favorite(service, school_id, fav_btn),
        ).props("outline color=primary" if not is_fav else "color=primary")

        ui.button("导出 CSV", on_click=lambda: _export_detail(service, school_id)).props("outline color=primary")

    # Tab 分组
    with ui.tabs().classes("w-full") as tabs:
        tab_info = ui.tab("基本信息")
        tab_scores = ui.tab("历年分数线")
        tab_plans = ui.tab("招生计划")
        tab_issues = ui.tab(f"异常提醒 ({len(issues)})" if issues else "异常提醒")

    with ui.tab_panels(tabs, value=tab_info).classes("w-full"):
        with ui.tab_panel(tab_info):
            _render_info_tab(service, school_id, summary)
        with ui.tab_panel(tab_scores):
            _render_scores_tab(service, school_id)
        with ui.tab_panel(tab_plans):
            _render_plans_tab(service, school_id)
        with ui.tab_panel(tab_issues):
            _render_issues_tab(service, school_id, issues)

    service.close()


def _render_info_tab(service: SchoolDataService, school_id: str, summary: dict) -> None:
    """渲染基本信息Tab."""
    departments = service.get_departments(school_id)

    if departments:
        ui.label("院系所及招生人数").classes("text-subtitle1 text-weight-bold q-mb-sm")

        columns = [
            {"name": "name", "label": "院系所", "field": "name", "align": "left"},
            {"name": "count", "label": "招生人数", "field": "enrollment_count", "align": "right"},
            {"name": "direction", "label": "研究方向", "field": "research_direction", "align": "left"},
            {"name": "exam", "label": "考试科目", "field": "exam_subjects", "align": "left"},
        ]
        rows = []
        for d in departments:
            exam = d.get("exam_subjects", [])
            if isinstance(exam, list):
                exam = " / ".join(str(e) for e in exam[:3])
            rows.append({
                "name": d["name"],
                "enrollment_count": d.get("enrollment_count") or "-",
                "research_direction": d.get("research_direction") or "-",
                "exam_subjects": exam or "-",
            })
        ui.table(columns=columns, rows=rows, row_key="name").classes("w-full")
    else:
        ui.label("暂无院系所数据").classes("text-body2 text-grey-6 q-pa-md")


def _render_scores_tab(service: SchoolDataService, school_id: str) -> None:
    """渲染历年分数线Tab."""
    scores = service.get_score_lines(school_id)

    if not scores:
        ui.label("暂无分数线数据").classes("text-body2 text-grey-6 q-pa-md")
        return

    # 按年份分组
    by_year: dict[int, list] = {}
    for s in scores:
        by_year.setdefault(s["year"], []).append(s)

    for year in sorted(by_year.keys(), reverse=True):
        year_scores = by_year[year]
        ui.label(f"{year} 年").classes("text-subtitle1 text-weight-bold q-mb-sm q-mt-md")

        columns = [
            {"name": "dept", "label": "院系", "field": "department_id", "align": "left"},
            {"name": "total", "label": "总分", "field": "total", "align": "right"},
            {"name": "politics", "label": "政治", "field": "politics", "align": "right"},
            {"name": "english", "label": "外语", "field": "english", "align": "right"},
            {"name": "special_one", "label": "业务课一", "field": "special_one", "align": "right"},
            {"name": "special_two", "label": "业务课二", "field": "special_two", "align": "right"},
            {"name": "note", "label": "备注", "field": "note", "align": "left"},
        ]
        rows = []
        for s in year_scores:
            rows.append({
                "department_id": s.get("department_id") or "-",
                "total": s.get("total") or "-",
                "politics": s.get("politics") or "-",
                "english": s.get("english") or "-",
                "special_one": s.get("special_one") or "-",
                "special_two": s.get("special_two") or "-",
                "note": s.get("note") or "",
            })
        ui.table(columns=columns, rows=rows, row_key="department_id").classes("w-full")


def _render_plans_tab(service: SchoolDataService, school_id: str) -> None:
    """渲染招生计划Tab."""
    plans = service.get_admission_plans(school_id)

    if not plans:
        ui.label("暂无招生计划数据").classes("text-body2 text-grey-6 q-pa-md")
        return

    # 按年份分组
    by_year: dict[int, list] = {}
    for p in plans:
        by_year.setdefault(p["year"], []).append(p)

    for year in sorted(by_year.keys(), reverse=True):
        year_plans = by_year[year]
        ui.label(f"{year} 年").classes("text-subtitle1 text-weight-bold q-mb-sm q-mt-md")

        columns = [
            {"name": "dept", "label": "院系", "field": "department_name", "align": "left"},
            {"name": "count", "label": "招生人数", "field": "enrollment_count", "align": "right"},
            {"name": "direction", "label": "研究方向", "field": "research_direction", "align": "left"},
            {"name": "exam", "label": "考试科目", "field": "exam_subjects", "align": "left"},
            {"name": "note", "label": "备注", "field": "note", "align": "left"},
        ]
        rows = []
        for p in year_plans:
            exam = p.get("exam_subjects", [])
            if isinstance(exam, list):
                exam = " / ".join(str(e) for e in exam[:3])
            rows.append({
                "department_name": p.get("department_name") or "-",
                "enrollment_count": p.get("enrollment_count") or "-",
                "research_direction": p.get("research_direction") or "-",
                "exam_subjects": exam or "-",
                "note": p.get("note") or "",
            })
        ui.table(columns=columns, rows=rows, row_key="department_name").classes("w-full")


def _render_issues_tab(service: SchoolDataService, school_id: str, issues: list) -> None:
    """渲染异常提醒Tab."""
    if not issues:
        with ui.column().classes("items-center q-pa-lg"):
            ui.label("✅").classes("text-h3")
            ui.label("数据正常，无异常提醒").classes("text-body1 text-grey-6")
        return

    ui.label(f"共 {len(issues)} 条异常").classes("text-subtitle1 text-weight-bold q-mb-sm")
    for issue in issues:
        with ui.element("div").classes("yam-card q-pa-sm q-mb-sm").style(
            f"border-left: 3px solid {WARNING};"
        ):
            ui.label(issue).classes("text-body2")


def _toggle_favorite(service: SchoolDataService, school_id: str, btn: ui.button) -> None:
    """切换收藏状态."""
    if service.is_favorite(school_id):
        service.remove_favorite(school_id)
        btn.set_text("☆ 收藏")
        btn.props("outline color=primary")
        ui.notify("已取消收藏", type="info")
    else:
        service.add_favorite(school_id)
        btn.set_text("⭐ 取消收藏")
        btn.props("color=primary")
        ui.notify("已收藏", type="positive")
    service.close()


def _export_detail(service: SchoolDataService, school_id: str) -> None:
    """导出院校详情CSV."""
    csv_text = service.export_csv(school_ids=[school_id])
    ui.download(csv_text.encode("utf-8-sig"), f"{school_id}_详情.csv")
    service.close()
