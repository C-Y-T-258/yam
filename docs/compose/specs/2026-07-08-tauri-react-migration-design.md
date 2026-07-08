# [S1] Problem

YAM (研喵) is a graduate school selection tool built with Python + NiceGUI + Quasar. The current UI stack has critical limitations:

- `ui.input()` event binding broken — search只能用timer+JS workaround
- `router.navigate_to()` full page refresh — inline expand状态丢失
- Layout control limited — sidebar width难精确控制
- No native popup overlay — 筛选面板无法按效果图实现
- Dark mode需手动CSS变量
- No built-in animation system — 无法实现"丝滑的动效"

The user wants Notion/Figma level polish with smooth animations. NiceGUI cannot deliver this.

## [S2] Solution Overview

Migrate the UI layer to **Tauri + React + Tailwind CSS + Framer Motion**, keeping the existing Python backend and SQLite database.

Key decisions:
- **Tauri 2.x** for desktop framework (5-10MB包体, 0.3s启动)
- **React 18 + TypeScript** for UI
- **Tailwind CSS** for styling (原子化CSS, 内置暗色模式)
- **Framer Motion** for animations (声明式动效, 物理引擎)
- **Zustand** for state management
- **better-sqlite3** for direct SQLite access

## [S3] Architecture

```
yam-desktop/
├── src-tauri/          # Rust 后端
│   ├── src/
│   │   ├── main.rs     # Tauri 入口
│   │   ├── db.rs       # SQLite 读取（复用 yam.db）
│   │   └── commands.rs # IPC 命令
│   └── Cargo.toml
├── src/                # React 前端
│   ├── components/     # UI 组件
│   ├── hooks/          # 自定义 hooks
│   ├── stores/         # 状态管理
│   ├── lib/            # 工具函数
│   └── App.tsx
├── package.json
└── tauri.conf.json
```

## [S4] Page Mapping (效果图→组件)

| 效果图 | 组件 | 动效 |
|--------|------|------|
| 启动界面 | `SplashScreen.tsx` | 三列滑入动画 |
| 主界面框架 | `AppLayout.tsx` | 侧边栏展开/收起 |
| 学校卡片 | `SchoolCard.tsx` | hover缩放+阴影 |
| 内联展开 | `SchoolDetail.tsx` | accordion展开动画 |
| 对比弹窗 | `CompareModal.tsx` | 淡入+缩放 |
| 表格视图 | `SchoolTable.tsx` | 行入场动画 |
| 筛选面板 | `FilterPopover.tsx` | slide-in动画 |
| 深色模式 | `ThemeProvider.tsx` | CSS transition过渡 |

## [S5] Animation清单

1. **页面切换** — fade + slide (< 300ms)
2. **卡片列表** — stagger入场（每张延迟50ms）
3. **展开详情** — height auto动画 + opacity
4. **弹窗** — scale(0.9→1) + opacity
5. **侧边栏** — width动画 + 内容fade
6. **深色模式** — CSS transition 300ms
7. **搜索过滤** — layout动画（元素位置变化）

## [S6] Data Layer

- 直接读取 `yam.db`（SQLite）
- 复用现有表：schools、departments、score_lines、admission_plans
- Python爬虫脚本保持不变，只重写UI层
- better-sqlite3 synchronous access for simplicity

## [S7] Scope

In scope:
- Tauri project setup
- React component library (所有11个效果图)
- SQLite integration
- Dark mode
- Smooth animations

Out of scope:
- Python爬虫修改
- 数据库schema变更
- 新功能（只还原效果图）

## [S8] Success Criteria

1. 所有11个ChatGPT效果图界面实现
2. 所有动画丝滑流畅（< 300ms过渡）
3. 包体 < 15MB
4. 启动时间 < 1s
5. 现有SQLite数据正常读取
6. 深色/浅色模式切换正常
