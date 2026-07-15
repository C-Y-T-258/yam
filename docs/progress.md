# 进度跟踪 - 2026-07-13

> 本文件用于上下文压缩后恢复进度。每完成一步立即更新。
> 当前任务：修复选择专业后采集数据为空的问题。

## 三个里程碑

- **A：数据层 + 同步 + Tauri 查询**（学校新字段、研招网省份顺序、掌上考研排名抓取、固定 level_tags、新排序字段）
- **B：前端筛选、排序、刷新合并**（院校层次/考试科目改展开式选择框、地区研招网顺序、新增两个排序选项、合并"同步后端数据"到"刷新数据"）
- **C：专业管理页补齐 + 自动同步**（ManageMajorsModal 接真实数据、新增刷新/删除按钮、专业切换自动同步）

## 当前状态（开始前）

### 已验证的回退范围
- [WorkspaceFilterPanel.tsx](file:///d:/yam/yam-desktop/src/components/WorkspaceFilterPanel.tsx)：院校层次、考试科目是平铺 tag，未改成展开式选择框；排序下拉只有 6 项（最低分/招生人数/名称 × asc/desc）。
- [db.ts](file:///d:/yam/yam-desktop/src/lib/db.ts)：`WorkspaceFilters.sortBy` 类型只有 `'min_score' | 'enroll_count' | 'name'`；没有 `school_code`/`province_code`/`is_985`/`display_order` 字段。
- [db.rs](file:///d:/yam/yam-desktop/src-tauri/src/db.rs)：`get_workspace_schools` 的 `sort_by` 只支持 `min_score/enroll_count/name`；`get_workspace_filter_options` 动态提取 level_tags（不固定显示 985/211/双一流等）。
- [sync_to_tauri.py](file:///d:/yam/yam/scripts/sync_to_tauri.py)：`load_schools` 没有读取 `school_code/province_code/is_985/display_order`；`load_schools` 按 `name` 排序；没有调用掌上考研排名接口。
- [WorkspacePage.tsx](file:///d:/yam/yam-desktop/src/pages/WorkspacePage.tsx)：同时存在"刷新数据"（loadWorkspaceData('')）和"同步后端数据"（handleSync）两个按钮。
- [Modals.tsx](file:///d:/yam/yam-desktop/src/pages/Modals.tsx)：`ManageMajorsModal` 使用 `MOCK_AVAILABLE_MAJORS`；没有刷新/删除按钮。

### Tauri DB 现状
- 应该残留上次同步的 `085410`（217 所学校），schema 没新字段。
- 用户源库 `~/.yam/data/yam.db` 实际有 `085410` 数据。

## 进度记录

### 里程碑 A：数据层 + 同步 + Tauri 查询

- [x] A-1：Python 后端 `schools` schema 新增字段（`school_code`/`province_code`/`is_985`/`is_211`/`display_order`），`_infer_level` 修正（科研院所独立识别）
- [x] A-2：`sync_to_tauri.py` 读取新字段、调用掌上考研排名、降级到 school_code 升序
- [x] A-3：Tauri `db.rs` schema + `WorkspaceSchool` 结构体 + `sort_by` 支持 `default/school_code`
- [x] A-4：Tauri `get_workspace_filter_options` 固定 level_tags 显示顺序、省份按研招网顺序
- [x] A-5：验证 - 重新同步 `085410`，217 所学校、156 211、5 科研院所、display_order 按 school_code 升序、省份含"内蒙古"

### 里程碑 A 实现摘要

**Python 后端**：
- [yam/crawler/yanzhao.py](file:///d:/yam/yam/crawler/yanzhao.py) `_infer_level` 增加"科研院所"独立识别（按名称含研究院/研究所/科学院）
- [yam/storage/db.py](file:///d:/yam/yam/storage/db.py) v3 schema 迁移：schools 表新增 school_code/province_code/is_985/is_211/display_order 列；`save_school` 写入新字段
- [yam/crawler/zhangshangkaoyan.py](file:///d:/yam/yam/crawler/zhangshangkaoyan.py) 新增 `fetch_school_rank_map(major_code)`，尝试调用候选接口，失败返回空 dict 触发降级

**同步脚本**：
- [yam/scripts/sync_to_tauri.py](file:///d:/yam/yam/scripts/sync_to_tauri.py)：
  - `load_schools` 动态适配新旧 schema（缺字段补默认值）
  - `load_seed_index` 从种子文件回填 school_code/province_code/is_985/is_211
  - `_normalize_province` 省份简写归一化（"内蒙"→"内蒙古"）
  - `_is_research_institute` + `_enrich_school_fields` 修正科研院所 level、根据 level 文本反推 is_985/is_211/double_first_class
  - `apply_zhangshangkaoyan_rank` 掌上考研排名抓取，失败降级到 school_code 升序

**Tauri 后端**：
- [yam-desktop/src-tauri/src/db.rs](file:///d:/yam/yam-desktop/src-tauri/src/db.rs)：
  - schema migrate_schema 增加 5 个新列
  - `WorkspaceSchool` 结构体扩展 5 个字段
  - `get_workspace_schools` SELECT 增加 5 列、`sort_by` 支持 `default`(display_order) 和 `school_code`
  - 新增 `YANZHAO_PROVINCE_ORDER` 常量（31 省份研招网顺序）
  - 新增 `LEVEL_TAG_ORDER` 常量（7 个固定标签）
  - `get_workspace_filter_options` 省份按研招网顺序排序、level_tags 固定返回全部 7 个
  - levels 过滤新增"985/211/双一流/博士点"分支（基于独立字段而非 level LIKE）

### 里程碑 B：前端筛选、排序、刷新合并

- [x] B-1：`db.ts` 扩展 `WorkspaceFilters.sortBy` 联合类型（加 `default`/`school_code`）、`WorkspaceSchool` 新字段 5 个、`isResearchInstitute` 加"研究生院"、`applyWorkspaceFilters` levels 分支新增 985/211/双一流/博士点、sort 加 default/school_code
- [x] B-2：`WorkspaceFilterPanel.tsx` 院校层次改展开式选择框（按钮+浮层，固定 7 标签）
- [x] B-3：`WorkspaceFilterPanel.tsx` 考试科目改展开式选择框（3 分组：外语/业务课一/业务课二）
- [x] B-4：`WorkspaceFilterPanel.tsx` 排序下拉新增"默认排序（掌上考研）""按国标代码排序（研招网）"
- [x] B-5：`WorkspacePage.tsx` 移除独立"同步后端数据"按钮，"刷新数据"按钮整合 sync + load
- [x] B-6：`majorCode` 切换时自动调用 sync + load + loadFilterOptions + loadFavorites + resetAllFilters（sync 失败降级使用 Tauri DB 现有数据）
- [x] B-7：`npm run build` 通过

### 里程碑 B 实现摘要

**前端类型层** ([db.ts](file:///d:/yam/yam-desktop/src/lib/db.ts))：
- `WorkspaceSchool` 扩展 5 个字段（school_code/province_code/is_985/is_211/display_order）
- `WorkspaceFilters.sortBy` 联合类型加 `'default' | 'school_code'`
- `isResearchInstitute` 增加"研究生院"识别
- `applyWorkspaceFilters` levels 分支基于独立字段而非 level LIKE
- mock 数据补全新字段，sort 函数加 default/school_code 分支

**筛选 UI** ([WorkspaceFilterPanel.tsx](file:///d:/yam/yam-desktop/src/components/WorkspaceFilterPanel.tsx))：
- 院校层次、考试科目改为展开式下拉面板（按钮 + 浮层 + 清空按钮）
- 浮层 z-30，max-w/max-h 约束防越界
- 排序下拉顶部新增两个研招网/掌上考研排序选项

**工作区页面** ([WorkspacePage.tsx](file:///d:/yam/yam-desktop/src/pages/WorkspacePage.tsx))：
- 移除独立"同步后端数据"按钮
- "刷新数据"按钮调用 handleSync（sync + load + loadFilterOptions）
- useEffect[majorCode] 自动调用 sync + fetchWorkspaceData + loadFilterOptions + loadFavorites + resetAllFilters
- sync 失败时降级使用现有 Tauri DB 数据，不阻塞加载

### 里程碑 C：专业管理页补齐 + 自动同步

> 用户决策（2026-07-13）：只做切换可见性 + 自动刷新，不新增删除按钮。"删除/保留管理"走热数据保留策略（按最近查询次数计算），暂缓实现。

- [x] C-1：`appStore.ts` 新增 `visibleMajorCodes` 字段 + zustand `persist` 中间件持久化到 localStorage（key: `yam-app-store`）；新增 `setVisibleMajorCodes` / `toggleVisibleMajor` actions
- [x] C-2：`ManageMajorsModal` 接真实 `crawledMajors` 数据；勾选状态绑定 `visibleMajorCodes`；确认时 `setVisibleMajorCodes` + 对每个可见专业调用 `syncWorkspaceData` + 显示进度条；完成后触发 `onConfirm` 回调关闭弹窗
- [x] C-3：`App.tsx` 新增 `workspaceRefreshNonce` 状态；`ManageMajorsModal.onConfirm` 递增 nonce；`WorkspacePage` 接 `refreshNonce` prop，`useEffect[refreshNonce]` 重新加载 workspace 数据
- [x] C-4：`WorkspacePage` 顶部 `displayMajors` 按 `visibleMajorCodes` 过滤；`majorCode` fallback 到第一个可见专业；隐藏当前专业时自动 `setCurrentMajor` 切换
- [x] C-5：编译验证 - `npm run build` 通过；`cargo check` 通过；剩余 tsc 错误均为预存在的历史问题（Header/SchoolCard/SplashScreen 等未使用导入，clsx/tailwind-merge 缺失）
- [~] C-6：用户验证 - 待用户测试 ManageMajorsModal 功能

**已跳过（按用户决策）**：
- ~~每行新增"删除"按钮~~ - 用户要求走热数据保留策略
- ~~Rust 后端 `delete_workspace_major` 命令~~ - 同上
- ~~热数据保留策略实现~~ - 暂缓，后续按"最近查询次数"实现自动清理

## 关键文件清单

| 文件 | 里程碑 | 改动内容 |
|---|---|---|
| `d:\yam\yam\crawler\yanzhao.py` | A | `_infer_level` 修正、`fetch_schools` 保留新字段 |
| `d:\yam\yam\storage\db.py` | A | schema 新字段、`save_school` 写入 |
| `d:\yam\yam\scripts\sync_to_tauri.py` | A | 读取新字段、调用掌上考研排名、降级排序 |
| `d:\yam\yam-desktop\src-tauri\src\db.rs` | A/B | schema、结构体、`sort_by`、`get_workspace_filter_options` |
| `d:\yam\yam-desktop\src-tauri\src\commands.rs` | C | `delete_workspace_major` 命令 |
| `d:\yam\yam-desktop\src-tauri\src\main.rs` | C | 注册命令 |
| `d:\yam\yam-desktop\src\lib\db.ts` | B | 类型扩展 |
| `d:\yam\yam-desktop\src\components\WorkspaceFilterPanel.tsx` | B | 院校层次/考试科目展开式选择框、排序选项 |
| `d:\yam\yam-desktop\src\pages\WorkspacePage.tsx` | B | 合并刷新按钮、自动同步 |
| `d:\yam\yam-desktop\src\pages\Modals.tsx` | C | `ManageMajorsModal` 真实数据 + 刷新/删除按钮 |

## 选择专业采集数据为空问题修复

- [x] 定位原因：`YanZhaoCrawler.fetch_schools()` 依赖本地种子文件，缺失时直接返回空列表。
- [x] 修复 `yam/crawler/yanzhao.py`：种子缺失时尝试自动调用 `DynamicYanZhaoCrawler` 抓取；失败时输出明确日志。
- [x] 修复 `yam-desktop/src/stores/appStore.ts`：新增专业自动加入 `visibleMajorCodes`；新增 `updateMajor` action。
- [x] 修复 `yam-desktop/src/pages/CrawlingPage.tsx`：同步完成后拉取 `fetchAvailableMajors` 并更新 `schoolCount`/`lastUpdated`。
- [x] 修复 `MajorSelectPage.tsx` / `SplashScreen.tsx`：专业学位类别无研究方向时不再错误传递类别代码。
- [x] 更新 `docs/known-issues.md`：记录 ISSUE-004。

## 采集任务取消按钮死锁修复（2026-07-16）

- **背景**：通过 CDP 直接调用 Tauri 命令验证采集流程时，发现"取消"按钮只清前端状态、不停止 Rust 端 Python 子进程，导致死锁。
- **AI 自测结果**：
  1. `run_crawl('085410')` → `running=true`，`total=217`，Python 子进程启动。
  2. 等待 90 秒，`current=0` 不变（Python 卡在网络请求），无超时反馈。
  3. 直接 kill Python 进程后，Rust 端 `running=true` 永久保持。
  4. 再次调用 `run_crawl` → 被拒绝"已有采集任务在运行"。
- **修复内容**：
  - [x] `yam-desktop/src-tauri/src/commands.rs`：
    - 新增 `cancel_crawl` 命令，调用 `taskkill /F /T` kill 子进程并重置 `running=false`/`done=true`。
    - `CrawlProgress` 新增 `child_pid: Option<u32>` 字段（`#[serde(skip)]`）。
    - `run_crawl_task` 启动后保存 `child_pid`，结束时清除。
    - 添加 90 秒超时检测：`last_progress_time.elapsed() > 90s` 时 kill 子进程并设置 error。
    - 设置 `PYTHONUNBUFFERED=1` 环境变量让 stdout 实时刷新。
    - 取消时保留 "用户取消采集任务" 错误信息，不被 "采集脚本异常退出" 覆盖。
    - 在 `for line in reader.lines()` 循环开头检查 `!p.running && p.done` 实现 cancel 响应。
  - [x] `yam-desktop/src-tauri/src/main.rs`：注册 `cancel_crawl` 命令。
  - [x] `yam-desktop/src/lib/db.ts`：新增 `cancelCrawl()` 函数。
  - [x] `yam-desktop/src/pages/CrawlingPage.tsx`：
    - `handleCancel` 改为 async，调用 `cancelCrawl()` 并显示日志。
    - `handleBackground` 改为"返回工作区"语义：不取消采集，仅清除前端 interval，保留 Rust 端任务继续运行。
- **验证结果**（通过 CDP 直接调用 Tauri 命令）：
  1. 启动采集 → `running=true`，Python 子进程 PID 出现。
  2. 调用 `cancel_crawl` → `running=false`，`done=true`，`error="用户取消采集任务"`，Python 子进程被 kill。
  3. 再次 `run_crawl` → 成功启动，不再死锁。
  4. 重复操作 2 次均成功。
- **编译验证**：`cargo check` 通过，`npm run build` 通过。
- **记录**：ISSUE-006 已添加到 `docs/known-issues.md`。
- **后续待办**：
  - 由用户进行桌面端手动测试（点击"取消"按钮的真实 UI 行为）。
  - 通过问答框验证任务完成。
  - 可选优化：超时阈值 90 秒可让用户在设置中配置。
- [x] 验证：`npm run build` 通过；`cargo check` 通过；Python 语法检查通过。

## 后台运行返回采集页错误重启修复（2026-07-16）

- **背景**：ISSUE-006 修复后通过 CDP 真实点击 UI 测试时，发现 `CrawlingPage` 的 `useEffect` 在 `getCrawlProgress()` 返回 `running=false` 时直接调用 `runCrawl`，忽略 `done` 标志。用户点击"后台运行"后再次回到采集页，会错误重启采集，覆盖已完成的结果。
- **AI 自测结果**（通过 CDP 真实点击 UI）：
  1. 选择 085400 → 进入采集页，`running=true`，采集启动。
  2. 点击"后台运行" → 跳到数据就绪页，`crawlTarget` 保留。
  3. 通过 `cancel_crawl` 模拟采集完成，后端 `done=true, error="用户取消采集任务"`。
  4. 从 TopNav 点击"数据采集"回到采集页 → 修复前会重启采集，修复后**未重启**，后端仍为 `done=true`。
- **修复内容**：
  - [x] `yam-desktop/src-tauri/src/commands.rs`：新增 `reset_crawl` 命令，清空 `CrawlProgress` 到默认状态。
  - [x] `yam-desktop/src-tauri/src/main.rs`：注册 `reset_crawl` 命令。
  - [x] `yam-desktop/src/lib/db.ts`：新增 `resetCrawl()` 前端函数。
  - [x] `yam-desktop/src/pages/MajorSelectPage.tsx`：`handleConfirm` 改为 async，调用 `resetCrawl()` 后再设置 `crawlTarget`。
  - [x] `yam-desktop/src/pages/MajorManagementPage.tsx`：`handleUpdate` 同样调用 `resetCrawl()` 后再跳转采集页。
  - [x] `yam-desktop/src/pages/CrawlingPage.tsx`：`useEffect` 中区分 `running`/`done`/`major_code` 三种状态，避免错误重启采集。
- **验证结果**：通过 CDP 真实点击 UI 验证修复行为符合预期（详见 ISSUE-007）。
- **编译验证**：`cargo check` 通过；`npm run build` 通过。
- **记录**：ISSUE-007 已添加到 `docs/known-issues.md`。
- **后续待办**：
  - 由用户进行桌面端手动测试（点击"后台运行"后返回采集页的真实 UI 行为）。
  - 通过问答框验证任务完成。

## 采集进度可视化与空数据修复（2026-07-16）

- **背景**：用户反馈三类问题：(1) 数据采集进度看不到；(2) 离开采集页面后无法看到后台任务进度；(3) 专业删光后显示默认模板数据。
- **修复内容**：
  - [x] **ISSUE-008 专业删光后显示默认模板数据**：
    - `yam-desktop/src/pages/MajorManagementPage.tsx`：删除 `MOCK_MAJORS` 常量，改为 `crawledMajors.length === 0` 时显示空状态 UI（FolderOpen 图标 + 提示文字）。
    - `yam-desktop/src/pages/DataReadyPage.tsx`：删除 `MOCK_READY_MAJORS` 常量，同样显示空状态 UI，并禁用"进入工作区"按钮。
  - [x] **ISSUE-009 离开采集页面后无法看到后台采集任务进度**：
    - 新增 `yam-desktop/src/components/BackgroundTaskPanel.tsx`：全局浮动面板（`fixed bottom-4 left-4`），每 1.5s 轮询 `getCrawlProgress()`，显示专业名、进度条、当前/总数、百分比。
    - 点击面板跳转采集页；X 按钮可隐藏；任务完成后 3s 自动隐藏。
    - 仅在 `running=true` 或 `done=true && error` 时显示，避免重复打扰。
    - `yam-desktop/src/App.tsx`：挂载 `BackgroundTaskPanel`，所有页面均可见。
  - [x] **ISSUE-010 采集进度显示不直观**：
    - `yam-desktop/src/pages/CrawlingPage.tsx`：改进进度轮询中的状态显示逻辑。
    - `done` 状态显示"采集已结束"或"采集完成"；`total > 0` 显示 `current_name` 或 `进度 x/y`；`running` 但 `total=0` 显示"正在获取院校列表..."。
- **验证结果**：
  - 通过 CDP 真实点击 UI 验证 BackgroundTaskPanel 在采集页和工作区页均显示"后台采集任务 人工智能 0/217 所 0%"。
  - MajorManagementPage 删光所有专业后显示"暂无专业数据"空状态 UI。
  - CrawlingPage 进度卡片在 total=0 时显示"正在获取院校列表..."而非"准备中..."。
- **编译验证**：`cargo check` 通过；`npm run build` 通过。
- **记录**：ISSUE-008/009/010 已添加到 `docs/known-issues.md`。
- **后续待办**：
  - 由用户进行桌面端手动测试（启动采集 → 离开页面观察左下角面板 → 删除所有专业验证空状态）。
  - 通过问答框验证任务完成。

## 采集失败空专业与面板信息优化（2026-07-16）

- **背景**：用户反馈两类问题：(1) 采集失败/取消的专业仍会出现在专业管理列表中，进入后无数据；(2) 左下角后台任务面板信息不够直观，难以判断任务真实状态。
- **修复内容**：
  - [x] **ISSUE-011 采集失败仍创建空专业**：
    - `yam-desktop/src/pages/CrawlingPage.tsx`：
      - 轮询 `done=true` 分支区分三种情况：`error` 非空 → 仅设置错误，不调用 `handleSync`；`success=0` → 提示"未取得数据"；`success>0` → 调用 `handleSync`。
      - `handleSync` 同步后通过 `fetchAvailableMajors` 检查该专业 `school_count`，为 0 时不 `addMajor`，设置错误提示并退出。
  - [x] **ISSUE-012 BackgroundTaskPanel 显示不够直观**：
    - `yam-desktop/src/components/BackgroundTaskPanel.tsx` 完全重写：
      - 头部状态变色：运行中（蓝色 + Loader2 旋转）、出错（红色 + AlertCircle）、已结束（琥珀色 + CheckCircle2）。
      - 显示专业名 + 专业代码（font-mono）。
      - 新增 success/failed/skipped 计数行（✓/✗/↷ 图标）。
      - 新增"已用时 MM:SS"计时器（每秒刷新）和"更新于 HH:MM:SS"时间戳。
      - 底部增加"点击查看 →"提示。
      - 任务完成无错误后 8 秒自动隐藏（原 3 秒延长到 8 秒以便查看结果）。
- **验证结果**：
  - **ISSUE-011**：通过 CDP 真实点击 UI 测试（选 085400 → 取消），Tauri DB 可用专业数从 1 保持为 1，表格行数未增加。
  - **ISSUE-012**：通过 CDP 验证面板在运行中显示"后台采集任务 未知专业 085410 0/217 所 0% ✓0 ✗0 已用时 0:09 点击查看 →"；出错时显示"采集任务出错 未知专业 085410 用户取消采集任务 0% ✓0 ✗0 更新于 01:49:17 点击查看 →"；重置后自动隐藏。
- **编译验证**：`cargo check` 通过；`npm run build` 通过。
- **记录**：ISSUE-011/012 已添加到 `docs/known-issues.md`。
- **后续待办**：
  - 由用户进行桌面端手动测试。
  - 通过问答框验证任务完成。

### 补充修复（2026-07-15）

- [x] 定位问题：动态抓取失败时 `yanzhao.py` 直接返回空列表，前端仍显示空数据。
- [x] 修复 `yam/crawler/yanzhao.py`：种子缺失且动态抓取失败时抛出 `LoginRequiredError`/`RuntimeError`。
- [x] 修复 `yam/crawler/dynamic.py`：无登录 cookie 时立即失败，避免长时间拉起浏览器。
- [x] 修复 `yam/cli.py`：新增 `--force` 标志；捕获种子获取异常并输出清晰错误提示。
- [x] 修复 `yam-desktop/src-tauri/src/commands.rs`：桌面端采集传入 `--force`，避免旧 `fetch_log` 全跳过。
- [x] 更新 `docs/known-issues.md`：补充 ISSUE-004 修复说明。
- [x] 验证：`npm run build` 通过；`cargo check` 通过；Python 语法检查通过；CLI 测试 085400 立即提示登录；CLI 重新抓取 085410 成功 217 所并同步到 Tauri DB。

### 桌面端采集状态与添加时机修复（2026-07-15 晚）

- [x] 定位问题：`MajorSelectPage.tsx` 在选择专业时立即 `addMajor`，导致未采集成功就出现在专业管理页。
- [x] 修复 `MajorSelectPage.tsx`：移除 `handleConfirm` 中的 `addMajor` 调用，仅设置 `crawlTarget`。
- [x] 修复 `CrawlingPage.tsx`：同步成功后（`syncWorkspaceData` 成功）再调用 `addMajor`，并更新 `schoolCount`/`lastUpdated`。
- [x] 验证：
  - `npm run build` 通过；`cargo check` 通过。
  - 浏览器模式自测：专业学位旧交互（左侧平铺 + 右侧研究方向滑入/滑出）正常；“全部”选项三级页面（门类 → 学科类别 → 专业）正常；采集失败不会提前添加专业。
  - CLI 完整采集 085410：217 所成功、0 失败、0 跳过；同步到 Tauri DB 后 `workspace_schools` 表确认 217 条记录。
  - 桌面端应用已重新启动，启动时会从 Tauri DB 自动加载已同步专业。

---

## 关键设计决策

1. **掌上考研排名抓取**：用户选择 A 方案 - 尝试抓真实排名，失败降级到 `school_code` 升序。
2. **管理显示专业**：支持彻底删除专业及其同步数据。
3. **省份研招网顺序**：北京、天津、河北、山西、内蒙古、辽宁、吉林、黑龙江、上海、江苏、浙江、安徽、福建、江西、山东、河南、湖北、湖南、广东、海南、广西、四川、重庆、贵州、云南、西藏、陕西、甘肃、青海、宁夏、新疆。
4. **level_tags 固定显示**：985、211、双一流、自划线、科研院所、博士点、普通本科（不再依赖数据动态提取）。
