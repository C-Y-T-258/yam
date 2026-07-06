"""院校对比页."""

from nicegui import ui

from yam.ui import router
from yam.ui.service import SchoolDataService
from yam.ui.theme import DANGER, PRIMARY, SUCCESS, TEXT_SECONDARY, WARNING


def build_compare_page(major_code: str) -> None:
    """构建对比页."""
    ui.label("数据对比").classes("text-h4 q-mb-md").style(f"color: {PRIMARY};")

    compare_ids = router.get_state().get("compare_ids", [])

    if not compare_ids:
        _render_empty()
        return

    service = SchoolDataService(major_code)

    # 操作栏
    with ui.row().classes("items-center justify-between q-mb-md"):
        ui.label(f"对比 {len(compare_ids)} 所院校").classes("text-subtitle1 text-weight-medium")
        with ui.row().classes("gap-sm"):
            ui.button("导出对比", on_click=lambda: _export(service, compare_ids)).props("outline color=primary")
            ui.button("清空对比", on_click=lambda: _clear(service)).props("outline color=negative")

    # 对比表格
    summaries = []
    for sid in compare_ids:
        s = service.get_school_summary(sid)
        if s:
            summaries.append(s)

    if not summaries:
        ui.label("对比数据为空").classes("text-body2 text-grey-6")
        service.close()
        return

    # 属性行 × 院校列
    _render_comparison_table(summaries)

    service.close()


def _render_empty() -> None:
    """渲染空状态."""
    with ui.column().classes("items-center q-pa-lg"):
        ui.label("⚖️").classes("text-h3")
        ui.label("暂无对比数据").classes("text-body1 text-grey-6 q-mb-sm")
        ui.label("在院校库中点击「对比」按钮添加院校").classes("text-caption text-grey-5")
        ui.button(
            "去院校库",
            on_click=lambda: router.navigate_to(router.PAGE_SCHOOLS, major_code=router.get_state().get("major_code", "")),
        ).props("color=primary")


def _render_comparison_table(summaries: list[dict]) -> None:
    """渲染对比表格."""
    # 收集所有年份
    all_years = set()
    for s in summaries:
        for y in s.get("score_years", []):
            all_years.add(y)
    score_years = sorted(all_years, reverse=True)

    # 构建行数据
    rows = [
        {"field": "学校代码", "label": "学校代码"},
        {"field": "省份", "label": "省份"},
        {"field": "层次", "label": "层次"},
        {"field": "研招网 2026 招生", "label": "研招网 2026 招生"},
        {"field": "掌上考研 2026 招生", "label": "掌上考研 2026 招生"},
    ]
    for y in score_years:
        rows.append({"field": f"score_{y}", "label": f"{y} 分数线"})

    rows.append({"field": "异常", "label": "异常提醒"})

    # 构建列
    columns = [{"name": "field", "label": "对比项", "field": "field", "align": "left"}]
    for i, s in enumerate(summaries):
        columns.append({
            "name": f"school_{i}",
            "label": s["name"],
            "field": f"school_{i}",
            "align": "center",
        })

    # 构建数据行
    table_rows = []
    for row in rows:
        r = {"field": row["label"]}
        values = []
        for s in summaries:
            val = _get_field(s, row["field"])
            r[f"school_{summaries.index(s)}"] = val
            values.append(val)

        # 高亮差异
        if row["field"] not in ("学校代码", "省份", "层次", "异常"):
            unique = set(str(v) for v in values)
            if len(unique) > 1:
                r["_highlight"] = True

        table_rows.append(r)

    # 渲染表格
    ui.table(columns=columns, rows=table_rows, row_key="field").classes("w-full")

    # 差异高亮说明
    ui.label("差异项以黄色背景标记").classes("text-caption text-grey-5 q-mt-sm")


def _get_field(school: dict, field: str) -> str:
    """获取对比字段值."""
    if field == "学校代码":
        return school.get("school_id", "-")
    if field == "省份":
        return school.get("province", "-")
    if field == "层次":
        return school.get("level", "-")
    if field == "研招网 2026 招生":
        return str(school.get("yanzhao_2026", 0))
    if field == "掌上考研 2026 招生":
        return str(school.get("zhangshangkaoyan_2026", 0))
    if field.startswith("score_"):
        year = int(field.split("_")[1])
        # 简化：显示是否有该年数据
        years = school.get("score_years", [])
        return "有数据" if year in years else "暂无"
    if field == "异常":
        issues = school.get("issues", [])
        return f"{len(issues)} 条" if issues else "无"
    return "-"


def _export(service: SchoolDataService, compare_ids: list[str]) -> None:
    """导出对比CSV."""
    csv_text = service.export_csv(school_ids=compare_ids, format="compare")
    ui.download(csv_text.encode("utf-8-sig"), "院校对比.csv")


def _clear(service: SchoolDataService) -> None:
    """清空对比列表."""
    router.set_state("compare_ids", [])
    ui.notify("已清空对比列表", type="info")
    router.navigate_to(router.PAGE_COMPARE, major_code=service.major_code)
