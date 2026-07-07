"""简易页面路由."""

from collections.abc import Callable
from typing import Any

from nicegui import ui

# 页面名称常量
PAGE_DASHBOARD = "dashboard"
PAGE_SCHOOLS = "schools"
PAGE_DETAIL = "detail"
PAGE_COMPARE = "compare"
PAGE_FAVORITES = "favorites"
PAGE_FETCH = "fetch"
PAGE_ABOUT = "about"

_page_builders: dict[str, Callable[..., None]] = {}
_page_container: ui.element | None = None
_current_page: str = PAGE_DASHBOARD
_nav_state: dict[str, Any] = {}


def register(page: str, builder: Callable[..., None]) -> None:
    """注册页面构建函数."""
    _page_builders[page] = builder


def set_container(container: ui.element) -> None:
    """设置主内容容器."""
    global _page_container
    _page_container = container


def get_state() -> dict[str, Any]:
    """获取跨页面状态."""
    return _nav_state


def set_state(key: str, value: Any) -> None:
    """设置跨页面状态."""
    _nav_state[key] = value


def navigate_to(page: str, **kwargs: Any) -> None:
    """切换到指定页面."""
    global _current_page
    if page not in _page_builders:
        ui.notify(f"未知页面: {page}", type="negative")
        return

    _current_page = page
    for key, value in kwargs.items():
        _nav_state[key] = value

    if _page_container is None:
        return

    _page_container.clear()
    with _page_container:
        _page_builders[page](**kwargs)

    _update_nav_active()


def _update_nav_active() -> None:
    """更新导航项激活状态."""
    for page, item in _nav_items.items():
        if page == _current_page:
            item.classes(add="active")
        else:
            item.classes(remove="active")


_nav_items: dict[str, ui.element] = {}


def bind_nav_item(page: str, item: ui.element) -> None:
    """绑定导航项元素."""
    _nav_items[page] = item


def current_page() -> str:
    """返回当前页面."""
    return _current_page
