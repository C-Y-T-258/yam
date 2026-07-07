# YAM UI 全面重做 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重写 YAM 桌面 UI，从卡片网格+页面跳转架构改为全宽列表视图+内联展开+模态弹窗架构，对齐用户通过 Kimi 对话确定的设计方向。

**Architecture:** NiceGUI (Python + Quasar/Vue) 单页应用。主框架：Fluent 风格菜单栏 + 左侧可折叠筛选面板 + 全宽列表内容区 + 底部状态栏。院校列表一行一所全宽展示，详情内联展开，对比为模态弹窗，爬取进度为右下角浮动卡片。

**Tech Stack:** Python 3.10+, NiceGUI ≥1.4.0, SQLite, Tailwind CSS (via NiceGUI)

## Global Constraints

- 技术栈锁定 Python + NiceGUI，不引入前端框架
- 默认浅色模式，不实现深色模式（后续迭代）
- 主色 #0F3460（深蓝），辅色 #16213e，强调色 #E94560
- 圆角 12px，阴影层级 sm/md/lg
- 不使用模拟数据，连接真实 SQLite 数据库
- NiceGUI 组件优先：ui.row, ui.column, ui.card, ui.table, ui.expansion, ui.dialog
- 避免：绝对定位、复杂 CSS 动画、自定义滚动条

---

## Task 1: Theme & CSS 重构

**Covers:** 全局视觉风格

**Files:**
- Modify: `yam/ui/theme.py`

**Interfaces:**
- Produces: `css_variables()` 返回全局 CSS，`COLORS` 字典，`tag_color()` / `score_color()` 辅助函数

- [ ] **Step 1: 重写 theme.py**

```python
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
TAG_985 = "#DC3545"
TAG_211 = "#FD7E14"
TAG_DOUBLE = "#28A745"
TAG_NORMAL = "#6C757D"
TAG_CODE = "#0F3460"

# 分数线颜色
SCORE_HIGH = "#DC3545"
SCORE_MID = "#FD7E14"
SCORE_LOW = "#28A745"


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

    /* 菜单栏 */
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
    }}
    .yam-menubar-item:hover {{
        background: #E9ECEF;
    }}

    /* 卡片 */
    .yam-card {{
        background: {BG_CARD};
        border-radius: 12px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        border: 1px solid {BORDER};
    }}
    .yam-card-hover {{
        transition: box-shadow 0.2s, transform 0.2s;
    }}
    .yam-card-hover:hover {{
        box-shadow: 0 4px 12px rgba(0,0,0,0.12);
    }}

    /* 院校列表项 */
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

    /* Tag 标签 */
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

    /* 分数线颜色 */
    .yam-score-high {{ color: {SCORE_HIGH}; font-weight: 700; }}
    .yam-score-mid {{ color: {SCORE_MID}; font-weight: 700; }}
    .yam-score-low {{ color: {SCORE_LOW}; font-weight: 700; }}

    /* 考试科目标签 */
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

    /* 研究方向标签 */
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

    /* 院系卡片 */
    .yam-department-card {{
        background: #F8F9FA;
        border: 1px solid {BORDER};
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 12px;
    }}

    /* 招生计划卡片 */
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

    /* 对比差异高亮 */
    .yam-highlight-row {{
        background: #FFFBEB !important;
    }}

    /* 浮动进度卡片 */
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

    /* 空状态占位 */
    .yam-empty-placeholder {{
        border: 2px dashed {BORDER};
        border-radius: 12px;
        padding: 32px;
        text-align: center;
        color: {TEXT_SECONDARY};
    }}

    /* 渐变 Header */
    .yam-gradient-header {{
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
        color: white;
        padding: 24px 28px;
        border-radius: 12px;
        margin-bottom: 20px;
    }}

    /* 展开/收起按钮 */
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
```

- [ ] **Step 2: 验证 CSS 加载**

Run: `cd D:\yam && python -c "from yam.ui.theme import css_variables; print(css_variables()[:100])"`
Expected: 输出 CSS 变量定义片段

- [ ] **Step 3: Commit**

```bash
git add yam/ui/theme.py
git commit -m "refactor(ui): rewrite theme with Fluent-style CSS tokens"
```

---

## Task 2: App 主框架重写（菜单栏 + 筛选面板 + 状态栏）

**Covers:** 主界面布局架构

**Files:**
- Rewrite: `yam/ui/app.py`

**Interfaces:**
- Consumes: `theme.css_variables()`, `theme.COLORS`, all page builders
- Produces: `build_app(major_code)` 启动应用

- [ ] **Step 1: 重写 app.py 主框架**

核心结构：
- 顶部：Fluent 风格菜单栏（≡ 研喵 YAM / 文件 / 数据 / 视图 / 帮助）
- 中间：左侧筛选面板(250px, 可折叠) + 右侧主内容区
- 底部：状态栏（院校数/收藏数/对比数）

菜单功能：
- 文件：导出 CSV、退出
- 数据：添加新专业（弹窗）、刷新数据
- 视图：筛选面板显示/隐藏
- 帮助：关于（弹窗）

筛选面板内容：
- 学校层次（多选 checkbox）
- 省份（多选）
- 专业代码（已添加的专业列表）
- 招生人数范围
- 重置筛选按钮
- "只显示收藏" 快捷开关

- [ ] **Step 2: 验证框架加载**

Run: `cd D:\yam && python -c "from yam.ui.app import build_app; print('app ok')"`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add yam/ui/app.py
git commit -m "refactor(ui): rebuild app frame with menu bar, sidebar, status bar"
```

---

## Task 3: 启动界面重写

**Covers:** 启动流程

**Files:**
- Rewrite: `yam/ui/pages/splash.py`

**Interfaces:**
- Produces: `build_splash_page(on_select, on_fetch)` 启动选择界面

- [ ] **Step 1: 重写 splash.py**

启动界面逻辑：
- 检查本地是否有已采集的数据
- 有数据 → 显示专业列表（已采集的显示绿色对勾+院校数），点击直接进入
- 无数据 → 显示搜索框+专业列表+手动输入入口
- 搜索框支持模糊匹配专业名称/代码
- 点击未采集的专业 → 触发爬取 → 完成后进入主界面

- [ ] **Step 2: 验证启动界面**

Run: 启动应用，确认启动界面正确显示
Expected: 搜索框、专业列表、状态指示

- [ ] **Step 3: Commit**

```bash
git add yam/ui/pages/splash.py
git commit -m "feat(ui): redesign splash with search, major list, status indicators"
```

---

## Task 4: 院校列表视图（全宽 + 内联展开）

**Covers:** 核心列表视图、内联展开详情

**Files:**
- Rewrite: `yam/ui/pages/schools.py`

**Interfaces:**
- Consumes: `SchoolDataService`, `theme.tag_color()`, `theme.score_color()`
- Produces: 全宽列表 + 内联展开

- [ ] **Step 1: 重写 schools.py**

列表视图（默认）：
- 一行一所院校，全宽
- 内容：❤️ 收藏 + 校名 + 标签(层次/地区/专业) + 招生人数 + 分数线趋势 + 展开按钮 + 对比复选框
- 分数线趋势：有数据的年份显示分数（颜色区分），无数据显示 "-"

内联展开详情：
- 点击"展开详情" → 卡片向下扩展
- 内容模块：基本信息 / 历年分数线(年份tab切换) / 考试科目标签 / 研究方向标签 / 招生计划(年份tab) / 异常提醒
- 每个模块用分隔线隔开
- 点击"收起" → 恢复折叠

- [ ] **Step 2: 验证列表视图**

Run: 启动应用，进入院校库
Expected：一行一所院校，点击展开显示详情

- [ ] **Step 3: Commit**

```bash
git add yam/ui/pages/schools.py
git commit -m "feat(ui): full-width list view with inline expandable details"
```

---

## Task 5: 对比模态弹窗

**Covers:** 对比功能

**Files:**
- Rewrite: `yam/ui/pages/compare.py`

**Interfaces:**
- Consumes: `SchoolDataService`
- Produces: 模态弹窗对比

- [ ] **Step 1: 重写 compare.py 为模态弹窗**

对比弹窗：
- 使用 `ui.dialog()` 实现模态
- 2-3 列并排，每列一所学校
- 内容：校名 + 移除按钮 + 层次/地区/招生/分数线/考试科目/研究方向
- 差异项黄色背景高亮
- 空位显示"选择院校"按钮
- 底部：导出对比按钮

- [ ] **Step 2: 验证对比弹窗**

Run: 添加 2-3 所院校到对比，点击对比按钮
Expected: 弹窗显示，差异高亮

- [ ] **Step 3: Commit**

```bash
git add yam/ui/pages/compare.py
git commit -m "feat(ui): modal comparison dialog with diff highlighting"
```

---

## Task 6: 浮动爬取进度卡片

**Covers:** 数据采集进度展示

**Files:**
- Rewrite: `yam/ui/pages/fetch.py`

**Interfaces:**
- Consumes: `fetcher` module
- Produces: 浮动进度卡片 UI

- [ ] **Step 1: 重写 fetch.py 为浮动卡片**

浮动进度卡片：
- 固定在右下角（position: fixed）
- 非模态，不阻塞主界面
- 显示：专业代码 + 进度条 + (67/217) + 预计剩余时间
- 可展开查看日志流（最近 20 条）
- 日志颜色分级：信息白/成功绿/警告黄/错误红
- 爬完自动消失

- [ ] **Step 2: 验证浮动进度**

Run: 触发数据采集
Expected: 右下角显示进度卡片，可展开日志

- [ ] **Step 3: Commit**

```bash
git add yam/ui/pages/fetch.py
git commit -m "feat(ui): floating progress card with expandable log stream"
```

---

## Task 7: 收藏功能整合到筛选面板

**Covers:** 收藏功能

**Files:**
- Modify: `yam/ui/app.py` (筛选面板部分)
- Delete: `yam/ui/pages/favorites.py` (不再需要独立页面)

**Interfaces:**
- Consumes: `SchoolDataService.is_favorite()`

- [ ] **Step 1: 在筛选面板添加"只显示收藏"开关**

在筛选面板顶部添加一个 toggle switch：
- 标签："只显示收藏"
- 开启时：列表只显示已收藏的院校
- 关闭时：显示所有院校

- [ ] **Step 2: 删除 favorites.py**

不再需要独立的收藏页面。收藏状态通过筛选面板的开关控制。

- [ ] **Step 3: 更新路由注册**

从 app.py 中移除收藏页面的路由注册。

- [ ] **Step 4: Commit**

```bash
git add yam/ui/app.py yam/ui/pages/favorites.py
git commit -m "refactor(ui): integrate favorites into sidebar filter toggle"
```

---

## Task 8: About 移到菜单栏帮助

**Covers:** 关于页面

**Files:**
- Modify: `yam/ui/app.py` (帮助菜单)
- Delete: `yam/ui/pages/about.py` (不再需要独立页面)

**Interfaces:**
- Consumes: `SchoolDataService.get_dashboard_stats()`

- [ ] **Step 1: 在帮助菜单添加"关于"项**

点击"关于" → 弹出模态弹窗，显示：
- 版本号、院校数量、更新时间
- 数据来源说明
- 异常说明
- 免责声明

- [ ] **Step 2: 删除 about.py**

- [ ] **Step 3: 更新路由注册**

- [ ] **Step 4: Commit**

```bash
git add yam/ui/app.py yam/ui/pages/about.py
git commit -m "refactor(ui): move about page to help menu dialog"
```

---

## Task 9: Dashboard 页面删除

**Covers:** 移除不必要的首页

**Files:**
- Delete: `yam/ui/pages/dashboard.py`
- Modify: `yam/ui/app.py` (移除 dashboard 路由)

**Interfaces:**
- 无（纯删除）

- [ ] **Step 1: 删除 dashboard.py**

- [ ] **Step 2: 从 app.py 移除 dashboard 路由和导入**

- [ ] **Step 3: Commit**

```bash
git add yam/ui/app.py yam/ui/pages/dashboard.py
git commit -m "refactor(ui): remove dashboard page, schools list is the main view"
```

---

## Task 10: 端到端验证

**Covers:** 所有页面

**Files:**
- 无（验证）

- [ ] **Step 1: 启动应用验证完整流程**

```bash
cd D:\yam && python -m yam.ui_entry 085410 8080
```

Chrome DevTools 逐页截图验证：
1. 有数据时直接进入主界面
2. 菜单栏功能（文件/数据/视图/帮助）
3. 筛选面板（层次/省份/专业/收藏开关）
4. 列表视图一行一所院校
5. 展开详情内联显示
6. 对比模态弹窗
7. 浮动爬取进度
8. 状态栏信息

- [ ] **Step 2: 修复验证中发现的问题**

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(ui): complete YAM UI redesign - list view, modal compare, floating progress"
```
