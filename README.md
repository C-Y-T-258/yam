# 研喵 YAM

本地优先的考研择校数据工具。

## 当前下一步目标

S001–S012 前端流程已实现。当前全力推进**综合筛选功能**，分为 5 个阶段：

1. **Phase 2：Tauri 数据同步** — 创建同步脚本，让桌面端读取 Python `yam.db` 真实数据。
2. **Phase 3：Tauri 后端查询扩展** — 支持地区多选/一区二区、学习方式、考试方式、专项计划、院校特性、科目分数区间，并动态返回可选项。
3. **Phase 4：前端筛选面板重构** — 研招网式交互，地区多选 + 一区/二区快捷分组，其余条件按真实数据动态渲染。
4. **Phase 5：收藏页同步筛选** — 收藏页复用工作区筛选组件。

Phase 1（Python 数据层扩展）已完成。

详见 [`docs/session-handoff.md`](docs/session-handoff.md)。

## 技术栈

Tauri 2.x + React + TypeScript + Tailwind CSS v4 + Framer Motion，Python 后端负责研招网爬虫与 `yam.db`。

## 免责声明

数据来自公开渠道，仅供学习参考，不保证完全准确。使用本工具产生的任何决策，由用户自行承担责任。
