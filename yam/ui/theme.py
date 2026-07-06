"""YAM UI 主题与样式常量."""

from typing import Final

# 品牌色
PRIMARY: Final[str] = "#2563EB"        # 蓝色
PRIMARY_LIGHT: Final[str] = "#EFF6FF"  # 浅蓝背景
WARNING: Final[str] = "#F59E0B"        # 橙色异常
DANGER: Final[str] = "#EF4444"         # 红色
SUCCESS: Final[str] = "#10B981"        # 绿色
TEXT_PRIMARY: Final[str] = "#1F2937"   # 深灰
TEXT_SECONDARY: Final[str] = "#6B7280" # 中灰
BG_BODY: Final[str] = "#F3F4F6"        # 页面背景
BG_CARD: Final[str] = "#FFFFFF"        # 卡片背景
BORDER: Final[str] = "#E5E7EB"         # 边框


def css_variables() -> str:
    """返回全局 CSS 变量定义."""
    return f"""
    <style>
    :root {{
        --q-primary: {PRIMARY};
        --q-secondary: {PRIMARY_LIGHT};
        --q-accent: {PRIMARY};
        --q-positive: {SUCCESS};
        --q-negative: {DANGER};
        --q-info: {PRIMARY};
        --q-warning: {WARNING};
        --yam-bg-body: {BG_BODY};
        --yam-bg-card: {BG_CARD};
        --yam-text-primary: {TEXT_PRIMARY};
        --yam-text-secondary: {TEXT_SECONDARY};
        --yam-border: {BORDER};
    }}
    body {{
        background-color: {BG_BODY} !important;
        color: {TEXT_PRIMARY} !important;
    }}
    .yam-card {{
        background: {BG_CARD};
        border-radius: 12px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        border: 1px solid {BORDER};
    }}
    .yam-sidebar {{
        background: {BG_CARD};
        border-right: 1px solid {BORDER};
    }}
    .yam-nav-item {{
        border-radius: 8px;
        color: {TEXT_SECONDARY};
        margin: 4px 8px;
        padding: 10px 14px;
        cursor: pointer;
        transition: all 0.2s;
    }}
    .yam-nav-item:hover {{
        background: {PRIMARY_LIGHT};
        color: {PRIMARY};
    }}
    .yam-nav-item.active {{
        background: {PRIMARY_LIGHT};
        color: {PRIMARY};
        font-weight: 600;
    }}
    .yam-kpi-card {{
        background: {BG_CARD};
        border-radius: 12px;
        border-left: 4px solid {PRIMARY};
        padding: 16px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }}
    .yam-kpi-warning {{
        border-left-color: {WARNING};
    }}
    .yam-kpi-success {{
        border-left-color: {SUCCESS};
    }}
    </style>
    """


def primary() -> str:
    """主色样式."""
    return f"color: {PRIMARY};"


def warning() -> str:
    """警告色样式."""
    return f"color: {WARNING};"


def success() -> str:
    """成功色样式."""
    return f"color: {SUCCESS};"


def danger() -> str:
    """危险色样式."""
    return f"color: {DANGER};"
