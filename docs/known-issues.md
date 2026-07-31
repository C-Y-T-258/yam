# 已知问题与 Bug 跟踪

## 记录规范

- 编号：ISSUE-XXX 递增
- 严重程度：blocker / high / medium / low
- 状态：open / in-progress / fixed
- 每个问题包含：描述、复现步骤、期望行为、实际行为、建议修复方向

---

## ISSUE 状态汇总（2026-07-31）

| ISSUE | 严重程度 | 状态 | 简述 |
|---|---|---|---|
| ISSUE-001 | high | fixed | 桌面端"同步"概念不符合用户直觉 |
| ISSUE-002 | medium | fixed | 网页端 Workspace 页面快照超时 |
| ISSUE-003 | high | fixed | Tauri v2 环境判断错误 |
| ISSUE-004 | high | fixed | 选择专业后采集数据为空或提前添加专业 |
| ISSUE-005 | medium | fixed | 专业学位选择左侧栏动画不平滑 |
| ISSUE-006 | high | fixed | 取消采集按钮无法停止后端任务导致死锁 |
| ISSUE-007 | medium | fixed | 从"后台运行"返回采集页会错误重启采集任务 |
| ISSUE-008 | medium | fixed | 专业删光后显示默认模板数据 |
| ISSUE-009 | medium | fixed | 离开采集页面后无法看到后台采集任务进度 |
| ISSUE-010 | low | fixed | 采集进度显示不直观，total=0 时只显示"准备中..." |
| ISSUE-011 | high | fixed | 采集失败/取消仍创建无数据的空专业 |
| ISSUE-012 | medium | fixed | BackgroundTaskPanel 显示信息不够直观 |
| ISSUE-013 | high | fixed | Python CLI 错误信息无法传递到 Tauri 前端 |
| ISSUE-014 | high | fixed | 工作区院校层级 985/211 标签缺失 |
| ISSUE-015 | high | fixed | 研招网 zydws.do 翻页接口偶发返回"请登录"（四阶段方案 100% 覆盖） |
| ISSUE-016 | medium | fixed | 采集错误时 CrawlingPage 错误横幅显示完整 Python traceback |
| ISSUE-017 | high | fixed | 桌面端采集超时对无种子专业过短（300s 自适应 + 种子抓取心跳） |
| ISSUE-018 | medium | fixed | 085400 电子信息 seed 完整但 zys.do 返回 totalCount=0（真实情况） |
| ISSUE-019 | high | fixed | 专业选择页面可供选择的专业不全（实时查询 majors_realtime.json，2255 majors，无 enabled 字段） |
| ISSUE-020 | medium | fixed | BackgroundTaskPanel 用时计时器不会重置 |
| ISSUE-021 | medium | fixed | 切出数据采集页面再切回误报"已有采集任务在运行" |
| ISSUE-022 | medium | fixed | 已统一实时目录与采集入口数据源，移除 enabled 拒绝分支，并增加结构化失败分类 |
| ISSUE-023 | high | fixed | 专业目录更新流程耗时过长（httpx 方案 7-8 分钟） |
| ISSUE-024 | high | fixed | 登录状态缺乏统一管理 |
| ISSUE-025 | medium | fixed | 分数线数据未同步到工作区（分级匹配 98.5% 覆盖率） |
| ISSUE-026 | medium | fixed | 工作区"导出"按钮无任何功能（CSV 导出） |
| ISSUE-027 | medium | fixed | 工作区多专业合并展示 + 双视图切换（院校视图/招生计划视图） |
| ISSUE-028 | low | fixed | 导出格式扩展 CSV/Excel/JSON（CSV/Excel/JSON × 院校/招生计划视图，手动测试通过） |
| ISSUE-029 | medium | fixed | 数据采集流程串行 requests 调用（httpx 并发 5 分钟 100% 成功） |
| ISSUE-030 | high | fixed | 分数线原始证据丢失、按列 MIN、跨年主分数及校级结果复制导致语义和数值失真 |
| ISSUE-031 | medium | open | 来源实体映射、时间版本、未知状态和计划稳定键仍需独立建模 |

**统计**：共 31 个 ISSUE，30 个 fixed，0 个 partial-fixed，0 个 in-progress，1 个 open。

**下一步优先级**：ISSUE-030 已完成用户可见闭环；后续按 ISSUE-031 分阶段处理来源映射、时间版本和未知状态，不阻塞当前发布。

---

## ISSUE-001：桌面端“同步”概念不符合用户直觉

- **严重程度**：high
- **状态**：fixed
- **描述**：用户抓取数据后打开桌面端，需要手动执行同步脚本或点击“同步后端数据”按钮才能看到数据，不符合“打开即用”的直觉。
- **修复位置**：
  - `yam-desktop/src/pages/WorkspacePage.tsx`：移除独立“同步后端数据”按钮，“刷新数据”按钮整合 sync + load。
  - `yam-desktop/src/App.tsx`：启动时自动检测已同步专业并默认选中。
  - `yam-desktop/src/pages/MajorManagementPage.tsx` / `MajorSelectPage.tsx`：选择/切换专业后自动调用 `syncWorkspaceData`。
- **备注**：界面中已统一使用“刷新数据”替代“同步”。

---

## ISSUE-002：网页端 Workspace 页面在浏览器自动化工具中快照超时

- **严重程度**：medium
- **状态**：fixed
- **描述**：使用 Playwright/浏览器工具访问 `http://localhost:1420/#workspace` 时页面加载超时，Welcome 页正常。带 `TopNav` 的页面似乎都受影响。
- **复现步骤**：
  1. `cd yam-desktop; npm run dev`
  2. 浏览器访问 `/#workspace`
  3. 快照/等待超时
- **期望行为**：网页端应能正常渲染 Workspace 页面用于 UI 调试。
- **实际行为**：页面加载卡住，无法完成快照。
- **建议修复方向**：
  - 检查 `TopNav` 组件是否有无限渲染或循环请求。
  - 检查 mock 数据加载路径是否有阻塞。
  - 考虑给浏览器环境补充更完整的 mock 数据初始化。
- **备注**：已通过改用 CDP 调试 Tauri 桌面端（参见 `.trae/skills/tauri-desktop-cdp-debug/SKILL.md`）绕过该问题，不再依赖网页端 Playwright 快照。如需恢复网页端调试可重新打开。

---

## ISSUE-003：Tauri v2 环境判断错误导致桌面端长期运行在没有真实数据的状态

- **严重程度**：high
- **状态**：fixed
- **描述**：代码中使用 `'__TAURI__' in window` 判断是否在 Tauri 中，但 Tauri v2 实际使用 `window.isTauri`。导致桌面端一直走浏览器 mock 分支，无法读取真实 DB。
- **修复位置**：`yam-desktop/src/lib/db.ts`、`yam-desktop/src/App.tsx`
- **修复内容**：将判断改为 `(window as any).isTauri === true`。

---

## ISSUE-004：选择专业后采集数据为空或提前添加专业

- **严重程度**：high
- **状态**：fixed
- **描述**：桌面端选择专业并启动采集后，部分专业返回 0 所院校，或采集未成功就出现在专业管理页；任务状态异常时还提示“已有采集任务在运行”。
- **修复位置**：
  - `yam/crawler/yanzhao.py`：种子缺失时自动调用 `DynamicYanZhaoCrawler`；失败时抛出 `LoginRequiredError` 或 `RuntimeError`，避免静默返回空列表。
  - `yam/crawler/dynamic.py`：无登录 cookie 时立即失败，避免长时间拉起浏览器。
  - `yam/cli.py`：新增 `--force` 标志；捕获种子获取异常并输出清晰错误提示。
  - `yam-desktop/src-tauri/src/commands.rs`：桌面端启动采集时传入 `--force`，解决旧 `fetch_log` 导致全跳过的问题。
  - `yam-desktop/src-tauri/src/commands.rs`：拆分 `run_crawl_task`，确保异常时重置 `running=false`/`done=true`。
  - `yam-desktop/src/pages/MajorSelectPage.tsx`：移除 `handleConfirm` 中的 `addMajor`，仅设置 `crawlTarget`。
  - `yam-desktop/src/pages/CrawlingPage.tsx`：`syncWorkspaceData` 成功后才 `addMajor` 并更新统计。
  - `yam-desktop/src/pages/MajorSelectPage.tsx`、`SplashScreen.tsx`：专业学位类别无研究方向时不再错误传递类别代码。

---

## ISSUE-005：专业学位选择左侧栏动画不平滑

- **严重程度**：medium
- **状态**：fixed
- **描述**：点击多方向专硕类别时，右侧研究方向列滑出，但左侧栏没有平滑过渡，而是直接跳变到半宽；右侧收回时也可能不完全。
- **修复位置**：`yam-desktop/src/pages/MajorSelectPage.tsx`、`yam-desktop/src/components/SplashScreen.tsx`
- **修复内容**：使用 flex + framer-motion layout 动画；右侧容器用 `maxWidth: 0px` 闭合并加 `min-w-0`。
- **备注**：当前默认使用专业学位平铺列表，可通过 `appStore.enableProfessionalThreeLevelMenu` 切换为三级菜单。

---

## ISSUE-006：取消采集按钮无法停止后端任务导致死锁，且采集卡住时无超时反馈

- **严重程度**：high
- **状态**：fixed
- **描述**：`CrawlingPage` 的"取消"和"后台运行"按钮只清除前端状态，无法停止 Rust 端的 Python 子进程。一旦采集卡住（如研招网接口未响应），`progress.running` 永久保持 `true`，再次启动采集会被拒绝"已有采集任务在运行"，必须重启桌面端应用才能恢复。此外 `stderr` 在子进程退出前不会被读取，用户在采集卡住时看不到任何错误反馈。
- **复现步骤**：
  1. 启动桌面端，选择专业进入 `CrawlingPage`。
  2. 启动采集任务，等待几秒确认 `progress.running=true`。
  3. 点击"取消"按钮返回专业管理页。
  4. 再次选择同一专业并点击"确认添加"。
  5. 弹出"已有采集任务在运行"错误，且 Python 子进程仍在后台运行。
- **期望行为**：取消按钮应 kill Python 子进程并重置 Rust 端 `running=false`/`done=true`；采集超时无进度更新时应自动终止并提示；stderr 应实时反馈给用户。
- **实际行为**：取消按钮只清前端状态；Rust 端 `running` 标志永不重置；stderr 在子进程退出前不显示；无超时检测。
- **修复位置**：
  - `yam-desktop/src-tauri/src/commands.rs`：
    - 新增 `cancel_crawl` 命令，调用 `taskkill /F /T` kill 子进程并重置状态。
    - `CrawlProgress` 新增 `child_pid` 字段（`#[serde(skip)]`）保存子进程 PID。
    - `run_crawl_task` 启动后保存 `child_pid`，结束时清除。
    - `run_crawl_task` 添加 90 秒超时检测，无进度更新则 kill 子进程。
    - `run_crawl_task` 设置 `PYTHONUNBUFFERED=1` 让子进程输出实时刷新。
    - 取消时保留 "用户取消采集任务" 错误信息，不被 "采集脚本异常退出" 覆盖。
  - `yam-desktop/src-tauri/src/main.rs`：注册 `cancel_crawl` 命令。
  - `yam-desktop/src/lib/db.ts`：新增 `cancelCrawl()` 函数。
  - `yam-desktop/src/pages/CrawlingPage.tsx`：
    - `handleCancel` 调用 `cancelCrawl()` 并显示日志。
    - `handleBackground` 改为"返回工作区"语义：不取消采集，仅清除前端 interval，保留 Rust 端任务运行。
- **验证结果**：通过 CDP 直接调用 `run_crawl`/`cancel_crawl` 验证：
  1. 启动采集 → `running=true`，Python 子进程 PID 出现。
  2. 调用 `cancel_crawl` → `running=false`，`done=true`，`error="用户取消采集任务"`，Python 子进程被 kill。
  3. 再次 `run_crawl` → 成功启动，不再死锁。
- **备注**：超时阈值 90 秒可在 `run_crawl_task` 的 `timeout_secs` 常量调整。后续可考虑让用户配置该值。

---

## ISSUE-007：从"后台运行"返回采集页会错误重启采集任务

- **严重程度**：medium
- **状态**：fixed
- **描述**：用户在 `CrawlingPage` 点击"后台运行"后，前端跳转到 `data-ready` 页面但保留 `crawlTarget`。当用户从 TopNav 再次点击"数据采集"回到 `CrawlingPage` 时，组件重新挂载，`useEffect` 检查后端 `getCrawlProgress()` 发现 `running=false`，无视 `done=true` 直接调用 `runCrawl(crawlTarget.code)` 重启采集，覆盖了已完成的结果。
- **复现步骤**：
  1. 选择专业进入采集页，启动采集任务。
  2. 点击"后台运行"按钮跳到数据就绪页。
  3. 等待后端采集任务完成（`done=true`）。
  4. 从 TopNav 点击"数据采集"回到采集页。
  5. 实际：`useEffect` 错误地再次调用 `runCrawl`，把已完成的状态覆盖为新的采集任务。
- **期望行为**：从"后台运行"回来时，应显示采集结果（成功/失败/取消），不自动重启；只有用户从 `MajorSelectPage` 重新选择专业或点击"更新"按钮时，才启动新采集。
- **实际行为**：`useEffect` 只要 `running=false` 就调用 `runCrawl`，忽略 `done` 标志，导致已完成的结果被覆盖。
- **修复位置**：
  - `yam-desktop/src-tauri/src/commands.rs`：新增 `reset_crawl` 命令，清空 `CrawlProgress` 到默认状态（若仍有子进程则先 kill）。
  - `yam-desktop/src-tauri/src/main.rs`：注册 `reset_crawl` 命令。
  - `yam-desktop/src/lib/db.ts`：新增 `resetCrawl()` 前端函数。
  - `yam-desktop/src/pages/MajorSelectPage.tsx`：`handleConfirm` 改为 async，调用 `resetCrawl()` 后再设置 `crawlTarget`，确保新专业进入采集页时后端是初始状态。
  - `yam-desktop/src/pages/MajorManagementPage.tsx`：`handleUpdate` 同样调用 `resetCrawl()` 后再跳转采集页。
  - `yam-desktop/src/pages/CrawlingPage.tsx`：`useEffect` 中区分三种状态：
    - `running=true` → 继续监听进度（原有逻辑）。
    - `done=true` 且 `major_code === crawlTarget.code` → 不重启，显示采集结果；若 `success>0` 且无 error 则自动同步并跳转工作区。
    - `done=true` 但 `major_code !== crawlTarget.code` → 启动新采集。
    - `done=false && running=false` → 初始状态，启动新采集。
- **验证结果**（通过 CDP 真实点击 UI）：
  1. 选择 085400 → 进入采集页，`running=true`，采集启动。
  2. 点击"后台运行" → 跳到数据就绪页，`crawlTarget` 保留。
  3. 通过 `cancel_crawl` 模拟采集完成，后端 `done=true, error="用户取消采集任务"`。
  4. 从 TopNav 点击"数据采集"回到采集页 → **未重启采集**，后端仍为 `done=true`。
  5. 再次从 MajorSelectPage 选择专业 → `resetCrawl` 被调用，后端重置，新采集正常启动。
- **备注**：`resetCrawl` 在 `MajorSelectPage.handleConfirm` 和 `MajorManagementPage.handleUpdate` 中调用，确保用户主动选择/更新专业时一定会启动新采集；从 TopNav 直接回到采集页则保留已有结果。

---

## ISSUE-008：专业删光后显示默认模板数据，误导用户

- **严重程度**：medium
- **状态**：fixed
- **描述**：`MajorManagementPage` 和 `DataReadyPage` 在 `crawledMajors` 为空时 fallback 到 `MOCK_MAJORS` / `MOCK_READY_MAJORS`，显示一堆从未采集过的默认专业（如"人工智能 287 所"），误导用户以为已有数据。
- **复现步骤**：
  1. 进入专业管理页。
  2. 删除所有已添加的专业。
  3. 实际：列表仍然显示一堆默认模板专业。
- **期望行为**：删光专业后显示空状态提示（如"暂无专业数据，点击下方添加专业"）。
- **实际行为**：显示 MOCK_MAJORS，用户误以为有数据。
- **修复位置**：
  - `yam-desktop/src/pages/MajorManagementPage.tsx`：移除 `MOCK_MAJORS` 常量及 fallback，`crawledMajors` 为空时渲染空状态提示（FolderOpen 图标 + 文案）。
  - `yam-desktop/src/pages/DataReadyPage.tsx`：移除 `MOCK_READY_MAJORS` 常量及 fallback，`crawledMajors` 为空时渲染空状态提示；"进入工作区"按钮在无数据时禁用。

---

## ISSUE-009：离开采集页面后无法看到后台采集任务进度

- **严重程度**：medium
- **状态**：fixed
- **描述**：用户点击"后台运行"离开采集页面后，无法在其他页面看到采集任务的进度。必须回到采集页面才能查看，不符合"后台运行"的直觉。
- **复现步骤**：
  1. 选择专业启动采集任务。
  2. 点击"后台运行"跳到数据就绪页或工作区。
  3. 实际：完全看不到采集任务的进度，不知道还要多久。
- **期望行为**：在任意页面都能看到后台采集任务的进度（专业名、当前/总数、百分比、正在处理的学校）。
- **实际行为**：只有回到采集页面才能看到进度。
- **修复位置**：
  - `yam-desktop/src/components/BackgroundTaskPanel.tsx`：新增全局后台任务面板组件，固定在屏幕左下角（`fixed bottom-4 left-4`），每 1.5 秒轮询 `getCrawlProgress()` 更新状态。任务完成 3 秒后自动隐藏，可手动关闭。点击面板可跳转到采集页面。
  - `yam-desktop/src/App.tsx`：挂载 `BackgroundTaskPanel` 组件，全局可见。
- **验证结果**（通过 CDP 测试）：
  1. 启动采集任务（085410） → 面板显示"后台采集任务 人工智能 0/217 所 0%"。
  2. 切换到工作区页面 → 面板仍然可见，显示实时进度。
- **备注**：面板仅在 `running=true` 或 `done=true && error` 时显示；采集成功完成（`success>0 && !error`）时不显示，因为正常流程会自动跳转工作区。

---

## ISSUE-010：采集进度显示不直观，total=0 时只显示"准备中..."

- **严重程度**：low
- **状态**：fixed
- **描述**：采集启动后，Python CLI 获取院校列表期间 `total=0`、`current_name` 为空，`CrawlingPage` 只显示"准备中..."，用户以为卡住。
- **修复位置**：
  - `yam-desktop/src/pages/CrawlingPage.tsx`：轮询逻辑中根据后端状态显示更详细的文案：
    - `total=0 && running` → "正在获取院校列表..."
    - `total>0 && current_name` → 显示当前学校名
    - `total>0 && !current_name` → "进度 X/Y"
    - `done && error` → "采集已结束"
    - `done && !error` → "采集完成"
- **备注**：配合 ISSUE-009 的后台任务面板，用户现在可以清楚看到采集任务的实时状态。

---

## ISSUE-011：采集失败/取消仍创建无数据的空专业

- **严重程度**：high
- **状态**：fixed
- **描述**：用户取消采集或采集失败（如登录失败、网络异常）后，`CrawlingPage` 仍调用 `handleSync` 并通过 `addMajor` 把专业加入管理列表，导致专业管理页出现无数据的空专业。
- **复现步骤**：
  1. 进入专业管理 → 添加专业 → 选择 085400
  2. 进入采集页后立即点击"取消"
  3. 回到专业管理页
- **期望行为**：采集未成功时不应将专业添加到管理列表。
- **实际行为**：专业出现在管理列表中，但 Tauri DB 无对应数据，进入工作区显示空数据。
- **建议修复方向**：
  - **短期**：`CrawlingPage` 轮询检测到 `done=true` 时区分三种情况：`error` 非空 → 不添加；`success=0` → 不添加；`success>0` → 调用 `handleSync`。
  - **长期**：`handleSync` 同步后再次检查 `fetchAvailableMajors` 中该专业的 `school_count`，为 0 则不 `addMajor` 并提示错误。
- **修复位置**：
  - `yam-desktop/src/pages/CrawlingPage.tsx`：
    - 轮询 `done=true` 分支：`error` 非空或 `success=0` 时不调用 `handleSync`，仅设置错误提示。
    - `handleSync`：同步后通过 `fetchAvailableMajors` 检查 `school_count`，为 0 则不 `addMajor`，设置错误并退出。
- **验证**：通过 CDP 真实点击 UI 测试（选 085400 → 取消），确认 Tauri DB 可用专业数从 1 保持为 1，表格行数未增加。

---

## ISSUE-012：BackgroundTaskPanel 显示信息不够直观

- **严重程度**：medium
- **状态**：fixed
- **描述**：原后台任务面板只显示专业名、进度条、百分比，缺少专业代码、成功/失败/跳过计数、已用时、最后更新时间等关键信息，用户难以判断任务真实状态。
- **修复位置**：
  - `yam-desktop/src/components/BackgroundTaskPanel.tsx`：完全重写：
    - 头部根据状态变色：运行中（蓝色 + Loader2 旋转图标）、出错（红色 + AlertCircle）、已结束（琥珀色 + CheckCircle2）。
    - 显示专业名 + 专业代码（font-mono）。
    - 进度条颜色跟随状态变化。
    - 新增 success/failed/skipped 计数行（✓/✗/↷ 图标 + 数字）。
    - 新增"已用时 MM:SS"计时器（每秒刷新）和"更新于 HH:MM:SS"时间戳。
    - 底部增加"点击查看 →"提示，引导用户跳转采集页。
    - 任务完成无错误后 8 秒自动隐藏（原为 3 秒，延长以便用户查看结果）。
- **验证**：通过 CDP 验证，运行中显示"后台采集任务 未知专业 085410 0/217 所 0% ✓0 ✗0 已用时 0:09 点击查看 →"；出错时显示"采集任务出错 未知专业 085410 用户取消采集任务 0% ✓0 ✗0 更新于 01:49:17 点击查看 →"。

---

## ISSUE-013：Python CLI 错误信息无法传递到 Tauri 前端

- **严重程度**：high
- **状态**：fixed
- **描述**：采集 085400（未登录研招网）等失败场景时，前端只显示通用错误"采集脚本异常退出"，而非 Python CLI 抛出的真实原因（如"需要登录研招网：研招网接口返回异常：请登录"），用户无法判断该做什么。
- **复现步骤**：
  1. 启动桌面端，进入专业管理 → 添加 085400（未在终端执行 `yam fetch-seeds -m 085400 --login`）。
  2. 进入采集页启动采集。
  3. 等待采集结束（约 5-6 秒）。
- **期望行为**：前端 error 字段显示 Python 的 `YAM_ERROR` 内容，如"需要登录研招网：研招网接口返回异常：请登录。请先运行 yam fetch-seeds -m 085400 --login"。
- **实际行为**：前端 error 字段为"采集脚本异常退出"或为空。
- **根因**：
  - **根因 1**（Rust 端）：`run_crawl_task` 使用 `BufReader::lines()` 读取 Python stdout。该方法严格要求 UTF-8，但 Python 在 Windows 上默认用系统编码（GBK/cp936）输出中文，导致 `lines()` 返回 `Err`，被 `.flatten()` 静默丢弃，所有包含中文的行（包括 `YAM_ERROR 需要登录研招网：...`）全部丢失。
  - **根因 2**（Python 端）：Python CLI 缺少对外的错误协议，仅打印 Rich Console 红色文本，Rust 端无法稳定解析。
- **修复位置**：
  - `yam/cli.py`：`fetch` 命令捕获 `LoginRequiredError` / `RuntimeError` 时，除 Rich Console 输出外，额外 `print(f"YAM_ERROR {消息}", flush=True)` 输出结构化错误协议，供 Rust 端解析。
  - `yam-desktop/src-tauri/src/commands.rs`：
    - `run_crawl_task` 移除 `BufReader::lines()`，改用 `read()` + 手动按 `\n` 分割 + `String::from_utf8_lossy()` 容错解码，避免 GBK 字节导致整行丢弃。
    - 子进程启动时设置 `PYTHONIOENCODING=utf-8` 和 `PYTHONUTF8=1` 环境变量，强制 Python 以 UTF-8 输出，从源头消除编码问题。
    - 新增 `process_stdout_line()` 辅助函数，识别 `YAM_ERROR ` 前缀并写入 `p.error` 字段。
- **验证结果**（通过 CDP 直接调用 `run_crawl('085400')`）：
  - 采集 6 秒后 `done=true, error="需要登录研招网：研招网接口返回异常：请登录。请先运行 yam fetch-seeds -m 085400 --login"`。
  - 中文显示正确，无乱码。
- **备注**：`String::from_utf8_lossy` 仍保留作为防御性容错（防止其他非 UTF-8 字节导致崩溃），但 `PYTHONIOENCODING=utf-8` 已经从源头保证了 Python 输出可被 Rust 正确解码。

---

## ISSUE-014：工作区院校层级 985/211 标签缺失且全用双一流展示

- **严重程度**：high
- **状态**：fixed
- **描述**：工作区表格 Level 列只显示"双一流"或"普通本科"，所有双一流学校均未显示 985/211 标签，且存在漏标。用户反馈"目前的工作区展示完全不涉及985211，全用双一流来展示，而且还有漏标，没有价值"。
- **复现步骤**：
  1. 启动桌面端，进入工作区，选择已采集的专业（如 085410）。
  2. 查看学校列表的 Level 列。
- **期望行为**：985、211、双一流分别以独立彩色标签显示（985 红色、211 蓝色、双一流 绿色），标签准确不漏标。
- **实际行为**：所有双一流学校均显示为"双一流"文本，985/211 标签完全缺失。
- **根因**：
  - **根因 1**：研招网 API 的 `b985` 字段对所有学校都返回 '0'（不可靠），且无 `b211` 字段。`yanzhao.py` 的 `_infer_level` 原本依赖 `b985` 判断 985，导致 985 标签永远不出现。
  - **根因 2**：`sync_to_tauri.py` 的 `_enrich_school_fields` 原本从 level 文本反推 is_985/is_211 字段（逻辑反了），而 level 文本本身来自不可靠的 b985。
  - **根因 3**：`sync_to_tauri.py` 的 `apply_zhangshangkaoyan_rank` 原本调用已失效的 `schoolListBySpecial` 接口（返回 404），异常被 catch 后返回空 dict，标签未覆写。
  - **根因 4**：`sync_to_tauri.py` 的调用顺序错误：先 `_enrich_school_fields` 生成 level 文本，再 `apply_zhangshangkaoyan_rank` 覆写字段，导致 level 文本在字段覆写前生成。
- **修复位置**：
  - `yam/crawler/yanzhao.py`：`_infer_level` 移除对 `b985` 字段的依赖，985/211 准确判断交给 sync 阶段的掌上考研 API 覆写。
  - `yam/crawler/zhangshangkaoyan.py`：新增 `fetch_school_tags_map(school_names)` 方法，按学校名批量查询 `/school/schoolList` 接口（返回完整 is_985/is_211/is_zihuaxian/syl 字段），结果缓存到 `~/.yam/cache/zhangshangkaoyan_tags.json`。
  - `yam/scripts/sync_to_tauri.py`：
    - `apply_zhangshangkaoyan_rank` 重写：只对双一流学校查询 985/211 标签（985/211 必然是双一流子集），用掌上考研标签覆写 is_985/is_211/double_first_class；display_order 改用 school_code 升序。
    - `_enrich_school_fields` 重写：从 is_985/is_211/double_first_class 字段值生成 level 文本（而非反过来）。
    - 调用顺序调换：先 `apply_zhangshangkaoyan_rank` 覆写字段，再 `_enrich_school_fields` 生成 level 文本。
  - `yam-desktop/src/pages/WorkspacePage.tsx`：表格 Level 列和展开详情面板改为彩色标签显示（985 红色、211 蓝色、双一流 绿色）。
- **验证结果**（同步 085410 后验证 DB 数据）：
  - 17 所 985（北航、南大、东南大学等）level="985 / 211 / 双一流" ✓
  - 38 所 211（非985）（北京交通大学、苏州大学等）level="211 / 双一流" ✓
  - 7 所双一流（非211）（山西大学、河南大学等）level="双一流" ✓
  - 155 所普通本科 level="普通本科" ✓
  - 标签无漏标，前端彩色标签正常显示。
- **建议修复方向**：
  - 短期：已修复，标签缓存命中后刷新速度显著提升。
  - 长期：考虑在 Python 后端 schools 表写入时直接保存掌上考研标签，避免同步阶段额外 API 调用。

---

## ISSUE-015：研招网 `zydws.do` 翻页接口偶发返回"请登录"

- **严重程度**：high
- **状态**：fixed
- **描述**：即使本地已保存有效的 `CASTGC` 登录凭证，且首次请求能返回数据，翻页调用 `zydws.do` 时仍会偶发返回"请登录"，导致 `fetch_school_list` 抛出 `LoginRequiredError`，采集中断。
- **复现步骤**：
  1. 确保 `~/.yam/cookies/yz.chsi.com.cn.json` 中存在 `account.chsi.com.cn` 域的 `CASTGC`。
  2. 在桌面端选择 `081200 计算机科学与技术` 并启动采集。
  3. 若第一页成功返回，等待翻到第 2 页或更后。
  4. 实际：接口 `msg` 字段变为字符串"请登录"，采集终止。
- **期望行为**：登录凭证有效期间，能获取完整院校列表（271 所）。
- **实际行为**：翻页过程中返回"请登录"，采集只能获取第 1 页（10 所）。
- **根因分析**（经深入调试确认）：
  - 研招网服务端在每个登录会话内**严格限制** `zydws.do` 调用：同一参数组合的第二次调用一律返回"请登录"。
  - 该限制基于 `CASTGC`（登录凭证）+ 参数组合，**与 JSESSIONID、页面上下文、请求方式（fetch/requests）均无关**。
  - 尝试过的失败方案：清除 JSESSIONID、新建页面、`page.route()` 拦截修改请求体、Python `requests` 直接调用、大 `pageSize`（API 忽略）、URL 参数 `curPage`（页面忽略）。
  - **关键发现**：不同 `ssdm`（省份）参数的调用视为不同请求，均可成功。这为绕过限制提供了途径。
- **修复位置**：
  - `yam/crawler/dynamic.py`：
    - 新增 `_PROVINCES` 常量（34 个省级行政区代码）和 `_KEYWORDS` 常量（38 个校名关键词）。
    - `fetch_school_list` 完全重写为四阶段方案：
      1. **sign 元数据**：通过浏览器获取 `zys.do` 返回的 `sign`/`sign2`，构造正确详情页 URL 建立 session，提取 cookies 转 `requests` 调用。
      2. **省份扫描 + 多筛选**（`zydws.do`）：遍历 34 个省份，每省调用一次获取前 10 所（含 totalCount=0 重试机制，3 次尝试间隔 8s）；对院校数 >10 的省份追加 8 种筛选组合（`dwlxs=zhx`/`dwlxs=syl`/`tydxs=0`/`tydxs=1`/`jsggjh=0`/`jsggjh=1`/`xxfs=1`/`xxfs=2`），每种组合返回不同的前 10 所。按 `schId` 去重。
      3. **关键词搜索**（`zydws.do`）：对仍有缺口的省份，用 38 个校名关键词（`dwmc` 参数）补全，每个关键词返回不同的前 10 所。
      4. **dwzys.do 补缺**（aiohttp 并发）：遍历"已知 dwdm 的 ±10 邻域 + 小间隙（11-99）填补"，用 aiohttp 并发 3 + 批 30 + 自适应限流（批间 sleep 15/30/60s）。
- **验证结果**（2026-07-17，专业 081200 计算机科学与技术）：
  - 省份扫描：34 个省份，获取 210 所唯一院校。
  - 多筛选：11 个 >10 所的省份 × 8 筛选组合，新增 44 所 = 254 所。
  - 关键词搜索：38 个关键词 × 缺失省份，新增 14 所 = 268 所。
  - dwzys.do 补缺（aiohttp + 段±10）：遍历 1447 个代码，新增 3 所 = **271 所**。
    - 北京联合大学（dwdm=11417，北京）
    - 青岛大学（dwdm=11065，山东）
    - 烟台大学（dwdm=11066，山东）
  - **最终获取 271/271 所院校（100% 覆盖率）**，总耗时约 30 分钟。
- **技术细节**（来自旧项目 yanzhao-mcp 参考 + 2026-07 实测）：
  - `dwzys.do` 不需要 `sign`/`sign2`，参数用 `zycm`（非 `zymc`），需 `mldm`/`yjxkdm`。
  - `dwzys.do` 对无效 dwdm 返回 dict msg（list=[], totalCount=0），只有"访问太频繁"/"请登录"才返回字符串 msg。
  - **限流策略实测**（2026-07）：研招网限流是"累积式封禁"，短时允许 40-50 请求，超过触发雪崩封禁（5-10 分钟）。
    - 并发 5 短时（40 请求）100% 成功，但持续高频（200+）触发雪崩。
    - 并发 ≥10 立即全部限流；旧项目"并发 15"在当前网络环境已失效。
    - 30s 批间 sleep 是"稳定状态"：成功率约 61%，不触发雪崩。
  - **遍历范围策略**：全段遍历（10001-19999 + 80001-82999 + 90001-92999）约 6000 个代码，限流严重。改为"已知 dwdm 的 ±10 邻域 + 小间隙（11-99）填补"约 1447 个代码，精准覆盖所有缺失位置。
  - 中国高校代码编码规则：10001-19999（普通高校）、80001-82999（科研院所）、90001-92999（军事院校）。
- **备注**：该方案将"翻页"问题转化为"多维度筛选 + 关键词搜索 + 精确查询"问题，利用服务端按参数组合区分调用的特性，实现了 100% 院校列表采集。dwzys.do 阶段用 aiohttp 替代 requests，并采用自适应限流策略（批间 sleep 15/30/60s）避免雪崩封禁。

---

## ISSUE-017：桌面端采集 90 秒超时对无种子专业过短

- **严重程度**：high
- **状态**：fixed
- **描述**：桌面端启动新专业采集时，若该专业没有本地种子文件，`yanzhao.py` 会自动调用 `DynamicYanZhaoCrawler.fetch_and_save()` 抓取完整院校列表。四阶段种子抓取耗时约 30 分钟，但 `commands.rs` 的 `run_crawl_task` 使用固定 90 秒超时，导致种子尚未抓完就被误判为"卡住"并终止任务。
- **复现步骤**：
  1. 确保 `data/seeds/yan_zhao_083500_all_regions.json` 不存在。
  2. 在桌面端选择 `083500 软件工程` 并启动采集。
  3. `CrawlingPage` 显示"正在获取院校列表..."约 90 秒后报错"采集超时（90 秒无进度更新），已自动终止"。
- **期望行为**：种子获取阶段允许更长的等待时间（约 5 分钟），或定期输出心跳进度避免超时；进入院校详情抓取阶段后再使用较短的 90 秒超时。
- **实际行为**：固定 90 秒超时，无种子专业无法完成自动种子抓取。
- **修复位置**：
  - `yam-desktop/src-tauri/src/commands.rs`：`run_crawl_task` 中 `timeout_secs` 改为自适应：初始 300 秒，一旦收到 `YAM_TOTAL`（`total > 0`）即恢复为 90 秒。
  - `yam/crawler/yanzhao.py`：`fetch_schools` 调用 `fetch_and_save` 期间启动后台心跳线程，每 30s 输出 `YAM_PROGRESS 0/0 正在获取 {code} {name} 种子数据（...心跳 N）...`，刷新 Rust 端 `last_progress_time`，避免种子抓取中途被误判"300 秒无进度更新"而终止。仅桌面端（`YAM_DESKTOP=1`）发协议行，独立 CLI `yam fetch-seeds` 不发避免噪声。
- **验证结果**：
  - 预抓取 `083500` 种子（139 所）后，桌面端 `run_crawl` 成功完成 139/139 所采集与同步，`workspace_schools` 表确认 139 条记录。
  - 修复后桌面端在种子就绪场景下可正常完成多专业采集。
  - **运行时验证（2026-07-23，030100 法学无种子实测）**：
    - 仅 300s 自适应超时（无心跳）：t=90s 存活（旧 90s bug 已修 ✅），但 t≈301s 被杀"采集超时（300 秒无进度更新）"——种子抓取（29 省扫描）耗时 >300s，300s 仍不够 ⚠️。
    - 补心跳后复测：t=300/315/330/345/361/376s 全部存活（12 个心跳持续刷新计时器），不再被误杀 ✅。current_name 实时显示"心跳 N"（解决之前卡在首行的问题）。
- **建议修复方向**：
  - **短期**（已完成）：上述自适应超时，确保无种子专业有足够时间完成种子抓取。
  - **中期**（已完成）：`yanzhao.py` 在种子抓取期间定期输出 `YAM_PROGRESS 0/0` 心跳，保持超时计时器刷新。
  - **长期**：桌面端选择专业后先独立调用 `fetch-seeds` 并显示"正在获取院校列表"进度，种子就绪后再启动 `fetch` 抓取院系详情，两个阶段进度分开呈现。

---

## ISSUE-018：085400 电子信息 seed 抓取正常但 zys.do 返回 totalCount=0

- **严重程度**：medium
- **状态**：fixed
- **描述**：早期会话曾误判"085400 作为专业学位门类代码在研招网数据源已不可用"，并把 `data/majors.yaml` 中 085400 的 `enabled` 改为 `false`。实际验证发现：
  - `data/seeds/yan_zhao_085400_all_regions.json` 成功抓取 **228 所院校**，覆盖 **29 个省份**（北京 22、江苏 17、湖北 17、上海 15、浙江 15 等）。
  - 228 条记录的 `sign` / `sign2` 字段**全部非空**，证明 `zys.do` 接口对 085400 仍返回完整院校列表。
  - 但 228 所院校的 `totalCount` **全部为 0**——`zys.do` 在 `zydm=085400` 时不再返回该院系开设的具体招生方向数，需进入 `zydws.do` 院系详情页才能看到 085401-085412 等细分方向。
  - 结论：085400 **不是"不可查询"**，只是 zys.do 列表页的 `totalCount=0`，**seed 抓取完全可用**。
- **复现步骤**：
  1. 查看 `data/seeds/yan_zhao_085400_all_regions.json`（7981 行、228 所院校、29 省）。
  2. 用 Python 统计：`sum(1 for i in d if i.get('sign'))` = 228，`sum(1 for i in d if i.get('totalCount',0)>0)` = 0。
  3. 在桌面端选择 `085400 电子信息`，可以正常启动采集（已确认 majors.yaml 中 085400 的 `enabled` 仍为 `true`）。
- **期望行为**：085400 视为可正常采集专业，不 disable；seed 文件保留作为 fallback；前端在 `totalCount=0` 时显示"列表页无招生方向数据，请进入院系详情查看 085401-085412 细分方向"。
- **实际行为**：早期误判导致 majors.yaml 中 085400 一度被 disable；当前 `enabled: true` 已恢复，但缺统一说明，未来会话容易再次误判。
- **本次修复（2026-07-21）**：
  - 确认 `data/majors.yaml` 第 3317 行 `085400 电子信息` 的 `enabled: true` 状态正确，不再 disable。
  - 在 `docs/known-issues.md` 中补回此前缺失的 ISSUE-018 条目，明确 085400 的真实情况。
- **建议修复方向**：
  - **短期**：保留 085400 的 seed 文件与 `enabled: true`；前端 `totalCount=0` 时给出"该院系在 0854 一级学科下无招生方向，请改选 085401-085412"提示。
  - **中期**：`fetch-seeds` 阶段对 `totalCount=0` 的专业额外打印警告，避免误判为"采集失败"。
  - **长期**：MajorSelectPage 支持按一级学科代码（yjxkdm=0854）聚合显示所有细分专业，而不是把 085400 当作独立可采集叶子节点。

---

## ISSUE-016：采集错误时 `CrawlingPage` 错误横幅显示完整 Python traceback

- **严重程度**：medium
- **状态**：fixed
- **描述**：当 Python CLI 抛出异常（如 `LoginRequiredError`）时，前端 `CrawlingPage` 的 error banner 会显示完整 Python traceback，而非面向用户的简洁提示，体验差且难以阅读。
- **复现步骤**：
  1. 清空或删除 `~/.yam/cookies/yz.chsi.com.cn.json`。
  2. 在桌面端选择任意专业（如 `081200`）启动采集。
  3. 等待采集失败，查看错误横幅。
- **期望行为**：错误横幅仅显示用户可理解的提示，如“需要登录研招网：研招网接口返回异常：请登录”。
- **实际行为**：错误横幅中夹杂多行 Python traceback（如 `Traceback (most recent call last): ...`），占据大量页面空间。
- **修复位置**：
  - `yam/cli.py` `fetch` 命令：在已有的 `LoginRequiredError`/`RuntimeError` 捕获之外，新增 `except Exception` 广义捕获，输出 `YAM_ERROR 采集异常：{ExceptionType}: {message}` 结构化错误协议，而非让 Python 打印完整 traceback 到 stderr。
  - `yam-desktop/src-tauri/src/commands.rs`：
    - 新增 `filter_python_stderr()` 函数，过滤 stderr 中的 `Traceback`、`  File`、缩进行等调试信息，仅保留最后的 `ErrorType: message` 行。
    - `run_crawl_task` 中子进程异常退出时，若已有 `YAM_ERROR` 则保留；否则使用 `filter_python_stderr` 提取有用错误信息，避免直接显示完整 stderr。
- **备注**：双层防护——Python 端优先输出 `YAM_ERROR` 结构化错误，Rust 端兜底过滤 stderr 中的 traceback，确保前端错误横幅只显示用户可理解的简洁提示。

---

## ISSUE-019：专业选择页面可供选择的专业不全

- **严重程度**：high
- **状态**：fixed
- **描述**：专业选择页面（MajorSelectPage）可供选择的专业不全，用户想采集"非织造材料与工程"（只有一个学校开设）等专业时找不到，还有许多其他专业在研招网目录中存在但前端无法选择。
- **根因**：前端只从 `data/majors.yaml` 加载专业列表。该 yaml 是一份不完整的静态目录：
  - 总共收录 752 个专业
  - 仅 3 个 `enabled: true`（083500 软件工程、085400 电子信息、085410 人工智能）
  - 749 个 `enabled: false`
  - "非织造材料与工程"等专业**完全未收录**在 yaml 中
- **复现步骤**：
  1. 在桌面端进入"添加专业"页面。
  2. 搜索"非织造材料与工程"。
  3. 实际：搜索无结果。
  4. 打开研招网 `https://yz.chsi.com.cn/zsml/` 查询该专业，确认其存在。
- **期望行为**：用户能搜索并采集研招网目录中的任何专业，不受 majors.yaml 静态列表限制。
- **实际行为**：用户只能在 yaml 已收录且 enabled=true 的 3 个专业中选择。
- **建议修复方向**：
  - **短期**：扩充 `data/majors.yaml`，把研招网 2026 招生专业目录完整导入（约 4000+ 条），并把所有专业默认 `enabled: true`，仅对已知不可采集的少数专业显式 disable。
  - **长期**：MajorSelectPage 改为直接从研招网实时查询专业目录（如 `zys.do` 接口），不再依赖本地 yaml；用户可输入任意专业代码或名称直接采集。
- **本次修复（2026-07-18 第一轮）**：
  - 用 PowerShell 把 `data/majors.yaml` 中所有 `enabled: false` 批量替换为 `enabled: true`，753 个专业全部启用。
  - 在 `data/majors.yaml` 与 `yam-desktop/src/data/majors.ts` 中新增 `0821Z5 非织造材料与工程`（东华大学自设二级学科，位于 0821 纺织科学与工程下），让用户能搜索并采集。
- **本次修复（2026-07-20 第二轮）**：
  - 发现研招网 `zys.do` 接口支持按一级学科代码（`yjxkdm`）查询所有专业，比猜测 Z1-Z9/J1-J9 代码准确得多。
  - 未登录状态下抓取了 219 个一级学科，得到 719 个专业（其中 221 个是 majors.ts 没有的新增）。
  - 合并到 `data/majors.yaml`（782→1003，+221）和 `yam-desktop/src/data/majors.ts`（1015→1250，+235）。
  - 编译验证通过（`npm run build` + `cargo check`）。
  - 清理了 yaml 文件开头多余的 UTF-8 BOM。
- **本次修复（2026-07-20 第三轮，已完成）**：
  - 发现研招网未登录时每个学科只能取前 10 条（第 2 页返回"请登录"），导致 60 个热门学科（如 0812 计算机科学与技术 5/37、1002 临床医学 10/109）仍不全。
  - 下载教育部官方 PDF（截至 2024.6.30 的 5034 个自设二级学科 + 878 个交叉学科名单），但 PDF 只有名称没有代码。
  - 从 PDF 提取 3072 个不同名称，用 Playwright 浏览器环境按名称批量搜索研招网 `zys.do` 拿代码（aiohttp 直接请求被限流"访问太频繁"，浏览器环境带 Referer + cookies 不被限流）。
  - 批量搜索完成：共 3072 个名称，拿到 528 个独立专业代码。
  - 将 MOE 搜索结果与第二轮 yjxkdm 抓取结果取并集，合并后共 1040 个自设二级学科。
  - 合并到 `data/majors.yaml`（1003→1305，+302）和 `yam-desktop/src/data/majors.ts`（1250→1546，+296）。
  - 编译验证通过（`npm run build`）。
  - `0812 计算机科学与技术` 现有 14 个专业（4 个标准 + 10 个自设），比最初的 4 个大幅扩充。
- **仍存在的缺口**：
  - 教育部 PDF 是 2024 年数据，且研招网 2026 招生目录与教育部备案名单并不完全重合；按名称搜索只能拿到 totalCount ≤ 10 的结果，热门名称（如"人工智能"）仍可能漏掉部分代码。
  - 要彻底补全，需要登录研招网后翻页抓取（`fetch_majors_with_login.py`），或使用实时查询接口替代静态 yaml。
- **长期方案**：MajorSelectPage 改为直接从研招网实时查询专业目录（如 `zys.do` 接口），不再依赖本地 yaml；用户可输入任意专业代码或名称直接采集。
- **本次确认（2026-07-23，标记为 fixed）**：
  - 数据模型已彻底切换：`MajorSelectPage` 通过 Rust 命令 `read_majors_catalog` 加载 `data/majors_realtime.json`（ISSUE-023 httpx 方案产出），不再依赖 `data/majors.yaml` 静态列表。
  - `majors_realtime.json` 含 2255 个叶子专业（2191 学术学位 + 64 专业学位），14 个学术门类、155 个一级学科、14 个专业学位类别；文件中**无 `enabled` 字段**（`'enabled' in file == False`）。
  - `MajorSelectPage.tsx` 全文仅 1 处 "enabled" 提及（L547 布局注释），**无任何 enabled 过滤逻辑**。
  - `data/majors.yaml` 中 `enabled: false` 数量为 0（零个 disabled），但已不再是前端数据源，仅作历史兼容保留。
  - 原长期方案（实时查询 zys.do）已通过 ISSUE-023 的 `majors_realtime.json` 机制落地：更新目录流程产出的实时数据直接供前端使用，无需登录研招网翻页。
- **备注**：与 ISSUE-022（disabled 专业仍能被选择）相互关联——根本原因都是前端依赖 yaml 静态列表。ISSUE-019 已通过切换到 realtime 数据源解决；ISSUE-022 的 disabled 分支在数据层已不可达，但需重新定义方向（见 ISSUE-022）。

---

## ISSUE-020：BackgroundTaskPanel 用时计时器不会重置

- **严重程度**：medium
- **状态**：fixed
- **描述**：左下角后台任务面板的"已用时 MM:SS"计时器在采集任务结束后未重置，下次启动新采集任务时计时器延续上一个任务的累计时间，显示的用时与实际任务用时不符。
- **修复位置**：`yam-desktop/src/components/BackgroundTaskPanel.tsx`
- **修复内容**：添加 `prevRunningRef`，在 `running` 从 false 变为 true 时重置 `startTimeRef.current = Date.now()`，使每次新任务开始时计时器从 0 起算。
- **复现步骤**：
  1. 启动一次采集任务，等待几秒后取消或让其完成。
  2. 观察左下角面板的"已用时"显示。
  3. 启动第二次采集任务。
  4. 实际：第二次任务的"已用时"从第一次任务的累计时间开始递增，而非从 0 开始。
- **期望行为**：每次启动新采集任务时，"已用时"计时器从 0 开始重新计时。
- **实际行为**：计时器不重置，跨任务累计。
- **建议修复方向**：
  - **短期**：`yam-desktop/src/components/BackgroundTaskPanel.tsx` 在检测到 `running` 从 false 变为 true（新任务启动）时，重置内部计时器 `startTime` 状态。
  - **长期**：将计时器逻辑改为基于后端 `CrawlProgress` 的 started_at 时间戳（需在 Rust 端 `CrawlProgress` 新增 `started_at: Option<u64>` 字段），避免依赖前端状态。

---

## ISSUE-021：切出数据采集页面再切回误报"已有采集任务在运行"

- **严重程度**：medium
- **状态**：fixed
- **描述**：用户从数据采集页面（CrawlingPage）切出后再切回，前端会弹出"已有采集任务在运行"的提示，即使当前并没有运行中的采集任务。该提示应当只在用户从 MajorSelectPage 选择了一个正在采集的专业时才出现。
- **修复位置**：`yam-desktop/src/pages/CrawlingPage.tsx`
- **修复内容**：删除页面重新挂载时检查后端状态后打印的冗余"检测到已有..."日志，避免切回页面时误触发提示。
- **复现步骤**：
  1. 在 MajorSelectPage 选择一个专业，进入 CrawlingPage 启动采集。
  2. 点击"后台运行"或切换到其他页面。
  3. 从 TopNav 点击"数据采集"回到 CrawlingPage。
  4. 实际：弹出"已有采集任务在运行"提示，即使后端 `running=false`。
- **期望行为**：仅在用户从 MajorSelectPage 主动选择了一个正在采集的专业时才提示"已有采集任务在运行"；从 TopNav 回到采集页不应弹出此提示。
- **实际行为**：CrawlingPage 重新挂载时错误地触发了 `runCrawl`，导致"已有采集任务在运行"提示。
- **建议修复方向**：
  - **短期**：检查 `yam-desktop/src/pages/CrawlingPage.tsx` 的 `useEffect` 初始化逻辑，确保只在 `running=false && done=false && !crawlTarget` 时调用 `runCrawl`；切回页面时若 `crawlTarget` 与后端 `major_code` 一致且 `done=true`，应显示采集结果而非重启。
  - **长期**：将"启动采集"动作收敛到 `MajorSelectPage.handleConfirm` 和 `MajorManagementPage.handleUpdate` 两个入口，CrawlingPage 只负责显示进度，不再主动调用 `runCrawl`。

---

## ISSUE-022：选择 disabled=true 的专业（如 140700 区域国别学）后采集卡住

- **严重程度**：medium
- **状态**：fixed（2026-07-27：统一实时目录与采集入口数据源，移除 enabled 拒绝分支，并增加结构化失败分类）
- **描述**：用户在专业选择页面选择 `140700 区域国别学` 后启动采集，前端一直显示"专业 140700 当前未启用"且卡住，无法继续也无法回退。`data/majors.yaml` 中该专业 `enabled: false`，但前端 MajorSelectPage 仍允许选择。
- **复现步骤**：
  1. 在专业选择页面找到 `140700 区域国别学`。
  2. 点击确认添加。
  3. 进入采集页后显示"专业 140700 当前未启用"，采集卡住。
- **期望行为**：MajorSelectPage 不应显示 `enabled: false` 的专业；若用户尝试选择，应给出"该专业暂不支持采集"的提示。
- **实际行为**：disabled 专业仍出现在选择列表，选择后采集卡住。
- **建议修复方向**：
  - **短期**：`yam-desktop/src/pages/MajorSelectPage.tsx` 渲染专业列表时过滤 `enabled === false` 的条目。
  - **长期**：在 `yam-desktop/src/data/majors.ts`（或对应的数据加载模块）层统一过滤 disabled 专业，避免每个组件各自处理。同时在采集启动前增加 `enabled` 校验作为兜底。
- **重新定义方向（2026-07-23）**：
  - 原描述的"disabled 专业卡住"在数据层已不可达：`majors_realtime.json`（前端实际数据源）无 `enabled` 字段，`data/majors.yaml` 中 `enabled: false` 数量为 0，`cli.py` 的 enabled 检查分支（原 YAM_ERROR "未启用" 来源）已永远不会触发。
  - 但 ISSUE 本质诉求仍在：**要消灭 disabled 的专业，要让专业可见即可查**。即不应存在"可见但不可采集"的专业——凡是出现在专业选择页的专业，都必须能正常进入采集流程。
  - 已完成（2026-07-27）：
    1. `Config.get_major()` 优先读取与桌面端同源的 `data/majors_realtime.json`，静态 `majors.yaml` 仅作 fallback。
    2. 删除 `cli.py fetch` 的 `enabled` 拒绝分支，前端实时目录中可见的专业可直接进入采集流程。
    3. 验证 `140700 区域国别学`、`0101J1 中国古典学` 可由采集入口识别；`085410` 静态 fallback 仍正常。
    4. `YAM_ERROR` 增加结构化分类：`UNKNOWN_MAJOR / LOGIN_REQUIRED / NO_PUBLIC_DATA / UNREACHABLE / FAILED`；Rust 解析为 `CrawlProgress.error_code`，不再仅依赖错误文案判断。
  - 结论：旧 disabled 卡住路径已消除，“专业可见即可进入采集”的数据源基础已统一。若未来重新引入不可采集专业，应在目录数据中提供明确状态并在选择阶段置灰。

---

## ISSUE-023：专业目录更新流程耗时过长

- **严重程度**：medium
- **状态**：fixed
- **描述**：设置页"更新专业目录"流程串行探测 219 个一级学科 + 子专业，整体耗时较长（实测 30 分钟+）。`yam/scripts/update_majors_catalog.py` 串行调用 `zys.do` 接口，每次请求之间有间隔，且未利用研招网接口可并发的特性。
- **复现步骤**：
  1. 桌面端 → 设置 → 更新专业目录（勾选首次登录）。
  2. 观察进度条逐个学科推进，总耗时 30 分钟以上。
- **期望行为**：完整目录更新在 10 分钟内完成，且不触发研招网限流。
- **实际行为**：30 分钟+，用户体验差。
- **建议修复方向**：
  - **短期**：`update_majors_catalog.py` 改为 `asyncio` + `aiohttp` 并发请求，按学科分组批处理（批 10-15 个，批间 sleep 5s 避免限流）。
  - **中期**：缓存上次结果，仅探测已知有自设二级学科的学科，其他学科用缓存兜底。
  - **长期**：增量更新——只重新探测用户实际选择过的学科，其他保持缓存。
- **修复位置**：
  - `yam/scripts/update_majors_catalog.py`：彻底重写为 httpx + Playwright 激活方案。新增 `_call_zys_do_httpx` / `_playwright_activate_session` / `_httpx_enumerate_yjxkdm` / `_process_one_yjxkdm` 四个核心函数。`update_all_majors` 主流程改为：MajorsSearcher 仅用于登录（headless=False）→ 关闭 → 启动新 Playwright browser + httpx 并发。
  - 单 Playwright browser + 多 context 激活 session，每个 yjxkdm 独立 context 拿 seed_major + cookies，然后用 httpx 独立 cookie jar 接管枚举，避免 multi-page session 冲突。
  - `CONCURRENCY=15`（实测 30 会触发 IP 级限流导致部分 yjxkdm 枚举失败），`ZYDM_SLEEP_MS=400`。
  - 限流指数退避重试 3 次（2s→4s→8s），连续 3 次限流 break 当前段进入下一段。
  - first_list 为空时也走 httpx 枚举（如 0779 公共卫生与预防医学，zys.do 返回空但 0779Z1 流行病与卫生统计学等交叉学科可枚举到）。
  - 保留 `--login` / `--resume` 兼容、YAM_MAJORS_UPDATE_PROGRESS/DONE 协议、PARTIAL_JSON 增量保存（改为每批保存一次）。
  - `yam-desktop/src-tauri/src/commands.rs`：默认加 `--resume` 参数，partial JSON 不存在时等同从头跑。
  - `yam/majors_searcher.py`：优化 wait 时间（load→domcontentloaded，300ms→150ms），session 重试改进（total_count<=1 时也重试），跳过 initial_zydm 避免"请登录"。
- **预估效果**：219 个 yjxkdm × 平均 ~30s/yjxkdm / 15 并发 ≈ 7-8 分钟，达成 10 分钟目标。
- **备注**：httpx 直接请求方案**可行**（与早期 ISSUE-015 不同，zys.do 对 httpx 和 Playwright 行为一致），关键是用 Playwright 独立 context 激活 session 拿到有效 JSESSIONID 后传给 httpx。`MajorsSearcher.search_by_yjxkdm` 保留作为单 yjxkkdm 查询的备用实现，主流程已切到 httpx 方案。
- **验证（2026-07-22）**：桌面端 UI 触发完整跑，219 个 yjxkdm 全部成功，总 majors 2255（比之前的 1465 提升 53.9%），0 个 0 majors，0 个失败。关键 yjxkdm 修复验证：0270 统计学 1→2，0302 政治学 14→37（限流缓解），0301 法学 84→94，0779 公共卫生 0→2（first_list 为空走枚举修复）。

---

## ISSUE-024：登录状态缺乏统一管理，研招网 session/seed 散落各处

- **严重程度**：high
- **状态**：fixed
- **描述**：当前研招网登录凭证（`CASTGC` cookie / JSESSIONID / sign 签名）由 `yam/crawler/dynamic.py` 自行管理，存在 `data/cookies/` 目录；掌上考研目前未接入登录态。桌面端设置页缺少"登录状态"入口，用户无法主动检查/刷新/清除登录态，只能在采集失败时被动触发 `LoginRequiredModal`。多专业批量采集时，若 session 失效需重新登录，体验差。
- **复现步骤**：
  1. 桌面端启动采集，运行一段时间后研招网 session 失效。
  2. 弹出 `LoginRequiredModal`，用户登录后继续。
  3. 用户无法在不触发采集的情况下主动检查登录状态或刷新 session。
- **期望行为**：
  - 设置页提供"登录状态管理"入口，显示研招网（以及未来的掌上考研）当前登录状态、上次刷新时间。
  - 支持手动触发刷新（重新拉起浏览器登录窗口）和清除（删除本地 cookie 文件）。
  - 统一的 session/seed 存储抽象层，支持多数据源（研招网、掌上考研）扩展。
- **实际行为**：登录态完全由 Python 脚本内部管理，前端无感知，用户无控制入口。
- **建议修复方向**：
  - **短期**：
    1. `yam-desktop/src/pages/SettingsPage.tsx` 新增"登录状态"卡片，显示研招网 CASTGC 是否存在 + 上次更新时间。
    2. 新增 `check_login_status` / `refresh_login` / `clear_login` 三个 Tauri 命令，封装 Python 端 `DynamicReader.check_login` / `interactive_login` / `clear_cookies`。
  - **中期**：抽象 `SessionStore` 接口（`get`/`set`/`clear`/`is_valid`），研招网和掌上考研各一个实现，统一存到 `~/.yam/sessions/` 下分文件管理。
  - **长期**：登录态过期前自动刷新（基于上次刷新时间 + TTL），避免采集中途失败。
- **本次修复（2026-07-21，短期方案）**：
  - **方案**：在 Rust 端新增 `refresh_login` 和 `clear_login` 两个命令（`check_login_status` 此前已存在）；SettingsPage 顶部新增"研招网登录状态"卡片，包含状态徽章 + 凭证过期时间戳 + 上次检查时间 + 三个按钮（检查状态/刷新登录/清除登录）。`refresh_login` 复用 Python 端 `DynamicReader.interactive_login("", "")`，只登录不抓取种子（与 `login_yanzhao` 复合操作区分）。
  - **修改文件**：
    - `yam-desktop/src-tauri/src/commands.rs`：新增 `RefreshLoginResult` / `ClearLoginResult` 结构 + `refresh_login` 命令（调用 Python `DynamicReader().interactive_login("", "")`，解析 `YAM_REFRESH_LOGIN_RESULT true/false` 行）+ `clear_login` 命令（`std::fs::remove_file` 删除 `~/.yam/cookies/yz.chsi.com.cn.json`）。
    - `yam-desktop/src-tauri/src/main.rs`：注册 `refresh_login` + `clear_login` 两个 invoke_handler。
    - `yam-desktop/src/lib/db.ts`：新增 `RefreshLoginResult` / `ClearLoginResult` 类型 + `refreshLogin()` / `clearLogin()` 前端包装。
    - `yam-desktop/src/pages/SettingsPage.tsx`：新增"登录状态"section（图标 ShieldCheck/ShieldAlert + 状态徽章 + 三个按钮 + 错误信息）；useEffect 初始化时自动调用 `handleCheckLogin`。
  - **UI 状态**：登录→绿色已登录徽章 + ShieldCheck 图标；未登录→琥珀色未登录徽章 + ShieldAlert 图标；清除登录按钮在未登录时 disabled。
  - **验证**：`cargo check` 通过（14.82s）；`npm run build` 通过（522.75 kB → 527.93 kB，新增登录卡片代码）。**桌面端实测通过**（2026-07-21）：用户报告"全部成功"，三个按钮均正常工作。
  - **未做的部分**：未抽象 `SessionStore` 接口（中期方案）；未实现过期前自动刷新（长期方案）；未接入掌上考研登录态（当前掌上考研也未要求登录）。

---

## ISSUE-025：分数线数据未同步到工作区

- **严重程度**：medium
- **状态**：fixed
- **描述**：分数线采集（`zhangshangkaoyan.py` 的 `fetch_score_lines_batch`）、`score_lines` 表、`get_score_lines` 查询、前端 `WorkspacePage` 分数线显示代码均已存在，但 `sync_to_tauri.py` 的 `load_score_lines` 函数通过 `admission_plans` 表做 `department_name → department_id` 映射，而 `admission_plans` 只在早期采集 085410 时写入，导致 081200/083500 等专业的分数线无法同步到 `workspace_department_years` 表，前端"最低分"列全部显示 0。
- **复现步骤**：
  1. 桌面端采集 081200 或 083500。
  2. 工作区"最低分"列全部显示 0，展开院系详情无年份数据。
- **期望行为**：工作区正确显示每个院校该专业的历年最低分，展开院系详情显示 4 年分数线数据。
- **实际行为**：修复前 min_score 全为 0；修复后 081200 有 242/271 所学校有分数，083500 有 118/139 所学校有分数。
- **修复内容**（2026-07-22）：
  1. `yam/scripts/sync_to_tauri.py` 的 `load_score_lines` 移除 `admission_plans` 依赖，直接用 `school_id + major_code` 查询 `score_lines` 表。
  2. 按 `year` 分组取 `MIN(total)` 聚合，解决同一校同年多院系分数重复问题（`score_lines.department_id` 是掌上考研院系编号，与研招网 `departments.department_id` 是两套不同体系，无法直接关联）。
  3. 重新同步 081200（3567 条年份数据）、083500（1629 条）、085410（1547 条），0 重复。
  4. CDP 验证：华中科技大学 min_score=335，展开详情 4 年数据（2026:360, 2025:335, 2024:370, 2023:345）。
  5. **分级匹配改进**（2026-07-22）：`yam/crawler/zhangshangkaoyan.py` 的 `fetch_score_lines` 和 `fetch_score_lines_batch` 把 code 匹配从"6 位精确匹配"改为分级匹配策略——6 位精确 > 4 位一级学科 > 2 位门类，每年只保留最高优先级匹配。4 位/2 位匹配在 `note` 字段标注"一级学科参考线"或"门类级参考线"以区分专业级精确分数线。
- **分级匹配根因**：985 自划线院校（北航、复旦、浙大、国防科大等）在掌上考研 `schoolScore` 接口通常只返回 2 位门类码（如 `08`），原"6 位精确匹配"会过滤掉这些数据，导致 29 所 985 高校 min_score=0。改为分级匹配后，这些学校以"门类级参考线"形式展示分数。
- **覆盖率验证结果**（2026-07-22，sync_to_tauri 重新同步后）：

  | 专业 | 总学校 | 有分数 | 覆盖率 | 零分学校数 |
  |---|---|---|---|---|
  | 081200 计算机科学与技术 | 271 | 267 | 98.5% | 4 |
  | 083500 软件工程 | 139 | 136 | 97.8% | 3 |
  | 085410 人工智能 | 217 | 215 | 99.1% | 2 |

- **已知限制**：剩余 9 所零分学校（中国航空研究院 613/631/640 所、中国舰船研究院、网络空间部队第五十六研究所、陆军兵种大学、华北电力大学保定、绍兴文理学院）均为科研院所/军事院校/新更名学校，掌上考研数据库本身不公开其分数线，属数据源限制非 bug。985 高校分数线已全部覆盖（北航 295、复旦 300、浙大 300、国防科大 325、西安交大 320 等）。
- **后续优化方向**：`score_lines` 表增加 `department_name` 列，实现院系级别精确匹配（当前是学校+专业级别取最低分）；可考虑接入研招网 `scoreLines.do` 接口作为补充数据源。

---

## ISSUE-026：工作区"导出"按钮无任何功能

- **严重程度**：medium
- **状态**：fixed
- **描述**：`WorkspacePage` 顶部有"导出"按钮，但点击后无任何反应，无下拉菜单、无文件保存对话框、无 Toast 提示。用户无法把当前筛选结果导出为文件。
- **复现步骤**：
  1. 桌面端 → 工作区，选中任意专业。
  2. 点击顶部"导出"按钮。
  3. 无任何反馈。
- **期望行为**：点击后弹出格式选择（CSV/Excel/JSON），选择后调用 Tauri 文件保存对话框，把当前筛选后的院校列表写入文件。
- **实际行为**：按钮完全无响应。
- **建议修复方向**：
  - **短期**：
    1. `yam-desktop/src/pages/WorkspacePage.tsx` 给"导出"按钮加 `onClick`，调用 Tauri `dialog.save` + `fs.writeTextFile`。
    2. 默认导出 CSV（UTF-8 BOM，Excel 可直接打开），字段：院校名称、所在省份、层次、学习方式、考试方式、招生人数、研究方向等。
    3. 文件名：`{major_code}_{major_name}_{YYYYMMDD}.csv`。
  - **中期**：支持 Excel（.xlsx）格式，保留筛选/排序状态。
  - **长期**：支持导出完整采集数据（含院系详情、分数线），打包为 .zip。
- **本次修复（2026-07-21，短期方案）**：
  - **方案**：在 Rust 端实现 `export_csv` 命令（弹保存对话框 + 写文件），前端只调用 `invoke('export_csv', { defaultFilename, content })`，避免引入 `@tauri-apps/plugin-dialog` / `@tauri-apps/plugin-fs` 两个 npm 依赖。CSV 内容由前端构造（含 UTF-8 BOM、字段转义），Rust 端只负责 OS 级弹窗 + `std::fs::write`。
  - **修改文件**：
    - `yam-desktop/src-tauri/Cargo.toml`：新增 `tauri-plugin-dialog = "2"` 依赖。
    - `yam-desktop/src-tauri/src/main.rs`：注册 `tauri_plugin_dialog::init()` + 把 `commands::export_csv` 加入 `invoke_handler`。
    - `yam-desktop/src-tauri/capabilities/default.json`：新增 `"dialog:allow-save"` 权限。
    - `yam-desktop/src-tauri/src/commands.rs`：新增 `export_csv(app, default_filename, content) -> Result<Option<String>, String>` 命令——用 `app.dialog().file().add_filter("CSV", &["csv"]).set_file_name(&default_filename).blocking_save_file()` 弹窗，`std::fs::write` 写文件。返回 `Ok(None)` 表示用户取消。
    - `yam-desktop/src/pages/WorkspacePage.tsx`：新增 `handleExport` 函数（构造 CSV 表头+11 列字段+UTF-8 BOM+RFC4180 转义），给"导出"按钮加 `onClick` + `disabled` 状态；浏览器环境用 `Blob + a.download` 回退。
  - **字段**：院校代码、院校名称、省份、层次、最低分、招生人数、自划线、博士点、双一流、985、211（共 11 列）。
  - **文件名**：`{major_code}_{major_name}_{YYYYMMDD}.csv`，例：`085400_电子信息_20260721.csv`。
  - **验证**：`cargo check` 通过（含新依赖 tauri-plugin-dialog v2.7.2 编译）；`npm run build` 通过（522.75 kB → 522.75 kB，无新增 chunk）。**桌面端实测通过**（2026-07-21）：用户在 Tauri 桌面端窗口点击导出按钮后，成功弹出 OS 级保存对话框并完成 CSV 导出。

---

## ISSUE-027：工作区只显示单个专业数据，与"多专业批量采集"语义不一致

- **严重程度**：medium
- **状态**：fixed
- **描述**：用户在桌面端选择了 4 个不同的专业（如 083500 + 085400 + 085410 + 081200），但工作区只显示其中一个专业的院校数据，导出（ISSUE-026）的也只是当前显示专业的数据。与"多专业批量采集"的设计语义不一致——用户期望看到所有已选专业的合并视图，或至少能切换查看。
- **复现步骤**：
  1. 桌面端 → 添加专业 → 选 4 个不同专业。
  2. 进入工作区，看到只有 1 个专业的院校列表。
  3. 点击导出，CSV 文件只包含当前专业的院校数据。
- **期望行为**：工作区能合并显示所有已选专业的院校（按专业分组或加专业列），或提供专业切换 Tab 让用户在多专业间快速切换。导出应包含所有已选专业（或用户在导出对话框选择"仅当前专业/全部专业"）。
- **实际行为**：只显示 1 个专业，其他 3 个专业数据"看不到"。
- **建议修复方向**：
  - **短期**：工作区顶部加专业切换 Tab（类似浏览器 Tab），用户点击切换查看不同专业；导出范围跟随当前 Tab。
  - **中期**：合并显示所有已选专业的院校，加"专业代码"和"专业名称"列；筛选区加专业多选；导出包含所有已选专业。
  - **长期**：与 ISSUE-025（分数线采集）合并解决——分数线需要按专业+院校组合展示，多专业视图自然适配。
- **备注**：用户建议与 ISSUE-025 一起修，避免重复改动 WorkspacePage。优先级 medium，不阻塞当前任务推进。
- **本次修复（2026-07-23，分三阶段完成）**：
  - **阶段 1 工作区多专业合并展示 + 双视图切换**：用户拍板双视图（院校视图默认 + 招生计划视图）。`db.rs` 3 函数 `major_code: &str` → `&[&str]` + SQL `IN(...)`；`commands.rs` 改 `Vec<String>`；`db.ts` `fetchWorkspaceData(schoolId, majorCodes[], filters)`；`appStore.ts` 加 `viewMode: 'school'|'plan'` + `setViewMode`；`WorkspacePage.tsx` activeMajorCodes 派生 + 专业 Tab + 视图切换 + aggregatedSchools 聚合（MIN/SUM/OR）+ 展开按专业分组 + 收藏复合键 `${school_id}|${major_code}` + 导出加专业列。
  - **阶段 1 续 多专业 Tab 多选支持 + syncedMajorsRef 优化**：`currentMajor: string|null` → `selectedMajorCodes: string[]`（空=全部 / 非空=选中那些）；纯点击 toggle（全选自动清空避免歧义）；`syncedMajorsRef` ref 记录已 sync 专业，Tab 切换只查 DB（毫秒级），解决"切专业卡顿"反馈。
  - **阶段 2 招生计划视图**：每行 = (院校, 专业, 院系, 方向, 考试科目, 最新年份分数线)，纯扁平表格。`db.rs` 新增 `WorkspacePlanRow` + `get_workspace_plans`（JOIN schools+departments，单科分数筛选用 EXISTS 子查询避免行重复，`batch_get_department_years` 批量查 years 避免 N+1，Rust 侧排序）；`commands.rs` 新增 `fetch_workspace_plans`；`db.ts` 新增 `WorkspacePlanRow` + `fetchWorkspacePlans`；`WorkspacePage.tsx` 启用 plan 按钮 + plan state + 9 列 grid 表格 + 行展开多年分数表 + 客户端分页 + 导出 15 列带 `_招生计划` 后缀。设计决策：纯扁平（每行一个招生计划）/ 最新年份分数列（min_score + 招生人数）/ 复用现有筛选 / 导出跟随当前视图。
  - **验证**：`cargo check` ✅、`npm run build` ✅、CDP 自测 ✅（7 场景全过：后端单专业 1043 行/多专业 1506 行、表格加载、行展开、分页、视图切换）。详见 [docs/progress.md](file:///d:/yam/docs/progress.md) ISSUE-027 阶段 2 章节。

---

## ISSUE-028：导出格式仅支持 CSV，未支持 Excel/JSON

- **严重程度**：low
- **状态**：fixed
- **描述**：ISSUE-026 短期方案只实现了 CSV 导出，CSV 虽然能被 Excel 打开但缺乏格式（列宽、表头加粗、数字格式等）。用户希望未来支持更多格式。
- **复现步骤**：
  1. 工作区点击"导出"按钮。
  2. 弹出保存对话框，过滤器只有"CSV"一种。
- **期望行为**：保存对话框支持选择 CSV / Excel (.xlsx) / JSON 三种格式。
- **实际行为**：只能保存 CSV。
- **建议修复方向**：
  - **短期**：保留现状（CSV 已能满足基本需求）。
  - **中期**：用 `rust_xlsxwriter` crate 在 Rust 端生成 .xlsx；或前端用 `xlsx` (SheetJS) 库生成 .xlsx Blob。
  - **长期**：增加下拉菜单（ChevronDown 已保留），支持"仅当前专业/全部专业"、"仅院校列表/含院系详情/含分数线"等导出选项。
- **备注**：用户明确说"优先级不高，先记着就行"。
- **本次实现（2026-07-23，代码已实现；2026-07-24 用户桌面手动测试通过，状态 → fixed）**：
  - **方案**：Rust 端用 `rust_xlsxwriter` crate 生成 .xlsx；CSV/JSON 复用统一 `export_file` 命令（文本写入）；Excel 用独立 `export_excel` 命令（结构化 headers + rows）。前端重构 `handleExport` 为 `buildExportData` + `exportAsCsv/Excel/Json` + `doExport`，UI 改为下拉菜单（3 项 + click-away 关闭）。
  - **修改文件**：
    - [Cargo.toml](file:///d:/yam/yam-desktop/src-tauri/Cargo.toml)：新增 `rust_xlsxwriter = "0.96"`
    - [commands.rs](file:///d:/yam/yam-desktop/src-tauri/src/commands.rs)：删除 `export_csv`，新增 `export_file`（文本：CSV/JSON）+ `export_excel`（xlsx：bold 表头 + 手动列宽 + freeze_panes + serde_json::Value 单元格类型匹配）
    - [main.rs](file:///d:/yam/yam-desktop/src-tauri/src/main.rs)：注册 `export_file` + `export_excel`
    - [WorkspacePage.tsx](file:///d:/yam/yam-desktop/src/pages/WorkspacePage.tsx)：模块级 `ExportData` 类型 + `escapeField` 统一；`buildExportData` 构建双视图导出数据（院校 13 列 / 招生计划 15 列）；`exportAsCsv/Excel/Json` 三函数；下拉菜单 UI + click-away
  - **编译验证**：`cargo check` ✅、`npm run build` ✅
  - **CDP 自测**：脚本 [scripts/test_issue028_cdp.cjs](file:///d:/yam/scripts/test_issue028_cdp.cjs)（6 场景：CSV/Excel/JSON × 院校/招生计划视图）本次未跑通——诊断后确认非选择器问题（title 选择器命中、菜单项 DOM 均存在、点击生效），真实根因是测试运行时工作区数据为空，`buildExportData` 返回 null 走 `setError('当前没有可导出的数据')` 提前 return，未到达 invoke；脚本缺数据就绪前置检查，属脚本自身缺陷，非功能 bug
  - **手动测试**：2026-07-24 用户桌面端手动测试 CSV/Excel/JSON 三格式 × 院校视图/招生计划视图均通过，确认无功能问题，状态 → fixed

---

## ISSUE-029：数据采集流程串行 requests 调用，单专业 15-25 分钟

- **严重程度**：high
- **状态**：fixed（核心部分：fetch_departments + fetch_score_lines 已完成；fetch_school_list 种子抓取优化待后续）
- **描述**：桌面端 `CrawlingPage` 触发 `python -m yam.cli fetch --major <code> --force` 后，Python 端对每个院校串行调用 `requests.Session.post` 拉取院系详情 + `sleep(0.5s)` 间隔，271 所院校耗时 13-18 分钟。加上掌上考研分数线串行采集，单专业总耗时 15-25 分钟。ISSUE-023 已经验证 httpx + Playwright 激活 + 15 并发 + 限流指数退避方案能把类似工作从 30+ 分钟压缩到 7-8 分钟，本 ISSUE 套用同一模式优化数据采集。
- **复现步骤**：
  1. 桌面端选择一个新专业（如 081200 计算机科学与技术，271 所院校），种子文件已存在。
  2. 启动采集任务，观察 `BackgroundTaskPanel` 进度。
  3. 实际：单专业从 0% → 100% 耗时 15-25 分钟，进度推进缓慢（约每校 3-4 秒）。
- **期望行为**：单专业数据采集在 3-5 分钟内完成（10x 提速）。
- **实际行为**：15-25 分钟，瓶颈在串行 `fetch_departments` + `sleep(0.5s)`。
- **根因**：
  - `yam/crawler/yanzhao.py:125-157` `fetch_departments`：串行 `self.session.post(url, ...)` + `sleep(self.delay)` 每校，未利用 httpx 并发。
  - `yam/crawler/dynamic.py:306+` `fetch_school_list` 4-stage：省份扫描、多筛选组合均串行 `requests` 调用（仅 dwzys.do 阶段已用 aiohttp 并发）。
  - `ZhangShangKaoYanCrawler.fetch_score_lines`：同样是串行 requests 调用。
- **建议修复方向**：
  - **短期（本 ISSUE 范围）**：套用 ISSUE-023 模式重构三个核心函数：
    1. `fetch_departments` 改 `httpx.AsyncClient` + `asyncio.gather` 限流 15 并发 + 指数退避重试（"访问太频繁" 2→4→8s）。每个院校独立 cookie jar。
    2. `fetch_school_list` 省份扫描 + 多筛选组合改 httpx 并发（不同 ssdm 视为不同调用，研招网允许）。
    3. `fetch_score_lines` 同样改 httpx 并发。
    4. `cli.py fetch` 命令改 `asyncio.run(...)` 异步入口，保留 `YAM_TOTAL` / `YAM_ERROR` / `--force` / `--limit` 协议。
    5. Rust 端 `commands.rs` `run_crawl_task` 无需改动（已经按行解析 stdout）。
  - **预估效果**：
    - `fetch_departments`：13-18 min → 1-2 min（10x）
    - `fetch_score_lines`：类似 10x 提速
    - `fetch_school_list` 种子（仅首次）：30 min → 5-8 min
    - 整体（种子已存在）：15-25 min → 3-5 min
  - **长期**：抽象 `SessionStore` 接口（与 ISSUE-024 联动），让 httpx 层走统一 session 管理。
- **依赖与顺序**：
  - **必须先于 ISSUE-025 完成**：ISSUE-025 分数线采集应在 ISSUE-029 重构的 httpx 并发层之上实现，自动受益。
  - 与 ISSUE-024（SessionStore 抽象）有弱依赖：可先做 ISSUE-029 后做 ISSUE-024 抽象。
- **风险**：
  - 数据采集是核心功能，重构有回归风险。需对比重构前后的院校数 / 院系数 / 分数线数。
  - 限流风险：研招网对 `zydws.do` 已知有 IP 级限流（ISSUE-023 实测 30 并发触发），需保持 15 并发 + 指数退避。
- **备注**：ISSUE-023 httpx + Playwright 激活方案已在本仓库验证可行（commit 1a3fc04），技术栈和重试逻辑可直接复用。
- **修复记录（2026-07-22）**：
  - 新增 `yam/crawler/httpx_client.py`：共享 httpx 工具（`call_api_with_retry` 限流指数退避 2→4→8s + `gather_with_concurrency` 15 并发）
  - `yam/crawler/yanzhao.py`：新增 `fetch_departments_batch`（httpx 15 并发 + 限流退避，yjfxs.do 无需登录可高并发）
  - `yam/crawler/zhangshangkaoyan.py`：新增 `fetch_score_lines_batch`（两阶段：串行预解析 school_id + httpx 并发拉取 schoolScore）
  - `yam/cli.py`：`fetch` 命令改 `asyncio.run(_fetch_async(...))`，两阶段并发，保留 YAM_TOTAL/YAM_PROGRESS/YAM_DONE/YAM_ERROR 协议
  - `yam/fetcher.py`：`_run_fetch` 改 `asyncio.run(_run_fetch_async(...))`，暂停检查放在阶段之间
  - 协议兼容：YAM_PROGRESS 格式 `{current}/{total} 院系|分数线 {name}`，commands.rs `process_stdout_line` 无需改动（total 会被 progress 行覆盖）
  - 集成测试通过：081200 --limit 3 --force，3/3 院系 + 3/3 分数线全部成功，YAM_TOTAL 6，YAM_DONE 3 0 0
  - **待后续**：`fetch_school_list` 省份扫描 + 多筛选组合的 httpx 并发优化（仅首次种子抓取触发，大部分专业已有种子，优先级低）
- **三阶段降级重试增强（2026-07-22）**：
  - 问题：v3 测试 271 所中 22 所残留失败，错误**全部为"访问太频繁"**（研招网 IP 级限流）。失败院校 school_id 连续（368317-368436），集中在湖北/广东/广西省代码段——符合"省份限流窗口未冷却"特征。第二轮 5 并发 + 0.3s 延迟仍触发限流（有效速率 ~16 req/s 超阈值）。
  - 解决：`yam/crawler/yanzhao.py` 新增 `fetch_departments_with_retries` 方法，三阶段降级：
    - 第一轮 15 并发 0s 延迟（快速，预期 ~30% 失败）
    - 等待 30s 限流窗口冷却
    - 第二轮 3 并发 1.5s 延迟（保守，预期剩余 ~5-10 所失败）
    - 等待 60s
    - 第三轮 1 并发 2s 延迟（兜底，预期 0 失败）
  - `cli.py` / `fetcher.py` 改为单次调用 `fetch_departments_with_retries`，移除重复的两轮重试代码
  - **CDP 端到端验证通过（v4 测试）**：081200 全量 271 所院系，**100% 成功率（271/271，0 失败）**，总耗时 4:59（299s）
    - 时间线：t=1:18 第一轮完成 271 所 → t=2:09 30s 冷却后第二轮启动 → t=3:28 第二轮完成 → t=4:31 60s 冷却后第三轮兜底 → t=4:59 阶段 2 分数线完成
- **日志显示优化（YAM_LOG 协议 + level 着色 + 去冗余，2026-07-22）**：
  - 问题：v4 验证时采集日志含 700+ 条"正在处理：院系 XXX (n/542)"冗余条目，刷屏且无法体现三阶段降级策略的执行过程
  - 方案：新增 `YAM_LOG {level} {message}` 协议贯通 Python → Rust → 前端
    - Python：`yanzhao.py` 的 `on_log` 签名改为 `(level, msg)`，三阶段日志带 `info`/`warn`/`success` level；`cli.py` 输出 `YAM_LOG {level} {msg}` 协议 + 终端彩色显示；`fetcher.py` 转发到 NiceGUI `_log`
    - Rust：`commands.rs` 新增 `CrawlLogPayload { level, message }` struct，`process_stdout_line` 解析 `YAM_LOG ` 前缀并 `app_handle.emit("crawl-log", payload)` 推送到前端
    - 前端：`appStore.ts` 的 `logs` 类型扩展 `level?` 字段；`CrawlingPage.tsx` 监听 `crawl-log` 事件追加日志，去掉每院校冗余日志（原 700+ 条），按 level 着色（info 灰、warn 琥珀+⚠、success 翠绿+✓、error 红+✗）
  - CDP UI E2E 验证通过（081200 触发采集）：总日志数 14 条（原 700+ → 14），10 条阶段日志全部通过 YAM_LOG 协议正确推送，level 着色全部生效（warn 2 + success 2 + error 0），冗余院系日志 0 条，总耗时 5 分钟，271/271 100% 成功

---

## ISSUE-030：分数线语义、血缘和聚合规则导致批量数据失真

- **严重程度**：high
- **状态**：fixed（真实库085410重采、同步、事实不变量审计和界面复验完成）
- **描述**：工作区“最低分”并非单一指标。当前链路会丢失掌上考研原始专业代码和逐年请求状态，对同校同专业同年多条记录分别取各列 `MIN`，把校级聚合复制给所有计划，再把所有历史年份最低值写入院校主分数。结果会出现不存在于原始响应的分数组合、历史低值替代最新年份、参考线参与主列表排序，以及最新招生年份分数缺失却无法解释。
- **用户复现样本**：
  1. 西北农林科技大学 `085410`：2026=264、2025=260，但院校视图因跨年取最小显示260。
  2. 武汉大学 `085410`：2026掌上考研接口返回“专硕获取国家线数据异常”；2025无6位精确记录，使用`0854`一级学科参考线285。
  3. 武汉大学2025两条原始记录为`285/50/50/80/90`与`350/50/50/100/85`，当前按列MIN生成原始数据中不存在的`285/50/50/80/85`。
- **全库影响（2026-07-30真实用户库）**：
  - 4个专业、855所学校、3855条源分数记录。
  - 594个专业-学校组合的历史最小值与最新年份值不同。
  - 607组同校同年多记录，其中254组总分不同。
  - 11组按列MIN生成不存在于源记录的分数组合。
  - 一级学科/门类参考线复制后形成934条计划年份记录。
  - 32个专业-学校组合为`score_lines success`但无分数记录，250个专业-学校组合在院系成功后仍少于4个分数年份。
- **系统性根因**：原始证据未持久化、按列MIN、跨年份最小值、校级结果复制到方向、学校级fetch状态过粗、分数待采集集合依赖院系待采集集合、分数年份与计划年份混用、参考线标签未约束排序筛选。
- **实施状态**：已增加原始证据字段和逐年请求状态，分数任务已与院系任务解耦；同步改为每年选择一条完整原始记录，院校主分数使用最新可用专业级记录，历史分数年份不再复制当前招生人数；Rust 已修复跨年份单科条件拼接并排除4位/2位参考线进入主分数，前端和导出已增加双年份与方向 fallback 类型。真实库已完成定向重采、同步和审计，武汉大学、西北农林等黄金样本及界面显示均已复验。剩余通用模型边界转入 ISSUE-031。
- **研究文档**：[issue-030-score-line-research.md](file:///d:/yam/docs/issue-030-score-line-research.md)

---

## ISSUE-031：来源映射、时间版本、未知状态和计划稳定键尚未独立建模

- **严重程度**：medium
- **状态**：open
- **描述**：ISSUE-030 已阻止错误分数组合和误导性展示，但研究同时暴露了更通用的数据模型边界：不同数据源实体缺少显式映射证据；当前招生快照与历史事实未完整版本化；未知、未公布、失败和 fallback 尚未在所有表中使用独立状态；`plan_key` 仍包含可能随年度变化的展示字段。
- **影响范围**：
  - 无可靠院系映射的学校专业参考证据仍投影到多个计划，虽然已有 `school_major` 粒度标识，但尚未拆为独立共享实体。
  - 当前考试科目、研究方向、学习方式和专项计划可能被误解为历史年份事实。
  - 部分工作区字段仍用 `0` 或空字符串表示未知状态。
  - 考试科目、方向名称或院系名称变化可能产生新的 `plan_key`，影响收藏与历史关联。
  - 导出和下游统计仍需防止重复计算共享参考证据。
- **建议方向**：按 `Raw Evidence → Source Entity → Canonical Mapping → Year/Version → Derived Aggregate → Product Projection` 分层；为映射保存规则与置信度；将当前计划快照、历史计划、分数年份和录取统计分模；稳定身份与年度可变字段分离。
- **不属于当前发布阻塞项**：现有 UI 已明确展示分数粒度、年份、请求状态和 fallback 类型，ISSUE-030 的用户可见错误已闭环。
