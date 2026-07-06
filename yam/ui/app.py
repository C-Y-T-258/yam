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
)
from yam.ui.theme import PRIMARY, TEXT_PRIMARY, css_variables

_NAV_ITEMS = [
    (router.PAGE_DASHBOARD, "🏠 首页"),
    (router.PAGE_SCHOOLS, "🏫 院校库"),
    (router.PAGE_COMPARE, "⚖️ 数据对比"),
    (router.PAGE_FAVORITES, "⭐ 我的收藏"),
    (router.PAGE_ABOUT, "ℹ️ 数据说明"),
]


def _navigate(page: str, major_code: str) -> None:
    """导航到指定页面."""
    ui.notify(f"导航到 {page}")
    if page == router.PAGE_DETAIL:
        router.navigate_to(page, major_code=major_code, school_id=router.get_state().get("school_id"))
    else:
        router.navigate_to(page, major_code=major_code)


def build_app(major_code: str) -> None:
    """构建应用主框架."""
    ui.page_title(f"YAM - {major_code} 考研择校")

    # 注入全局 CSS
    ui.add_head_html(css_variables())

    # 注册页面
    router.register(router.PAGE_DASHBOARD, build_dashboard_page)
    router.register(router.PAGE_SCHOOLS, build_schools_page)
    router.register(router.PAGE_DETAIL, build_detail_page)
    router.register(router.PAGE_COMPARE, build_compare_page)
    router.register(router.PAGE_FAVORITES, build_favorites_page)
    router.register(router.PAGE_ABOUT, build_about_page)

    # 外层容器：全屏无滚动
    with ui.element("div").classes("row no-wrap").style("height: 100vh; width: 100vw; overflow: hidden;"):
        # 左侧导航栏
        with ui.element("div").classes("yam-sidebar column").style("width: 200px; min-width: 200px;"):
            with ui.element("div").classes("row items-center q-pa-md").style(f"color: {PRIMARY};"):
                ui.label("研喵 YAM").classes("text-h6 text-weight-bold")
            ui.separator()

            for page, label in _NAV_ITEMS:
                item = ui.element("div").classes("yam-nav-item text-grey-7 row items-center")
                with item:
                    ui.label(label).classes("text-body2")
                item.on("click", lambda p=page: _navigate(p, major_code))
                router.bind_nav_item(page, item)

            ui.element("div").style("flex: 1 1 auto;")
            with ui.element("div").classes("q-pa-md text-caption text-grey-6"):
                ui.label(f"专业: {major_code}")

        # 右侧主区域
        with ui.element("div").classes("column").style("flex: 1 1 auto; min-width: 0;"):
            # 顶部工具栏
            with ui.element("div").classes("row items-center justify-between q-px-md q-py-sm").style(
                f"background: white; border-bottom: 1px solid #E5E7EB; height: 56px;"
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
