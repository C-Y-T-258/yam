"""YAM UI 应用框架 — Fluent 风格."""

from nicegui import ui

from yam.ui import router
from yam.ui.pages import (
    build_compare_page,
    build_fetch_page,
    build_schools_page,
    build_splash_page,
)
from yam.ui.theme import BG_BODY, BORDER, PRIMARY, TEXT_PRIMARY, TEXT_SECONDARY, css_variables

_root_container: ui.element | None = None
_filter_visible = True
_filter_container: ui.element | None = None
_content_container: ui.element | None = None
_status_label: ui.element | None = None


def _toggle_filter() -> None:
    """切换筛选面板显示/隐藏."""
    global _filter_visible
    _filter_visible = not _filter_visible
    if _filter_container:
        if _filter_visible:
            _filter_container.style("display: block; width: 260px; min-width: 260px;")
        else:
            _filter_container.style("display: none;")


def _enter_major(major_code: str, goto_page: str | None = None) -> None:
    """从启动画面进入指定专业的主界面."""
    if _root_container is None:
        return
    _root_container.clear()
    with _root_container:
        _build_main_frame(major_code)


def _enter_fetch(major_code: str) -> None:
    """从启动画面进入采集."""
    _enter_major(major_code)


def _back_to_splash() -> None:
    """返回启动画面."""
    if _root_container is None:
        return
    _root_container.clear()
    with _root_container:
        build_splash_page(on_select=_enter_major, on_fetch=_enter_fetch)


def _build_main_frame(major_code: str) -> None:
    """构建主界面框架：菜单栏 + 筛选面板 + 内容区 + 状态栏."""
    ui.page_title(f"YAM - {major_code} 考研择校")

    # 注册页面
    router.register(router.PAGE_SCHOOLS, build_schools_page)
    router.register(router.PAGE_COMPARE, build_compare_page)
    router.register(router.PAGE_FETCH, build_fetch_page)

    with ui.element("div").classes("column").style("height: 100vh; width: 100vw; overflow: hidden;"):

        # === 菜单栏 ===
        _build_menubar(major_code)

        # === 中间区域：筛选面板 + 内容区 ===
        with ui.element("div").classes("row no-wrap").style("flex: 1 1 auto; overflow: hidden;"):

            # 左侧筛选面板
            global _filter_container
            _filter_container = ui.element("div").classes("column").style(
                f"width: 260px; min-width: 260px; background: {BG_BODY}; border-right: 1px solid {BORDER}; overflow-y: auto; padding: 16px;"
            )
            with _filter_container:
                _build_filter_panel(major_code)

            # 右侧主内容区
            with ui.element("div").classes("column").style("flex: 1 1 auto; min-width: 0; overflow: hidden;"):
                # 顶部操作栏
                with ui.element("div").classes("row items-center justify-between q-px-md q-py-sm").style(
                    f"background: white; border-bottom: 1px solid {BORDER}; height: 48px;"
                ):
                    with ui.row().classes("items-center gap-sm"):
                        ui.icon("search", size="18px").style(f"color: {TEXT_SECONDARY};")
                        ui.input(placeholder="搜索院校...").props("borderless dense").classes("col-grow").style(
                            f"color: {TEXT_PRIMARY};"
                        )
                    with ui.row().classes("items-center gap-sm"):
                        ui.select(
                            options={"name": "按名称", "yanzhao_total": "按研招网招生", "zskyy_total": "按掌上考研招生", "province": "按省份"},
                            value="name",
                            label="排序",
                        ).props("dense outlined").classes("col").style("width: 160px;")
                        ui.button("对比 0/3", on_click=lambda: router.navigate_to(router.PAGE_COMPARE, major_code=major_code)).props(
                            "outline color=primary dense"
                        )
                        ui.button("导出", on_click=lambda: None).props("outline color=primary dense icon=file_download")

                # 主内容区（滚动）
                global _content_container
                _content_container = ui.element("div").classes("column").style(
                    f"flex: 1 1 auto; overflow-y: auto; padding: 20px; background: {BG_BODY};"
                )
                router.set_container(_content_container)

        # === 状态栏 ===
        _build_status_bar(major_code)

    # 默认进入院校列表
    router.navigate_to(router.PAGE_SCHOOLS, major_code=major_code)


def _build_menubar(major_code: str) -> None:
    """构建 Fluent 风格菜单栏."""
    with ui.element("div").classes("yam-menubar"):
        ui.label("≡ 研喵 YAM").classes("yam-menubar-logo")
        ui.label("文件").classes("yam-menubar-item")
        ui.label("数据").classes("yam-menubar-item")
        ui.label("视图").classes("yam-menubar-item").on("click", _toggle_filter)
        ui.label("帮助").classes("yam-menubar-item")


def _build_filter_panel(major_code: str) -> None:
    """构建左侧筛选面板."""
    ui.label("筛选").classes("text-subtitle1 text-weight-bold q-mb-md").style(f"color: {PRIMARY};")

    # 只显示收藏
    ui.switch("只显示收藏", value=False).classes("q-mb-md")

    # 学校层次
    ui.label("学校层次").classes("yam-filter-label")
    ui.checkbox("985")
    ui.checkbox("211")
    ui.checkbox("双一流")
    ui.checkbox("普通本科")

    ui.separator().classes("q-my-md")

    # 省份
    ui.label("所在地区").classes("yam-filter-label")
    ui.select(
        options=["北京", "上海", "江苏", "浙江", "广东", "湖北", "四川", "陕西", "辽宁", "山东", "天津", "重庆", "湖南", "福建", "安徽", "吉林", "黑龙江", "甘肃", "山西", "河南", "河北", "云南", "贵州", "广西", "内蒙古", "新疆", "宁夏", "青海", "西藏", "海南", "江西"],
        label="省份",
        multiple=True,
    ).props("use-chips clearable dense")

    ui.separator().classes("q-my-md")

    # 专业
    ui.label("专业").classes("yam-filter-label")
    ui.label(f"当前: {major_code}").classes("text-body2").style(f"color: {TEXT_SECONDARY};")

    ui.separator().classes("q-my-md")

    # 招生人数范围
    ui.label("招生人数").classes("yam-filter-label")
    with ui.row().classes("w-full gap-sm"):
        ui.number(label="最小", min=0, value=0).props("dense outlined").classes("col")
        ui.number(label="最大", min=0).props("dense outlined").classes("col")

    ui.separator().classes("q-my-md")

    # 重置
    ui.button("重置筛选", on_click=lambda: None).props("flat color=grey-7 icon=refresh").classes("text-caption")


def _build_status_bar(major_code: str) -> None:
    """构建底部状态栏."""
    global _status_label
    with ui.element("div").classes("row items-center justify-between q-px-md").style(
        f"background: white; border-top: 1px solid {BORDER}; height: 32px; font-size: 12px; color: {TEXT_SECONDARY};"
    ):
        _status_label = ui.label(f"专业: {major_code}")
        ui.label("共 0 所院校 | 收藏 0 所 | 已选 0/3 对比")


def build_app(major_code: str | None = None) -> None:
    """构建应用.

    Args:
        major_code: 专业代码。为None时显示启动画面。
    """
    ui.add_head_html(css_variables())

    global _root_container
    _root_container = ui.element("div").style("height: 100vh; width: 100vw;")

    with _root_container:
        if major_code:
            _build_main_frame(major_code)
        else:
            build_splash_page(on_select=_enter_major, on_fetch=_enter_fetch)
