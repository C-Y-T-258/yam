"""YAM UI 页面模块."""

from yam.ui.pages.compare import show_compare_dialog
from yam.ui.pages.fetch import build_fetch_page
from yam.ui.pages.schools import build_schools_page
from yam.ui.pages.splash import build_splash_page

__all__ = [
    "build_splash_page",
    "build_fetch_page",
    "build_schools_page",
    "show_compare_dialog",
]
