"""YAM UI 主题与样式常量."""

from typing import Final

# 颜色系统
COLORS = {
    "primary": "#0F3460",
    "primary_hover": "#1A4A7A",
    "primary_light": "#EFF6FF",
    "accent": "#E94560",
    "success": "#28A745",
    "warning": "#FFC107",
    "danger": "#DC3545",
    "bg_body": "#F0F2F5",
    "bg_card": "#FFFFFF",
    "bg_sidebar": "#FFFFFF",
    "border": "#E5E7EB",
    "text_primary": "#1F2937",
    "text_secondary": "#6B7280",
}

PRIMARY: Final[str] = COLORS["primary"]
PRIMARY_LIGHT: Final[str] = COLORS["primary_light"]
WARNING: Final[str] = COLORS["warning"]
DANGER: Final[str] = COLORS["danger"]
SUCCESS: Final[str] = COLORS["success"]
TEXT_PRIMARY: Final[str] = COLORS["text_primary"]
TEXT_SECONDARY: Final[str] = COLORS["text_secondary"]
BG_BODY: Final[str] = COLORS["bg_body"]
BG_CARD: Final[str] = COLORS["bg_card"]
BORDER: Final[str] = COLORS["border"]

# Tag 颜色
TAG_985: Final[str] = "#DC3545"
TAG_211: Final[str] = "#FD7E14"
TAG_DOUBLE: Final[str] = "#28A745"
TAG_NORMAL: Final[str] = "#6C757D"
TAG_CODE: Final[str] = "#0F3460"

# 分数线颜色
SCORE_HIGH: Final[str] = "#DC3545"
SCORE_MID: Final[str] = "#FD7E14"
SCORE_LOW: Final[str] = "#28A745"


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
    }}
    body {{
        background-color: {BG_BODY} !important;
        color: {TEXT_PRIMARY} !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }}

    /* === 菜单栏 === */
    .yam-menubar {{
        background: #F8F9FA;
        border-bottom: 1px solid {BORDER};
        height: 40px;
        display: flex;
        align-items: center;
        padding: 0 12px;
        font-size: 13px;
        user-select: none;
    }}
    .yam-menubar-item {{
        padding: 4px 12px;
        border-radius: 4px;
        cursor: pointer;
        transition: background 0.15s;
        color: {TEXT_PRIMARY};
    }}
    .yam-menubar-item:hover {{
        background: #E9ECEF;
    }}
    .yam-menubar-logo {{
        font-weight: 700;
        color: {PRIMARY};
        margin-right: 16px;
    }}

    /* === 卡片 === */
    .yam-card {{
        background: {BG_CARD};
        border-radius: 12px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        border: 1px solid {BORDER};
    }}

    /* === 院校列表项 === */
    .yam-school-item {{
        background: {BG_CARD};
        border-radius: 12px;
        border: 1px solid {BORDER};
        padding: 20px;
        margin-bottom: 12px;
        transition: box-shadow 0.2s;
    }}
    .yam-school-item:hover {{
        box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }}
    .yam-school-item.expanded {{
        box-shadow: 0 4px 16px rgba(0,0,0,0.1);
    }}

    /* === Tag 标签 === */
    .yam-tag {{
        display: inline-block;
        padding: 3px 10px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
        color: white;
        line-height: 1.4;
    }}
    .yam-tag-985 {{ background: {TAG_985}; }}
    .yam-tag-211 {{ background: {TAG_211}; }}
    .yam-tag-double {{ background: {TAG_DOUBLE}; }}
    .yam-tag-normal {{ background: {TAG_NORMAL}; }}
    .yam-tag-code {{ background: {TAG_CODE}; }}

    /* === 分数线颜色 === */
    .yam-score-high {{ color: {SCORE_HIGH}; font-weight: 700; }}
    .yam-score-mid {{ color: {SCORE_MID}; font-weight: 700; }}
    .yam-score-low {{ color: {SCORE_LOW}; font-weight: 700; }}

    /* === 考试科目标签 === */
    .yam-exam-tag {{
        display: inline-block;
        background: #E3F2FD;
        color: #1565C0;
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        margin: 2px;
    }}

    /* === 研究方向标签 === */
    .yam-direction-tag {{
        display: inline-block;
        background: #F0F4FF;
        color: {PRIMARY};
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        margin: 2px;
    }}

    /* === 院系卡片 === */
    .yam-department-card {{
        background: #F8F9FA;
        border: 1px solid {BORDER};
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 12px;
    }}

    /* === 招生计划卡片 === */
    .yam-plan-card {{
        background: {BG_CARD};
        border: 1px solid {BORDER};
        border-radius: 10px;
        overflow: hidden;
        margin-bottom: 12px;
    }}
    .yam-plan-card-header {{
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: linear-gradient(135deg, #F0F4FF 0%, #E8F0FE 100%);
        border-bottom: 1px solid {BORDER};
    }}

    /* === 对比差异高亮 === */
    .yam-highlight-row {{
        background: #FFFBEB !important;
    }}

    /* === 浮动进度卡片 === */
    .yam-float-progress {{
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 320px;
        background: {BG_CARD};
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.15);
        border: 1px solid {BORDER};
        z-index: 1000;
        padding: 16px;
    }}

    /* === 空状态占位 === */
    .yam-empty-placeholder {{
        border: 2px dashed {BORDER};
        border-radius: 12px;
        padding: 32px;
        text-align: center;
        color: {TEXT_SECONDARY};
    }}

    /* === 展开/收起按钮 === */
    .yam-expand-btn {{
        background: none;
        border: none;
        color: {PRIMARY};
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        padding: 4px 0;
        transition: color 0.15s;
    }}
    .yam-expand-btn:hover {{
        color: {COLORS["primary_hover"]};
    }}

    /* === 筛选面板 === */
    .yam-filter-section {{
        margin-bottom: 16px;
    }}
    .yam-filter-label {{
        font-size: 12px;
        font-weight: 600;
        color: {TEXT_SECONDARY};
        text-transform: uppercase;
        margin-bottom: 8px;
    }}

    /* 隐藏 NiceGUI 调试端口显示 */
    .q-footer {{
        display: none !important;
    }}
    </style>
    """


def tag_color(level: str | None) -> str:
    """根据学校层次返回 tag CSS class."""
    if not level:
        return "yam-tag yam-tag-normal"
    if "985" in level:
        return "yam-tag yam-tag-985"
    if "211" in level:
        return "yam-tag yam-tag-211"
    if "一流" in level:
        return "yam-tag yam-tag-double"
    return "yam-tag yam-tag-normal"


def score_color(total: int | float | None) -> str:
    """根据分数线返回 CSS class."""
    if total is None:
        return ""
    if total >= 380:
        return "yam-score-high"
    if total >= 350:
        return "yam-score-mid"
    return "yam-score-low"
