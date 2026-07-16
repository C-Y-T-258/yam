> 本文档是项目当前状态快照。旧目录 `d:\考研信息整理\yam` 中的历史计划已转移到本目录，原文件已删除。

# YAM 项目当前状态与下一步

## 已完成的里程碑

- **Phase 1 数据层扩展**：Python 后端 `yam.db` 的 `schools` 表已扩展自划线/博士点/双一流/985/省代码/国标代码/排序字段；`departments` 表已扩展学习方式/考试方式/专项计划。
- **Phase 2 Tauri 数据同步**：桌面端通过 `yam/scripts/sync_to_tauri.py` 从 `~/.yam/data/yam.db` 同步真实数据到 `~/.yam/data/yam-desktop.db`，启动时自动检测已同步专业。
- **Phase 3 Tauri 查询扩展**：支持地区多选/一区二区、学习方式、考试方式、院校特性（985/211/双一流/自划线/科研院所/博士点）、专项计划、考试科目、分数区间等过滤。
- **Phase 4 前端筛选面板重构**：地区按研招网顺序、院校层次与考试科目改为展开式多选面板、排序新增默认排序（掌上考研）与国标代码排序、更多筛选加入弹层面板。
- **Phase 5 收藏页同步筛选**：收藏页复用 `WorkspaceFilterPanel` 与 `applyWorkspaceFilters` 前端筛选逻辑。
- **数据采集流程修复**：解决“已有采集任务在运行”死锁、采集为空、旧 fetch_log 全跳过、未采集成功即添加专业、Python CLI 错误信息无法传递到前端、985/211 标签缺失等问题。

## 当前目标（方案 A）

详见 `docs/data-collection-handoff-prompt.md` 中"方案 A：内置登录向导 + 原子启动锁"。

1. **内置研招网登录向导**：检测到未登录时，桌面端直接调用 `DynamicYanZhaoCrawler.login_and_fetch()` 弹出浏览器窗口，用户登录后自动保存 cookie，无需终端命令。
2. **原子启动锁**：Rust 后端将 `CrawlProgress.running` 的检查和设置合并为原子操作，避免并发重复启动。
3. **采集状态机重构**：CrawlingPage 严格区分 5 种状态，统一由 `reset_crawl` / `run_crawl` / `cancel_crawl` 驱动。

## 当前运行方式

```powershell
# 开发模式（同时启动 Vite 前端 + Tauri 窗口）
cd yam-desktop
npm run tauri dev

# 仅检查 Rust 后端
cd yam-desktop/src-tauri
cargo check

# 生产构建
cd yam-desktop
npm run tauri build
```

## 关键文件

| 文件 | 说明 |
|------|------|
| `yam/storage/db.py` | Python 后端 schema 与数据操作 |
| `yam/crawler/yanzhao.py` | 研招网爬虫，含种子自动抓取与异常抛出 |
| `yam/scripts/sync_to_tauri.py` | Python → Tauri DB 同步脚本 |
| `yam-desktop/src-tauri/src/db.rs` | Tauri SQLite schema、查询、FilterOptions |
| `yam-desktop/src-tauri/src/commands.rs` | Tauri 命令，含采集/同步/删除等 |
| `yam-desktop/src/lib/db.ts` | 前端数据访问、类型、mock fallback |
| `yam-desktop/src/pages/WorkspacePage.tsx` | 工作区主页面 |
| `yam-desktop/src/components/WorkspaceFilterPanel.tsx` | 筛选面板组件 |
| `yam-desktop/src/pages/MajorSelectPage.tsx` | 专业选择页面 |
| `yam-desktop/src/pages/CrawlingPage.tsx` | 数据采集页面 |
| `yam-desktop/src/stores/appStore.ts` | 全局状态管理 |

## 已知未解决问题

详见 `docs/known-issues.md`：

- **ISSUE-002**：网页端 `Workspace` 页面在浏览器自动化工具中快照超时（不影响桌面端真实使用）。

## 注意事项

- 桌面端与网页端共用同一套 React 前端代码。
- 网页端无法访问本地文件系统或 Python 后端，使用 `lib/db.ts` 中的 mock fallback。
- 桌面端连接 `~/.yam/data/yam-desktop.db`。
- UI 中统一使用“刷新数据”，不使用“同步”。
- Bug 跟踪使用 `docs/known-issues.md`，不使用 GitHub Issues（远程仓库未配置）。
