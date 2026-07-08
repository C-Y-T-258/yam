"""共享筛选状态."""

from typing import Any

# 筛选状态
filter_state: dict[str, Any] = {
    "keyword": "",
    "levels": [],
    "provinces": [],
    "min_plan": None,
    "max_plan": None,
    "sort": "name",
    "favorites_only": False,
}

# 对比列表
compare_ids: list[str] = []

# 回调：筛选变化时刷新列表
_refresh_callback: callable | None = None


def set_refresh_callback(cb: callable) -> None:
    """设置刷新回调."""
    global _refresh_callback
    _refresh_callback = cb


def refresh_list() -> None:
    """触发列表刷新."""
    if _refresh_callback:
        _refresh_callback()


def update_filter(key: str, value: Any) -> None:
    """更新筛选条件."""
    filter_state[key] = value
    refresh_list()


def toggle_compare(school_id: str) -> None:
    """切换对比状态."""
    if school_id in compare_ids:
        compare_ids.remove(school_id)
    else:
        if len(compare_ids) >= 3:
            from nicegui import ui
            ui.notify("最多对比 3 所院校", type="warning")
            return
        compare_ids.append(school_id)
    refresh_list()


def get_compare_count() -> int:
    """获取对比数量."""
    return len(compare_ids)
