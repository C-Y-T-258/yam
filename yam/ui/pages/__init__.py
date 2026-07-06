"""YAM UI 页面模块."""

from yam.ui.pages.about import build_about_page
from yam.ui.pages.compare import build_compare_page
from yam.ui.pages.dashboard import build_dashboard_page
from yam.ui.pages.detail import build_detail_page
from yam.ui.pages.favorites import build_favorites_page
from yam.ui.pages.fetch import build_fetch_page
from yam.ui.pages.schools import build_schools_page
from yam.ui.pages.splash import build_splash_page

__all__ = [
    "build_splash_page",
    "build_fetch_page",
    "build_dashboard_page",
    "build_schools_page",
    "build_detail_page",
    "build_compare_page",
    "build_favorites_page",
    "build_about_page",
]
