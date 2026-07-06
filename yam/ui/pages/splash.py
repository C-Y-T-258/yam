"""启动画面 - 专业选择."""

from nicegui import ui

from yam.ui.theme import BG_CARD, BORDER, DANGER, PRIMARY, SUCCESS, TEXT_SECONDARY, WARNING
from yam.ui.service import list_all_majors_status


def build_splash_page(on_select) -> None:
    """构建启动画面.

    Args:
        on_select: 选择专业后的回调，接收 major_code 参数
    """
    majors = list_all_majors_status()

    # 全屏居中容器
    with ui.element("div").classes("column items-center justify-center").style(
        "height: 100vh; width: 100vw; background: #F5F7FA;"
    ):
        # Logo + 标题
        ui.label("研喵 YAM").classes("text-h2 text-weight-bold").style(f"color: {PRIMARY};")
        ui.label("本地优先的考研择校数据工具").classes("text-subtitle1").style(
            f"color: {TEXT_SECONDARY};"
        )
        ui.element("div").style("height: 32px;")

        # 专业卡片网格
        with ui.row().classes("wrap justify-center gap-md").style("max-width: 900px;"):
            for major in majors:
                _major_card(major, on_select)

        ui.element("div").style("height: 24px;")

        # 底部提示
        ui.label("选择专业进入，或先采集数据").classes("text-caption").style(
            f"color: {TEXT_SECONDARY};"
        )


def _major_card(major: dict, on_select) -> None:
    """单个专业选择卡片."""
    status = major["status"]
    is_fetched = status == "fetched"

    border_color = SUCCESS if is_fetched else BORDER
    status_color = SUCCESS if is_fetched else WARNING
    status_text = f"{major['school_count']} 所院校" if is_fetched else "未采集"
    status_icon = "✅" if is_fetched else "📥"

    with ui.element("div").classes("yam-card").style(
        f"width: 260px; cursor: pointer; border: 2px solid {border_color}; transition: all 0.2s;"
    ).on("mouseenter", lambda e: e.sender.style("transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1);")) \
     .on("mouseleave", lambda e: e.sender.style("transform: none; box-shadow: none;")):
        with ui.element("div").classes("q-pa-md"):
            # 专业代码 + 名称
            ui.label(major["code"]).classes("text-h6 text-weight-bold").style(f"color: {PRIMARY};")
            ui.label(major["name"]).classes("text-body1").style(f"color: {TEXT_SECONDARY};")

            ui.element("div").style("height: 8px;")

            # 状态
            with ui.row().classes("items-center gap-sm"):
                ui.label(status_icon).classes("text-body2")
                ui.label(status_text).classes("text-body2").style(f"color: {status_color};")

            # 数据概要（已采集时显示）
            if is_fetched:
                ui.element("div").style("height: 4px;")
                with ui.row().classes("gap-md"):
                    ui.label(f"分数线 {major['score_count']}条").classes("text-caption").style(
                        f"color: {TEXT_SECONDARY};"
                    )
                    ui.label(f"招生计划 {major['plan_count']}条").classes("text-caption").style(
                        f"color: {TEXT_SECONDARY};"
                    )

            ui.element("div").style("height: 8px;")

            # 操作按钮
            if is_fetched:
                ui.button(
                    "进入查看",
                    on_click=lambda c=major["code"]: on_select(c),
                ).props("color=primary").classes("full-width")
            else:
                ui.button(
                    "去采集",
                    on_click=lambda c=major["code"]: on_select(c),
                ).props("outline color=warning").classes("full-width")
