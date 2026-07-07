"""数据来源说明."""

from nicegui import ui

from yam.ui.service import SchoolDataService
from yam.ui.theme import PRIMARY, TEXT_SECONDARY


def build_about_page(major_code: str) -> None:
    """构建数据说明页."""
    ui.label("数据说明").classes("text-h4 q-mb-md").style(f"color: {PRIMARY};")

    # 获取数据更新时间
    service = SchoolDataService(major_code)
    stats = service.get_dashboard_stats()
    last_update = stats.get("last_update", "-")
    total_schools = stats.get("total_schools", 0)
    service.close()

    # 项目简介
    with ui.element("div").classes("yam-card q-pa-md q-mb-md"):
        ui.label("研喵 YAM").classes("text-h5 text-weight-bold q-mb-sm").style(f"color: {PRIMARY};")
        ui.label("本地优先的考研择校数据工具").classes("text-body1 q-mb-sm")
        with ui.row().classes("gap-md items-center"):
            ui.label("版本: 1.0.0").classes("text-caption").style(f"color: {TEXT_SECONDARY};")
            ui.badge(f"收录 {total_schools} 所院校", color="primary").props("rounded")
            ui.badge(f"更新: {last_update}", color="grey-5").props("rounded")

    # 数据来源
    with ui.element("div").classes("yam-card q-pa-md q-mb-md"):
        ui.label("数据来源").classes("text-subtitle1 text-weight-bold q-mb-sm").style(f"color: {PRIMARY};")
        with ui.row().classes("gap-md"):
            with ui.column().classes("col"):
                ui.label("研招网").classes("text-weight-bold")
                ui.label("yz.chsi.com.cn").classes("text-body2").style(f"color: {PRIMARY};")
                ui.label("院校列表、院系所、招生人数、考试科目").classes("text-caption").style(f"color: {TEXT_SECONDARY};")
            with ui.column().classes("col"):
                ui.label("掌上考研").classes("text-weight-bold")
                ui.label("api.kaoyan.cn").classes("text-body2").style(f"color: {PRIMARY};")
                ui.label("历年分数线、招生计划").classes("text-caption").style(f"color: {TEXT_SECONDARY};")

    # 异常说明
    with ui.element("div").classes("yam-card q-pa-md q-mb-md"):
        ui.label("数据异常说明").classes("text-subtitle1 text-weight-bold q-mb-sm").style(f"color: {PRIMARY};")
        ui.label(
            "由于两个来源的统计口径不同，可能会出现招生人数、年份覆盖不一致的情况。"
            "所有异常数据均已用 ⚠️ 标记，请用户到院校官网核实最终信息。"
        ).classes("text-body2")

    # 免责声明
    with ui.element("div").classes("yam-card q-pa-md"):
        ui.label("免责声明").classes("text-subtitle1 text-weight-bold q-mb-sm").style(f"color: {PRIMARY};")
        ui.label(
            "数据来自公开渠道，仅供学习参考，不保证完全准确。"
            "使用本工具产生的任何决策，由用户自行承担责任。"
        ).classes("text-body2").style(f"color: {TEXT_SECONDARY};")
