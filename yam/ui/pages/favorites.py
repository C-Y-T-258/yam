"""我的收藏页."""

from nicegui import ui

from yam.ui import router
from yam.ui.service import SchoolDataService
from yam.ui.theme import PRIMARY, TEXT_SECONDARY, WARNING


def build_favorites_page(major_code: str) -> None:
    """构建收藏页."""
    ui.label("我的收藏").classes("text-h4 q-mb-md").style(f"color: {PRIMARY};")

    service = SchoolDataService(major_code)
    favorites = service.list_favorites()

    if not favorites:
        _render_empty(major_code)
        service.close()
        return

    ui.label(f"共 {len(favorites)} 所关注院校").classes("text-caption q-mb-md").style(f"color: {TEXT_SECONDARY};")

    # 卡片列表
    with ui.row().classes("w-full wrap gap-md"):
        for school in favorites:
            _render_favorite_card(major_code, service, school)

    service.close()


def _render_empty(major_code: str) -> None:
    """渲染空状态."""
    with ui.column().classes("items-center q-pa-lg"):
        ui.label("⭐").classes("text-h3")
        ui.label("暂无关注院校").classes("text-body1 text-grey-6 q-mb-sm")
        ui.label("在院校库中点击星标按钮添加收藏").classes("text-caption text-grey-5")
        ui.button(
            "去院校库",
            on_click=lambda: router.navigate_to(router.PAGE_SCHOOLS, major_code=major_code),
        ).props("color=primary").classes("q-mt-md")


def _render_favorite_card(major_code: str, service: SchoolDataService, school: dict) -> None:
    """渲染单个收藏卡片."""
    with ui.element("div").classes("yam-card yam-card-hover q-pa-md").style("width: 300px;"):
        with ui.row().classes("items-center justify-between q-mb-sm"):
            ui.label(school["name"]).classes("text-subtitle1 text-weight-bold").style(f"color: {PRIMARY};")
            if school.get("has_issue"):
                ui.badge("异常", color="warning").props("rounded")

        with ui.row().classes("gap-sm q-mb-sm"):
            level = school.get("level", "")
            if "985" in (level or ""):
                ui.html('<span class="yam-tag yam-tag-985">985</span>')
            elif "211" in (level or ""):
                ui.html('<span class="yam-tag yam-tag-211">211</span>')
            elif "一流" in (level or ""):
                ui.html('<span class="yam-tag yam-tag-double">双一流</span>')
            else:
                ui.html(f'<span class="yam-tag yam-tag-normal">{level or "普通"}</span>')
            ui.badge(school.get("province", "-"), color="grey-5").props("rounded")

        ui.label(f"研招网 2026: {school.get('yanzhao_total', 0)} 人").classes("text-body2")
        ui.label(f"掌上考研 2026: {school.get('zskyy_total', 0)} 人").classes("text-body2")

        with ui.row().classes("justify-end gap-sm q-mt-md"):
            ui.button(
                "取消收藏",
                on_click=lambda sid=school["school_id"]: _remove(service, sid, major_code),
            ).props("flat dense color=negative")
            ui.button(
                "详情",
                on_click=lambda sid=school["school_id"]: _go_detail(major_code, service, sid),
            ).props("dense color=primary")


def _remove(service: SchoolDataService, school_id: str, major_code: str) -> None:
    """取消收藏."""
    service.remove_favorite(school_id)
    ui.notify("已取消收藏", type="info")
    service.close()
    router.navigate_to(router.PAGE_FAVORITES, major_code=major_code)


def _go_detail(major_code: str, service: SchoolDataService, school_id: str) -> None:
    """跳转详情."""
    service.add_recent_view(school_id)
    service.close()
    router.set_state("school_id", school_id)
    router.navigate_to(router.PAGE_DETAIL, major_code=major_code, school_id=school_id)
