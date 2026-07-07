"""数据采集页面."""

from nicegui import ui

from yam.ui import router
from yam.ui.service import list_all_majors_status
from yam.ui.theme import DANGER, PRIMARY, SUCCESS, TEXT_SECONDARY, WARNING
from yam import fetcher


def build_fetch_page(major_code: str | None = None) -> None:
    """构建数据采集页面."""
    with ui.element("div").classes("yam-gradient-header"):
        ui.label("数据采集").classes("text-h4 text-weight-bold").style("color: white;")
        ui.label("从研招网和掌上考研采集院校招生数据").classes("text-body2").style(
            "color: rgba(255,255,255,0.75); margin-top: 4px;"
        )

    majors = list_all_majors_status()

    # 选择专业区
    with ui.element("div").classes("yam-card q-pa-md q-mb-md"):
        ui.label("选择要采集的专业").classes("text-subtitle1 text-weight-bold q-mb-sm")

        selected_major = {"value": major_code}

        with ui.row().classes("gap-md items-end"):
            options = {m["code"]: f"{m['code']} {m['name']} ({m['school_count']}所)" for m in majors}
            major_select = ui.select(
                options=options,
                label="专业",
                value=major_code,
            ).classes("col-grow")

            ui.button("开始采集", on_click=lambda: _start_fetch(major_select.value)).props(
                "color=primary"
            )
            ui.button("暂停", on_click=lambda: _pause_fetch(major_select.value)).props(
                "outline color=warning"
            )

    # 进度区
    progress_container = ui.element("div").classes("yam-card q-pa-md q-mb-md")

    # 日志区
    log_container = ui.element("div").classes("yam-card q-pa-md").style("max-height: 400px; overflow: auto;")

    def refresh_progress():
        if not major_select.value:
            return

        progress_container.clear()
        log_container.clear()

        p = fetcher.get_progress(major_select.value)

        with progress_container:
            _render_progress(p)

        with log_container:
            ui.label("采集日志").classes("text-subtitle1 text-weight-bold q-mb-sm")
            if p.logs:
                for log in p.logs[-30:]:  # 显示最后30条
                    color = TEXT_SECONDARY
                    if "失败" in log or "异常" in log:
                        color = DANGER
                    elif "OK" in log or "完成" in log:
                        color = SUCCESS
                    ui.label(log).classes("text-caption").style(f"color: {color}; font-family: monospace;")
            else:
                ui.label("暂无日志").classes("text-body2 text-grey-6")

    # 自动刷新
    refresh_timer = ui.timer(2.0, refresh_progress)

    # 初始渲染
    refresh_progress()


def _render_progress(p: fetcher.FetchProgress) -> None:
    """渲染进度信息."""
    if p.status == "idle" and p.total == 0:
        ui.label("选择专业后点击「开始采集」").classes("text-body2 text-grey-6")
        return

    # 状态标签
    status_map = {
        "idle": ("待开始", TEXT_SECONDARY),
        "running": ("采集中", PRIMARY),
        "paused": ("已暂停", WARNING),
        "done": ("已完成", SUCCESS),
        "error": ("出错", DANGER),
    }
    status_text, status_color = status_map.get(p.status, ("未知", TEXT_SECONDARY))

    with ui.row().classes("items-center gap-md q-mb-md"):
        ui.badge(status_text, color="primary" if p.status == "running" else "secondary").props("rounded")
        if p.major_name:
            ui.label(f"{p.major_code} {p.major_name}").classes("text-subtitle1 text-weight-medium")
        if p.current_school:
            ui.label(f"当前: {p.current_school}").classes("text-body2").style(f"color: {TEXT_SECONDARY};")

    # 进度条
    if p.total > 0:
        pct = int(p.current / p.total * 100) if p.total > 0 else 0
        ui.label(f"进度: {p.current}/{p.total} ({pct}%)").classes("text-body2 q-mb-sm")
        ui.linear_progress(value=p.current / p.total, show_value=False).style("height: 8px;")

    # 统计数字
    with ui.row().classes("gap-lg q-mt-md"):
        _stat_item("成功", str(p.success), SUCCESS)
        _stat_item("失败", str(p.failed), DANGER)
        _stat_item("跳过", str(p.skipped), TEXT_SECONDARY)
        if p.score_success > 0 or p.score_failed > 0:
            _stat_item("分数线成功", str(p.score_success), SUCCESS)
            _stat_item("分数线失败", str(p.score_failed), DANGER)

    # 错误信息
    if p.error:
        ui.label(f"错误: {p.error}").classes("text-body2 q-mt-md").style(f"color: {DANGER};")


def _stat_item(label: str, value: str, color: str) -> None:
    """渲染单个统计项."""
    with ui.column().classes("items-center"):
        ui.label(value).classes("text-h5 text-weight-bold").style(f"color: {color};")
        ui.label(label).classes("text-caption").style(f"color: {TEXT_SECONDARY};")


def _start_fetch(major_code: str | None) -> None:
    if not major_code:
        ui.notify("请先选择专业", type="warning")
        return
    fetcher.start_fetch(major_code)
    ui.notify(f"开始采集 {major_code}", type="positive")


def _pause_fetch(major_code: str | None) -> None:
    if not major_code:
        return
    fetcher.pause_fetch(major_code)
    ui.notify(f"已暂停 {major_code}", type="warning")
