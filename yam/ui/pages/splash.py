"""启动画面 - 三列级联专业选择."""

from nicegui import ui

from yam.ui.theme import PRIMARY, TEXT_SECONDARY, SUCCESS, BORDER
from yam.ui.service import list_all_majors_status

# 模拟的学科门类 → 一级学科映射（实际数据可从配置扩展）
CATEGORY_TREE = {
    "工学": {
        "计算机科学与技术": [
            ("085410", "人工智能"),
            ("085401", "计算机技术"),
            ("081200", "计算机科学与技术"),
        ],
        "软件工程": [
            ("085404", "软件工程"),
            ("085405", "软件工程(非全日制)"),
        ],
        "电子科学与技术": [
            ("085403", "集成电路工程"),
        ],
        "信息与通信工程": [
            ("085402", "通信工程"),
        ],
        "控制科学与工程": [
            ("085406", "控制工程"),
        ],
        "机械工程": [
            ("085501", "机械工程"),
        ],
        "材料科学与工程": [
            ("085407", "仪器仪表工程"),
        ],
    },
    "理学": {
        "数学": [
            ("070100", "数学"),
        ],
        "物理学": [
            ("070200", "物理学"),
        ],
    },
    "管理学": {
        "管理科学与工程": [
            ("120100", "管理科学与工程"),
        ],
        "工商管理": [
            ("120200", "工商管理"),
        ],
    },
    "经济学": {
        "应用经济学": [
            ("020200", "应用经济学"),
        ],
    },
    "文学": {
        "外国语言文学": [
            ("050200", "外国语言文学"),
        ],
    },
    "法学": {
        "法学": [
            ("030100", "法学"),
        ],
    },
    "教育学": {
        "教育学": [
            ("040100", "教育学"),
        ],
    },
}


def build_splash_page(on_select, on_fetch=None) -> None:
    """构建启动画面 - 三列级联选择."""
    majors_status = list_all_majors_status()
    # 构建已采集专业 code → status 映射
    fetched_codes = {m["code"]: m for m in majors_status if m["status"] == "fetched"}
    total_fetched = len(fetched_codes)
    total_schools = sum(m["school_count"] for m in fetched_codes.values())

    # 全屏居中容器
    with ui.element("div").classes("column items-center").style(
        "height: 100vh; width: 100vw; background: #F0F2F5; padding-top: 80px;"
    ):
        # Logo + 标题
        ui.label("研喵 YAM").classes("text-h2 text-weight-bold").style(f"color: {PRIMARY};")
        ui.label("本地优先的考研择校数据工具").classes("text-subtitle1").style(
            f"color: {TEXT_SECONDARY};"
        )
        ui.element("div").style("height: 24px;")

        # 有数据时显示"进入主界面"按钮
        if total_fetched > 0:
            ui.button(
                "进入主界面",
                on_click=lambda: _enter_with_fetched(fetched_codes, on_select),
            ).props("color=primary").style("margin-bottom: 16px;")
            ui.label(f"共 {total_fetched} 个专业，{total_schools} 所院校").classes("text-caption").style(
                f"color: {TEXT_SECONDARY};"
            )
            ui.element("div").style("height: 16px;")

        # 搜索框 + 三列选择器卡片
        with ui.element("div").classes("yam-card").style(
            "width: 720px; padding: 24px;"
        ):
            # 搜索框
            search_input = ui.input(
                placeholder="搜索专业名称或代码...",
            ).props("outlined dense").classes("w-full q-mb-md")

            # 三列布局
            with ui.row().classes("w-full").style("gap: 0; height: 360px;"):
                # 列1: 学科门类
                col1_container = ui.element("div").style(
                    "width: 140px; border-right: 1px solid #E5E7EB; overflow-y: auto; padding: 8px 0;"
                )
                # 列2: 一级学科
                col2_container = ui.element("div").style(
                    "width: 220px; border-right: 1px solid #E5E7EB; overflow-y: auto; padding: 8px 0;"
                )
                # 列3: 专业
                col3_container = ui.element("div").style(
                    "flex: 1; overflow-y: auto; padding: 8px 0;"
                )

                # 状态
                state = {"cat": None, "sub": None, "major": None}

                def render_col1():
                    col1_container.clear()
                    with col1_container:
                        for cat_name in CATEGORY_TREE:
                            _selector_item(
                                cat_name,
                                state["cat"] == cat_name,
                                lambda c=cat_name: _select_cat(c),
                            )

                def _select_cat(cat_name):
                    state["cat"] = cat_name
                    state["sub"] = None
                    state["major"] = None
                    render_col1()
                    render_col2()
                    col3_container.clear()

                def render_col2():
                    col2_container.clear()
                    if not state["cat"]:
                        return
                    with col2_container:
                        for sub_name in CATEGORY_TREE.get(state["cat"], {}):
                            _selector_item(
                                sub_name,
                                state["sub"] == sub_name,
                                lambda s=sub_name: _select_sub(s),
                            )

                def _select_sub(sub_name):
                    state["sub"] = sub_name
                    state["major"] = None
                    render_col2()
                    render_col3()

                def render_col3():
                    col3_container.clear()
                    if not state["cat"] or not state["sub"]:
                        return
                    subs = CATEGORY_TREE.get(state["cat"], {}).get(state["sub"], [])
                    with col3_container:
                        for code, name in subs:
                            is_fetched = code in fetched_codes
                            status_text = f"{fetched_codes[code]['school_count']}所" if is_fetched else ""
                            _selector_item(
                                f"{code}  {name}",
                                state["major"] == code,
                                lambda c=code: _select_major(c),
                                right_text=status_text,
                                right_color=SUCCESS if is_fetched else None,
                            )

                def _select_major(code):
                    state["major"] = code
                    render_col3()
                    # 启用/禁用操作按钮
                    if code in fetched_codes:
                        action_btn.props("color=primary")
                        action_btn.set_text("进入查看")
                    else:
                        action_btn.props("outline color=primary")
                        action_btn.set_text("开始爬取 →")

                # 初始渲染
                render_col1()

            # 底部操作区
            with ui.row().classes("w-full items-center justify-between q-mt-md"):
                ui.button(
                    "或 手动输入专业代码",
                    on_click=lambda: _show_manual_input(on_select, on_fetch),
                ).props("flat color=primary")

                action_btn = ui.button(
                    "开始爬取 →",
                    on_click=lambda: _handle_action(state, fetched_codes, on_select, on_fetch),
                ).props("outline color=primary")


def _selector_item(text: str, is_selected: bool, on_click, right_text: str = "", right_color: str | None = None):
    """渲染选择器列表项."""
    bg = "#EFF6FF" if is_selected else "transparent"
    color = PRIMARY if is_selected else TEXT_SECONDARY
    weight = "600" if is_selected else "400"

    item = ui.element("div").style(
        f"padding: 8px 16px; cursor: pointer; background: {bg}; transition: background 0.15s; "
        f"display: flex; align-items: center; justify-content: space-between;"
    ).on("click", on_click)

    with item:
        ui.label(text).style(f"color: {color}; font-size: 14px; font-weight: {weight};")
        if right_text:
            ui.label(right_text).style(
                f"color: {right_color or TEXT_SECONDARY}; font-size: 12px;"
            )


def _enter_with_fetched(fetched_codes: dict, on_select) -> None:
    """进入第一个已采集的专业."""
    if fetched_codes:
        first_code = next(iter(fetched_codes))
        on_select(first_code)


def _handle_action(state: dict, fetched_codes: dict, on_select, on_fetch) -> None:
    """处理操作按钮点击."""
    code = state.get("major")
    if not code:
        ui.notify("请先选择一个专业", type="warning")
        return

    if code in fetched_codes:
        on_select(code)
    elif on_fetch:
        on_fetch(code)
    else:
        on_select(code)


def _show_manual_input(on_select, on_fetch) -> None:
    """显示手动输入专业代码弹窗."""
    with ui.dialog() as dialog, ui.card().style("width: 400px; padding: 24px;"):
        ui.label("手动输入专业代码").classes("text-h6 text-weight-bold").style(f"color: {PRIMARY};")
        code_input = ui.input(label="专业代码", placeholder="例如: 085410").props("outlined")
        with ui.row().classes("w-full justify-end gap-sm q-mt-md"):
            ui.button("取消", on_click=dialog.close).props("flat")
            ui.button("确定", on_click=lambda: _on_manual_input(code_input.value, dialog, on_select, on_fetch)).props("color=primary")
    dialog.open()


def _on_manual_input(code: str, dialog, on_select, on_fetch) -> None:
    """处理手动输入."""
    if not code or not code.strip():
        ui.notify("请输入专业代码", type="warning")
        return
    code = code.strip()
    dialog.close()
    if on_fetch:
        on_fetch(code)
    else:
        on_select(code)
