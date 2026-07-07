# YAM UI 全功能重设计计划

## 1. Summary

对 `yam/ui/` 下的桌面 Web UI 进行全功能重设计：升级视觉体系、补全详情/对比/收藏/说明四个占位页、增强数据可视化、修复状态与交互缺陷。设计参考案例统一保存到 `.trae/documents/ui-references/`。

## 2. Current State Analysis

已读关键文件：
- `yam/ui/app.py`：左侧导航 + 顶部工具栏 + 主内容区，框架可用但视觉朴素。
- `yam/ui/router.py`：基于容器 clear 的 SPA 路由，状态管理简单。
- `yam/ui/theme.py`：基础品牌色与 CSS 变量，缺少阴影/动画/深色/组件级 token。
- `yam/ui/service.py`：数据服务较完整，含搜索筛选、收藏、最近查看、CSV 导出。
- `yam/ui/pages/dashboard.py`：KPI 卡片、快捷入口、最近查看、异常概览已实现。
- `yam/ui/pages/schools.py`：搜索、筛选、卡片/表格视图、收藏、对比、导出已实现。
- `yam/ui/pages/detail.py`、`compare.py`、`favorites.py`：仅标题占位。
- `yam/ui/pages/about.py`：简单 Markdown，缺少更新状态与口径说明。
- `yam/ui/components/cards.py`、`filters.py`