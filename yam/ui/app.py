"""YAM UI 应用框架."""

from nicegui import ui

from yam.ui import router
from yam.ui.pages import (
    build_about_page,
    build_compare_page,
    build_dashboard_page,
    build_detail_page,
    build_favorites_page,
    build_schools_page,
    build_splash_page,
)
from yam.ui.theme import PRIMARY, TEXT_PRIMARY, css_variables

_NAV_ITEMS = [
    (router.PAGE_DASHBOARD, "首页"),
    (router.PAGE_SCHOOLS, "院校库"),
    (router.PAGE_COMPARE, "数据对比"),
    (router.PAGE_FAVORITES, "我的收藏"),
    (router.PAGE_ABOUT, "数据说明"),
]

_root_container: ui.element | None = None


def _navigate(page: str, major_code: str) -> None:
    """导航到指定页面."""
    if page == router.PAGE_DETAIL:
        router.navigate_to(page, major_code=major_code, school_id=router.get_state().get("school_id"))
    else:
        router.navigate_to(page, major_code=major_code)


def _enter_major(major_code: str) -> None:
    """从启动画面进入指定专业的主界面."""
    if _root_container is None:
        return
    _root_container.clear()
    with _root_container:
        _build_main_frame(major_code)


def _back_to_splash() -> None:
    """返回启动画面."""
    if _root_container is None:
        return
    _root_container.clear()
    with _root_container:
        build_splash_page(on_select=_enter_major)


def _build_main_frame(major_code: str) -> None:
    """构建主界面框架（侧边栏 + 内容区）."""
    ui.page_title(f"YAM - {major_code} 考研择校")

    # 注册页面
    router.register(router.PAGE_DASHBOARD, build_dashboard_page)
    router.register(router.PAGE_SCHOOLS, build_schools_page)
    router.register(router.PAGE_DETAIL, build_detail_page)
    router.register(router.PAGE_COMPARE, build_compare_page)
    router.register(router.PAGE_FAVORITES, build_favorites_page)
    router.register(router.PAGE_ABOUT, build_about_page)

    with ui.element("div").classes("row no-wrap").style("height: 100vh; width: 100vw; overflow: hidden;"):
        # 左侧导航栏
        with ui.element("div").classes("column").style(
            f"width: 220px; min-width: 220px; background: #1E293B; color: white;"
        ):
            # Logo + 返回
            with ui.row().classes("items-center justify-between q-pa-md"):
                ui.label("研喵 YAM").classes("text-h6 text-weight-bold").style("color: white;")
                ui.button("", on_click=_back_to_splash).props("flat dense round color=white icon=swap_horiz").tooltip("切换专业")

            ui.separator().style("background: #334155;")

            # 导航项
            for page, label in _NAV_ITEMS:
                item = ui.element("div").classes("row items-center q-pa-md").style(
                    "cursor: pointer; border-radius: 8px; margin: 2px 8px; transition: background 0.2s;"
                ).on("mouseenter", lambda e: e.sender.style("background: #334155;")) \
                 .on("mouseleave", lambda e: e.sender.style("background: transparent;"))
                with item:
                    ui.label(label).classes("text-body2").style("color: #CBD5E1;")
                item.on("click", lambda p=page: _navigate(p, major_code))
                router.bind_nav_item(page, item)

            # 底部：当前专业
            ui.element("div").style("flex: 1 1 auto;")
            with ui.element("div").classes("q-pa-md"):
                with ui.row().classes("items-center gap-sm"):
                    ui.badge(major_code, color="primary").props("rounded")
                    from yam.config import config
                    major_info = config.get_major(major_code)
                    ui.label(major_info["name"] if major_info else "").classes("text-caption").style("color: #94A3B8;")

        # 右侧主区域
        with ui.element("div").classes("column").style("flex: 1 1 auto; min-width: 0;"):
            # 顶部工具栏
            with ui.element("div").classes("row items-center justify-between q-px-md q-py-sm").style(
                "background: white; border-bottom: 1px solid #E5E7EB; height: 56px;"
            ):
                with ui.row().classes("items-center gap-sm"):
                    ui.label("考研择校数据浏览器").classes("text-subtitle1 text-weight-medium").style(
                        f"color: {TEXT_PRIMARY};"
                    )
                with ui.row().classes("items-center gap-sm"):
                    ui.button("院校库", on_click=lambda: _navigate(router.PAGE_SCHOOLS, major_code)).props(
                        "flat dense color=primary"
                    )
                    ui.button("对比", on_click=lambda: _navigate(router.PAGE_COMPARE, major_code)).props(
                        "flat dense color=primary"
                    )

            # 主内容区
            page_container = ui.element("div").classes("column").style(
                "flex: 1 1 auto; overflow: auto; padding: 20px; background: #F3F4F6;"
            )
            router.set_container(page_container)

    # 默认打开首页
    router.navigate_to(router.PAGE_DASHBOARD, major_code=major_code)


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
            build_splash_page(on_select=_enter_major)
