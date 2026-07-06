"""批量收集 UI 设计案例截图."""

from pathlib import Path

from playwright.sync_api import sync_playwright


def save_screenshot(page, url: str, path: Path) -> None:
    """访问 URL 并保存截图."""
    try:
        page.goto(url, wait_until="load", timeout=60000)
        page.wait_for_timeout(1500)
        page.screenshot(path=str(path), full_page=False, timeout=60000)
        print(f"saved {path.name}")
    except Exception as e:
        print(f"failed {path.name}: {e}")


def main() -> None:
    root = Path(__file__).parent

    general = [
        ("https://aka.doubaocdn.com/s/xDkF1wjMAh", root / "dashboard_general" / "edutrack_home.png"),
        ("https://aka.doubaocdn.com/s/2k4w1wjMAh", root / "dashboard_general" / "edutrack_teachers.png"),
        ("https://aka.doubaocdn.com/s/vnL01wjMAh", root / "dashboard_general" / "saas_patterns_overview.png"),
        ("https://aka.doubaocdn.com/s/5uy51wjMAi", root / "dashboard_general" / "webapp_patterns_header.png"),
        ("https://aka.doubaocdn.com/s/tNjU1wjMDF", root / "dashboard_general" / "data_table_guide_header.png"),
        ("https://aka.doubaocdn.com/s/aLtN1wjMDF", root / "dashboard_general" / "data_table_guide_author.png"),
        ("https://aka.doubaocdn.com/s/s0QX1wjMDF", root / "dashboard_general" / "shadcn_data_table_header.png"),
    ]

    education = [
        ("https://aka.doubaocdn.com/s/2cmA1wjMAh", root / "education" / "istudent_dashboard.png"),
        ("https://aka.doubaocdn.com/s/23AF1wjMAh", root / "education" / "istudent_full.png"),
        ("https://aka.doubaocdn.com/s/eeob1wjMAh", root / "education" / "bigfuture_search.png"),
        ("https://aka.doubaocdn.com/s/tJqM1wjMAh", root / "education" / "bigfuture_results.png"),
        ("https://aka.doubaocdn.com/s/DE6s1wjMAh", root / "education" / "college_navigator.png"),
        ("https://aka.doubaocdn.com/s/knGS1wjMAh", root / "education" / "niche_app.png"),
        ("https://aka.doubaocdn.com/s/70p81wjMAh", root / "education" / "college_search_header.png"),
        ("https://aka.doubaocdn.com/s/UgRE1wjMAh", root / "education" / "best_college_sites.png"),
        ("https://aka.doubaocdn.com/s/UdaV1wjMDG", root / "education" / "china_sunshine_volunteer.png"),
        ("https://aka.doubaocdn.com/s/HWwb1wjMDG", root / "education" / "yuanmeng_find_university.png"),
        ("https://aka.doubaocdn.com/s/Ym7V1wjMDG", root / "education" / "yuanmeng_university_detail.png"),
        ("https://aka.doubaocdn.com/s/y2XN1wjMDG", root / "education" / "yuanmeng_score_lines.png"),
        ("https://aka.doubaocdn.com/s/UHZG1wjMDG", root / "education" / "yuanmeng_admission_plan.png"),
        ("https://aka.doubaocdn.com/s/stb61wjMDG", root / "education" / "yuanmeng_rules.png"),
        ("https://aka.doubaocdn.com/s/9hsF1wjMDG", root / "education" / "top_apps_header.png"),
        ("https://aka.doubaocdn.com/s/r4U11wjMDG", root / "education" / "yuanmeng_employment.png"),
    ]

    desktop = [
        ("https://aka.doubaocdn.com/s/UwnO1wjMAi", root / "desktop_apps" / "sidebar_nav_guide.png"),
        ("https://aka.doubaocdn.com/s/rTlC1wjMAi", root / "desktop_apps" / "nav_pattern_matrix.png"),
        ("https://aka.doubaocdn.com/s/Ywhq1wjMAi", root / "desktop_apps" / "sidebar_theme_toggle.png"),
        ("https://aka.doubaocdn.com/s/iFnq1wjMAi", root / "desktop_apps" / "sidebar_hover.png"),
        ("https://aka.doubaocdn.com/s/qdEf1wjMAi", root / "desktop_apps" / "sidebar_css_toggle.png"),
        ("https://aka.doubaocdn.com/s/HkQL1wjMAi", root / "desktop_apps" / "sidebar_switching.png"),
    ]

    all_items = general + education + desktop

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        for url, path in all_items:
            save_screenshot(page, url, path)
        browser.close()


if __name__ == "__main__":
    main()
