"""院校对比 — 模态弹窗."""

from typing import Any

from nicegui import ui

from yam.ui.service import SchoolDataService
from yam.ui.theme import BG_CARD, BORDER, DANGER, PRIMARY, SUCCESS, TEXT_SECONDARY, WARNING


def show_compare_dialog(major_code: str, compare_ids: list[str]) -> None:
    """显示对比弹窗."""
    if not compare_ids:
        ui.notify("请先选择要对比的院校", type="warning")
        return

    service = SchoolDataService(major_code)
    summaries = []
    for sid in compare_ids:
        s = service.get_school_summary(sid)
        if s:
            summaries.append(s)
    service.close()

    if not summaries:
        ui.notify("对比数据为空", type="warning")
        return

    with ui.dialog() as dialog, ui.card().style("width: 900px; max-height: 80vh; padding: 0;"):
        # 标题栏
        with ui.row().classes("items-center justify-between q-pa-md").style(
            f"border-bottom: 1px solid {BORDER};"
        ):
            ui.label(f"院校对比 ({len(summaries)}/3)").classes("text-h6 text-weight-bold").style(
                f"color: {PRIMARY};"
            )
            ui.button("", on_click=dialog.close).props("flat dense round icon=close")

        # 对比表格内容
        with ui.element("div").style("padding: 16px; overflow-y: auto; max-height: 60vh;"):
            _render_comparison_table(summaries)

        # 底部按钮
        with ui.row().classes("items-center justify-between q-pa-md").style(
            f"border-top: 1px solid {BORDER};"
        ):
            ui.label("* 表示掌上考研数据").classes("text-caption").style(f"color: {TEXT_SECONDARY};")
            with ui.row().classes("gap-sm"):
                ui.button("取消", on_click=dialog.close).props("flat")
                ui.button("导出对比结果", on_click=lambda: _export(summaries)).props("color=primary")

    dialog.open()


def _render_comparison_table(summaries: list[dict]) -> None:
    """渲染对比表格."""
    # 构建对比行
    rows = [
        {"field": "层次", "label": "层次"},
        {"field": "地区", "label": "地区"},
        {"field": "研招网2026", "label": "招生人数(2026)"},
        {"field": "掌上考研2026", "label": ""},
        {"field": "学制", "label": "学制"},
        {"field": "2026分数线", "label": "2026分数线(总分)"},
        {"field": "异常", "label": "数据状态"},
    ]

    # 构建列
    columns = [{"name": "field", "label": "对比项", "field": "field", "align": "left"}]
    for i, s in enumerate(summaries):
        columns.append({
            "name": f"s{i}",
            "label": f"{s['name']} [{s.get('level', '')}] {s.get('province', '')}",
            "field": f"s{i}",
            "align": "center",
        })

    # 构建数据行
    table_rows = []
    for row in rows:
        if not row["label"]:
            continue  # 跳过掌上考研行（合并到研招网行）
        r = {"field": row["label"]}
        values = []
        for i, s in enumerate(summaries):
            val = _get_field(s, row["field"])
            r[f"s{i}"] = val
            values.append(val)

        # 高亮差异
        unique = set(str(v) for v in values)
        if len(unique) > 1 and row["field"] not in ("地区",):
            r["_classes"] = "yam-highlight-row"

        table_rows.append(r)

    # 渲染表格
    ui.table(columns=columns, rows=table_rows, row_key="field").classes("w-full")

    # 分数线趋势
    ui.label("分数线趋势(总分)").classes("text-subtitle1 text-weight-bold q-mt-md q-mb-sm").style(
        f"color: {PRIMARY};"
    )
    _render_score_trend(summaries)


def _render_score_trend(summaries: list[dict]) -> None:
    """渲染分数线趋势对比."""
    all_years = set()
    for s in summaries:
        for y in s.get("score_years", []):
            all_years.add(y)
    years = sorted(all_years)

    if not years:
        ui.label("暂无分数线数据").classes("text-body2 text-grey-6")
        return

    columns = [{"name": "year", "label": "年份", "field": "year", "align": "center"}]
    for i, s in enumerate(summaries):
        columns.append({
            "name": f"s{i}",
            "label": s["name"],
            "field": f"s{i}",
            "align": "center",
        })

    rows = []
    for y in years:
        r = {"year": str(y)}
        values = []
        for i, s in enumerate(summaries):
            # 检查该年份是否有分数线数据
            val = "有数据" if y in s.get("score_years", []) else "暂无"
            r[f"s{i}"] = val
            values.append(val)
        unique = set(values)
        if len(unique) > 1:
            r["_classes"] = "yam-highlight-row"
        rows.append(r)

    ui.table(columns=columns, rows=rows, row_key="year").classes("w-full")


def _get_field(school: dict, field: str) -> str:
    """获取对比字段值."""
    if field == "层次":
        return school.get("level", "-")
    if field == "地区":
        return school.get("province", "-")
    if field == "研招网2026":
        return str(school.get("yanzhao_2026", 0)) + " 人"
    if field == "掌上考研2026":
        return str(school.get("zhangshangkaoyan_2026", 0)) + " 人"
    if field == "学制":
        return "3年"
    if field == "2026分数线":
        years = school.get("score_years", [])
        return "有数据" if 2026 in years else "暂无"
    if field == "异常":
        issues = school.get("issues", [])
        if issues:
            return f"⚠️ {issues[0][:30]}..."
        return "✅ 数据一致"
    return "-"


def _export(summaries: list[dict]) -> None:
    """导出对比结果."""
    ui.notify("导出功能待实现", type="info")
