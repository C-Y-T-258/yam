# Development Plan: YAM 考研择校桌面应用

*Generated on 2026-07-08 by Vibe Feature MCP*
*Workflow: [epcc](https://codemcp.github.io/workflows/workflows/epcc)*

## Goal
将现有 Python + NiceGUI 考研择校应用重构为 Electron + React 桌面应用，实现 Notion/Figma 级别的现代 UI 和丝滑动效。

### 核心需求
1. 桌面应用体验（双击打开，原生窗口）
2. 现代 UI（Notion/Figma 级别）
3. 丝滑动效（Framer Motion）
4. 侧边栏、卡片、表格、弹窗布局
5. 文本输入、复选框、下拉框等事件处理
6. 暗色模式支持
7. 保持现有 Python 后端和 SQLite 数据库

## Key Decisions
1. **技术栈选择**：Electron + React + TypeScript + Tailwind CSS + Framer Motion
2. **数据库访问**：Electron 主进程使用 better-sqlite3 直接读取现有 SQLite 数据库
3. **UI 组件库**：shadcn/ui（高质量、可定制）
4. **构建工具**：electron-vite（快速开发体验）
5. **项目结构**：`electron/` 主进程 + `src/` 前端 + `shared/` 共享类型

## Notes
- 现有 Python 后端保留，CLI 工具继续使用
- SQLite 数据库路径：`D:\yam\data\yam.db`
- 数据库包含 8 张表：schools, departments, score_lines, admission_plans, fetch_log, snapshots, favorites, recent_views

## Architecture

### 项目结构
```
yam-desktop/
├── electron/                    # Electron 主进程
│   ├── main.ts                  # 主进程入口
│   ├── preload.ts               # 预加载脚本
│   ├── database/                # 数据库操作
│   │   ├── index.ts             # 数据库连接
│   │   ├── schools.ts           # 院校查询
│   │   ├── departments.ts       # 院系查询
│   │   ├── scores.ts            # 分数线查询
│   │   └── favorites.ts         # 收藏操作
│   └── ipc/                     # IPC 处理器
│       └── handlers.ts
├── src/                         # React 前端
│   ├── App.tsx                  # 根组件
│   ├── main.tsx                 # 入口
│   ├── components/              # 通用组件
│   │   ├── ui/                  # shadcn/ui 组件
│   │   ├── layout/              # 布局组件
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── MainLayout.tsx
│   │   └── schools/             # 业务组件
│   │       ├── SchoolCard.tsx
│   │       ├── SchoolTable.tsx
│   │       ├── FilterPanel.tsx
│   │       └── CompareModal.tsx
│   ├── pages/                   # 页面
│   │   ├── SchoolsPage.tsx      # 院校列表
│   │   ├── SchoolDetailPage.tsx # 院校详情
│   │   ├── ComparePage.tsx      # 对比页面
│   │   └── SettingsPage.tsx     # 设置页面
│   ├── hooks/                   # 自定义 Hooks
│   │   ├── useSchools.ts
│   │   ├── useFilters.ts
│   │   └── useTheme.ts
│   ├── lib/                     # 工具函数
│   │   └── utils.ts
│   └── styles/                  # 样式
│       └── globals.css
├── shared/                      # 共享类型
│   └── types.ts
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── electron.vite.config.ts
```

### IPC 通信设计
```typescript
// 预加载脚本暴露的 API
window.api = {
  // 院校查询
  getSchools: (majorCode: string, filters: FilterParams) => Promise<School[]>,
  getSchoolDetail: (schoolId: string, majorCode: string) => Promise<SchoolDetail>,
  
  // 收藏操作
  addFavorite: (schoolId: string, majorCode: string) => Promise<void>,
  removeFavorite: (schoolId: string, majorCode: string) => Promise<void>,
  getFavorites: (majorCode: string) => Promise<string[]>,
  
  // 分数线查询
  getScoreLines: (schoolId: string, majorCode: string) => Promise<ScoreLine[]>,
  
  // 招生计划查询
  getAdmissionPlans: (schoolId: string, majorCode: string) => Promise<AdmissionPlan[]>,
  
  // 统计数据
  getStats: (majorCode: string) => Promise<DashboardStats>,
}
```

### UI 设计规范
- **配色**：支持亮色/暗色模式，主色调蓝色
- **字体**：系统字体栈（-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto）
- **间距**：4px 基准网格
- **圆角**：8px（卡片）、4px（按钮）、12px（弹窗）
- **阴影**：sm（卡片）、md（弹窗）、lg（悬浮）

## Explore
### Tasks
- [x] 创建开发计划文件
- [x] 分析现有 Python 后端结构
- [x] 分析 SQLite 数据库 schema
- [x] 分析现有 NiceGUI UI 代码
- [x] 研究桌面 UI 框架对比

### Completed
- [x] Created development plan file
- [x] 分析了 8 个桌面 UI 框架
- [x] 确认使用 Electron + React 技术栈
- [x] 设计了项目架构和 IPC 通信

## Plan
### Tasks
- [x] 创建 Electron + React 项目结构（electron-vite 模板）
- [x] 配置 TypeScript + ESLint + Prettier
- [x] 集成 Tailwind CSS
- [x] 集成 shadcn/ui 组件库
- [x] 集成 Framer Motion 动画库
- [x] 实现 Electron 主进程入口（main.ts）
- [x] 实现预加载脚本（preload.ts）
- [x] 实现数据库连接模块（database/index.ts）
- [x] 实现院校查询 API（database/schools.ts）
- [x] 实现院系查询 API（database/departments.ts）
- [x] 实现分数线查询 API（database/scores.ts）
- [x] 实现收藏操作 API（database/favorites.ts）
- [x] 实现 IPC 处理器（ipc/handlers.ts）
- [x] 定义共享类型（shared/types.ts）
- [x] 实现主布局组件（MainLayout + Sidebar + Header）
- [x] 实现院校列表页面（SchoolsPage）
- [x] 实现院校卡片组件（SchoolCard）
- [x] 实现筛选面板组件（FilterPanel）
- [x] 实现院校详情页面（SchoolDetailPage）
- [ ] 实现对比功能（CompareModal + ComparePage）
- [x] 实现暗色模式切换
- [x] 添加页面过渡动画（Framer Motion）
- [x] 添加卡片 hover/click 动画
- [x] 添加列表项进出动画

### Completed
- [x] 创建 Electron + React 项目结构
- [x] 配置 TypeScript 和 Tailwind CSS
- [x] 实现数据库访问层
- [x] 实现 IPC 通信
- [x] 实现主布局和导航
- [x] 实现院校列表页面
- [x] 实现院校详情页面
- [x] 实现筛选功能
- [x] 添加 Framer Motion 动画

## Code
### Tasks
- [x] 实现数据库查询封装
- [x] 实现院校筛选逻辑
- [x] 实现院校排序逻辑
- [ ] 实现搜索功能
- [x] 实现收藏/取消收藏功能
- [ ] 实现导出功能（CSV/JSON）

### Completed
- [x] 数据库连接和查询模块
- [x] 院校查询和筛选 API
- [x] 收藏操作 API
- [x] IPC 处理器
- [x] 共享类型定义

## Commit
### Tasks
- [ ] 初始项目搭建提交
- [ ] 数据库访问层提交
- [ ] UI 布局提交
- [ ] 功能实现提交
- [ ] 动画效果提交

### Completed
*None yet*


---
*This plan is maintained by the LLM. Tool responses provide guidance on which section to focus on and what tasks to work on.*
