"""首页数据看板."""

from nicegui import ui

from yam.ui import router
from yam.ui.components.cards import kpi_card
from yam.ui.service import SchoolDataService
from yam.ui.theme import BG_CARD, BORDER, DANGER, PRIMARY, SUCCESS, TEXT_SECONDARY, WARNING


def _fmt_number(n: int) -> str:
    return f"{n}"


def build_dashboard_page(major_code: str) -> None:
    """构建首页看板."""
    service = SchoolDataService(major_code)
    stats = service.get_dashboard_stats()
    recent = service.list_recent_views(limit=5)
    anomalies = service.get_anomalies()[:5]

    ui.label("首页看板").classes("text-h4 q-mb-md").style(f"color: {PRIMARY};")

    # KPI 卡片
    with ui.row().classes("w-full gap-md q-mb-md"):
        with ui.column().classes("col"):
            kpi_card(
                "收录院校总数",
                _fmt_number(stats["total_schools"]),
                f"最后更新: {stats['last_update']}",
                variant="primary",
            )
        with ui.column().classes("col"):
            kpi_card(
                "数据正常院校",
                _fmt_number(stats["normal_schools"]),
                "两站数据口径一致",
                variant="success",
            )
        with ui.column().classes("col"):
            kpi_card(
                "异常提醒院校",
                _fmt_number(stats["anomaly_schools"]),
                "建议到官网核实",
                variant="warning",
            )
        with ui.column().classes("col"):
            kpi_card(
                "我的收藏",
                _fmt_number(stats["favorite_count"]),
                "已关注院校",
                variant="primary",
            )

    # 快捷入口
    with ui.element("div").classes("yam-card q-pa-md q-mb-md"):
        ui.label("快捷入口").classes("text-subtitle1 text-weight-bold q-mb-sm")
        with ui.row().classes("gap-sm"):
            ui.button("🏫 院校库", on_click=lambda: router.navigate_to(router.PAGE_SCHOOLS, major_code=major_code)).props("color=primary")
            ui.button("⚠️ 异常数据", on_click=lambda: router.navigate_to(router.PAGE_SCHOOLS, major_code=major_code, has_anomaly=True)).props("color=warning")
            ui.button("⭐ 我的收藏", on_click=lambda: router.navigate_to(router.PAGE_FAVORITES, major_code=major_code)).props("color=secondary")
            ui.button("⚖️ 数据对比", on_click=lambda: router.navigate_to(router.PAGE_COMPARE, major_code=major_code)).props("color=primary")

    # 数据质量看板
    quality = service.get_data_quality_stats()
    if quality["total"] > 0:
        with ui.element("div").classes("yam-card q-pa-md q-mb-md"):
            ui.label("数据质量概览").classes("text-subtitle1 text-weight-bold q-mb-sm")
            with ui.row().classes("w-full gap-md"):
                # 分数线覆盖率
                for year in [2026, 2025, 2024, 2023]:
                    count = quality["score_coverage"].get(year, 0)
                    pct = int(count / quality["total"] * 100) if quality["total"] > 0 else 0
                    color = SUCCESS if pct >= 80 else (WARNING if pct >= 50 else DANGER)
                    with ui.column().classes("items-center"):
                        ui.label(f"{year}").classes("text-caption text-weight-bold")
                        ui.label(f"{count}/{quality['total']}").classes("text-body2")
                        ui.linear_progress(value=pct / 100, show_value=False).style(f"width: 80px; height: 6px; color: {color};")
                        ui.label(f"{pct}%").classes("text-caption").style(f"color: {color};")

                # 招生计划
                plan_pct = int(quality["plan_coverage"] / quality["total"] * 100) if quality["total"] > 0 else 0
                with ui.column().classes("items-center"):
                    ui.label("招生计划").classes("text-caption text-weight-bold")
                    ui.label(f"{quality['plan_coverage']}/{quality['total']}").classes("text-body2")
                    ui.linear_progress(value=plan_pct / 100, show_value=False).style("width: 80px; height: 6px;")
                    ui.label(f"{plan_pct}%").classes("text-caption")

                # 院系所
                dept_pct = int(quality["dept_coverage"] / quality["total"] * 100) if quality["total"] > 0 else 0
                with ui.column().classes("items-center"):
                    ui.label("院系所").classes("text-caption text-weight-bold")
                    ui.label(f"{quality['dept_coverage']}/{quality['total']}").classes("text-body2")
                    ui.linear_progress(value=dept_pct / 100, show_value=False).style("width: 80px; height: 6px;")
                    ui.label(f"{dept_pct}%").classes("text-caption")

    # 最近查看 + 异常概览
    with ui.row().classes("w-full gap-md"):
        # 最近查看
        with ui.column().classes("col-5"):
            with ui.element("div").classes("yam-card q-pa-md").style("height: 320px;"):
                ui.label("最近查看").classes("text-subtitle1 text-weight-bold q-mb-sm")
                if recent:
                    for school in recent:
                        with ui.row().classes("items-center justify-between q-py-xs").style(
                            f"border-bottom: 1px solid {BORDER};"
                        ):
                            with ui.row().classes("items-center gap-sm"):
                                ui.label(school["name"]).classes("text-body2 text-weight-medium")
                                if school["has_issue"]:
                                    ui.badge("异常", color="warning").props("rounded")
                            ui.button("查看", on_click=lambda sid=school["school_id"]: _go_detail(major_code, sid)).props("flat dense color=primary")
                else:
                    ui.label("暂无最近查看记录").classes("text-body2 text-grey-6")

        # 异常概览
        with ui.column().classes("col"):
            with ui.element("div").classes("yam-card q-pa-md").style("height: 320px; overflow: auto;"):
                ui.label("异常数据概览").classes("text-subtitle1 text-weight-bold q-mb-sm")
                if anomalies:
                    columns = [
                        {"name": "name", "label": "院校", "field": "name", "align": "left"},
                        {"name": "message", "label": "异常说明", "field": "message", "align": "left"},
                        {"name": "action", "label": "操作", "field": "action", "align": "center"},
                    ]
                    rows = []
                    for a in anomalies:
                        school = service.get_school(a["school_id"])
                        rows.append(
                            {
                                "name": school["name"] if school else a["school_id"],
                                "message": a["message"],
                                "action": "",
                            }
                        )
                    ui.table(columns=columns, rows=rows, row_key="name").classes("w-full")
                else:
                    ui.label("暂无异常数据").classes("text-body2 text-grey-6")

    service.close()


def _go_detail(major_code: str, school_id: str) -> None:
    router.set_state("school_id", school_id)
    router.navigate_to(router.PAGE_DETAIL, major_code=major_code, school_id=school_id)
