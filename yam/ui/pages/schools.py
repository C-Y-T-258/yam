"""院校库列表 — 全宽列表视图 + 内联展开."""

from typing import Any

from nicegui import ui

from yam.ui import router
from yam.ui.service import SchoolDataService
from yam.ui.theme import (
    BG_BODY, BORDER, PRIMARY, TEXT_SECONDARY, WARNING, SUCCESS, DANGER,
    tag_color, score_color,
)

_expanded_schools: set[str] = set()


def build_schools_page(major_code: str, **kwargs: Any) -> None:
    """构建院校列表页面 — 全宽列表视图."""
    service = SchoolDataService(major_code)
    schools = service.search_schools(sort="name")

    with ui.column().classes("w-full"):
        ui.label(f"共 {len(schools)} 所院校").classes("text-caption q-mb-sm").style(f"color: {TEXT_SECONDARY};")

        for school in schools:
            _render_school_item(major_code, service, school)

    service.close()


def _render_school_item(major_code: str, service: SchoolDataService, school: dict[str, Any]) -> None:
    """渲染单个院校列表项 — 全宽，可展开."""
    sid = school["school_id"]
    is_expanded = sid in _expanded_schools
    summary = service.get_school_summary(sid)
    issues = summary.get("issues", [])
    yz = summary.get("yanzhao_2026", 0)
    zs = summary.get("zhangshangkaoyan_2026", 0)
    score_years = summary.get("score_years", [])

    # 获取各年份分数线
    scores_by_year = {}
    all_scores = service.get_score_lines(sid)
    for sc in all_scores:
        if sc["total"]:
            scores_by_year[sc["year"]] = sc["total"]

    with ui.element("div").classes(f"yam-school-item{' expanded' if is_expanded else ''}"):
        # 第1行：收藏 + 校名 + 标签 + 对比复选框
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

                # 标签
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

                # 专业代码
                ui.html(f'<span class="yam-tag yam-tag-code">{major_code}</span>')

            # 对比复选框
            ui.checkbox("对比", value=False).props("dense").style("color: #6B7280; font-size: 12px;")

        # 第2行：招生人数（分数显示）+ 学制
        with ui.row().classes("items-center gap-lg q-mt-sm"):
            with ui.row().classes("items-center gap-xs"):
                ui.label("招生").classes("text-body2").style(f"color: {TEXT_SECONDARY};")
                ui.label(f"{yz}人").classes("text-body2 text-weight-bold").style(f"color: {PRIMARY};")
                ui.label("/").classes("text-body2").style(f"color: {TEXT_SECONDARY};")
                zs_label = f"{zs}人"
                if zs != yz:
                    zs_label += "*"
                ui.label(zs_label).classes("text-body2 text-weight-bold").style(f"color: {PRIMARY};")

            ui.label("学制 3年").classes("text-body2").style(f"color: {TEXT_SECONDARY};")

        # 第3行：分数线趋势
        if scores_by_year:
            with ui.row().classes("items-center gap-xs q-mt-sm"):
                ui.label("分数线:").classes("text-caption").style(f"color: {TEXT_SECONDARY};")
                sorted_years = sorted(scores_by_year.keys())
                parts = []
                for i, y in enumerate(sorted_years):
                    sc = scores_by_year[y]
                    color = score_color(sc)
                    parts.append((str(y)[-2:], sc, color))
                for i, (year_short, sc, color) in enumerate(parts):
                    if i > 0:
                        ui.label("→").classes("text-caption").style(f"color: {TEXT_SECONDARY};")
                    ui.label(f"{year_short}: {sc}").classes("text-caption text-weight-bold").style(f"color: {color};")

        # 第4行：异常警告横幅
        if issues:
            with ui.element("div").style(
                f"background: #FFF3CD; border-left: 3px solid {WARNING}; padding: 8px 12px; "
                f"border-radius: 0 6px 6px 0; margin-top: 10px;"
            ):
                ui.label(f"⚠️ {issues[0][:60]}{'...' if len(issues[0]) > 60 else ''}").classes("text-caption").style(
                    f"color: #856404;"
                )

        # 第5行：展开/收起按钮
        with ui.row().classes("w-full q-mt-sm"):
            expand_text = "收起 ▲" if is_expanded else "展开详情 ▼"
            ui.button(expand_text, on_click=lambda s=sid: _toggle_expand(s, major_code)).classes("yam-expand-btn")

        # 展开内容
        if is_expanded:
            _render_expanded_content(service, sid, summary, scores_by_year, issues)


def _render_expanded_content(service: SchoolDataService, sid: str, summary: dict, scores_by_year: dict, issues: list) -> None:
    """渲染展开的详情内容."""
    ui.separator().style(f"margin: 12px 0; border-color: {BORDER};")

    # 基本信息
    ui.label("基本信息").classes("text-subtitle1 text-weight-bold q-mb-sm").style(
        f"color: {PRIMARY}; border-bottom: 2px solid {PRIMARY}; padding-bottom: 6px;"
    )
    departments = service.get_departments(sid)
    if departments:
        dept_names = "、".join(d["name"] for d in departments[:4])
        if len(departments) > 4:
            dept_names += "等"
        with ui.row().classes("q-mb-sm"):
            ui.label("院系所:").classes("text-caption text-weight-bold").style(f"color: {TEXT_SECONDARY};")
            ui.label(dept_names).classes("text-body2")

    ui.label("学制: 3年").classes("text-body2 q-mb-sm").style(f"color: {TEXT_SECONDARY};")

    # 历年分数线
    if scores_by_year:
        ui.label("历年分数线").classes("text-subtitle1 text-weight-bold q-mt-md q-mb-sm").style(
            f"color: {PRIMARY}; border-bottom: 2px solid {PRIMARY}; padding-bottom: 6px;"
        )
        all_scores = service.get_score_lines(sid)
        by_year = {}
        for sc in all_scores:
            by_year.setdefault(sc["year"], []).append(sc)

        for year in sorted(by_year.keys(), reverse=True):
            year_scores = by_year[year]
            ui.label(f"{year} 年").classes("text-body1 text-weight-bold q-mb-xs").style(f"color: {PRIMARY};")

            columns = [
                {"name": "dept", "label": "院系所", "field": "department_id", "align": "left"},
                {"name": "total", "label": "总分", "field": "total", "align": "right"},
                {"name": "politics", "label": "政治", "field": "politics", "align": "right"},
                {"name": "english", "label": "英语", "field": "english", "align": "right"},
                {"name": "special_one", "label": "专业课一", "field": "special_one", "align": "right"},
                {"name": "special_two", "label": "专业课二", "field": "special_two", "align": "right"},
            ]
            rows = []
            for sc in year_scores:
                rows.append({
                    "department_id": sc.get("department_id") or "-",
                    "total": sc.get("total") or "-",
                    "politics": sc.get("politics") or "-",
                    "english": sc.get("english") or "-",
                    "special_one": sc.get("special_one") or "-",
                    "special_two": sc.get("special_two") or "-",
                })
            ui.table(columns=columns, rows=rows, row_key="department_id").classes("w-full")

    # 考试科目
    if departments:
        ui.label("考试科目").classes("text-subtitle1 text-weight-bold q-mt-md q-mb-sm").style(
            f"color: {PRIMARY}; border-bottom: 2px solid {PRIMARY}; padding-bottom: 6px;"
        )
        all_exams = set()
        for d in departments:
            exam = d.get("exam_subjects", [])
            if isinstance(exam, list):
                all_exams.update(exam)
        if all_exams:
            with ui.row().classes("wrap gap-xs"):
                for exam in sorted(all_exams):
                    ui.html(f'<span class="yam-exam-tag">{exam}</span>')

    # 研究方向
    if departments:
        ui.label("研究方向").classes("text-subtitle1 text-weight-bold q-mt-md q-mb-sm").style(
            f"color: {PRIMARY}; border-bottom: 2px solid {PRIMARY}; padding-bottom: 6px;"
        )
        all_dirs = set()
        for d in departments:
            direction = d.get("research_direction", "")
            if direction:
                all_dirs.add(direction)
        if all_dirs:
            with ui.row().classes("wrap gap-xs"):
                for direction in sorted(all_dirs):
                    ui.html(f'<span class="yam-direction-tag">{direction}</span>')

    # 异常提醒
    if issues:
        ui.label("异常提醒").classes("text-subtitle1 text-weight-bold q-mt-md q-mb-sm").style(
            f"color: {WARNING}; border-bottom: 2px solid {WARNING}; padding-bottom: 6px;"
        )
        for issue in issues:
            with ui.element("div").style(
                f"background: #FFF3CD; border-left: 3px solid {WARNING}; padding: 8px 12px; "
                f"border-radius: 0 6px 6px 0; margin-bottom: 8px;"
            ):
                ui.label(issue).classes("text-body2").style("color: #856404;")


def _toggle_expand(school_id: str, major_code: str) -> None:
    """切换院校展开状态."""
    if school_id in _expanded_schools:
        _expanded_schools.discard(school_id)
    else:
        _expanded_schools.add(school_id)
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
