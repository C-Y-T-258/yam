# 已知问题与 Bug 跟踪

## 记录规范

- 编号：ISSUE-XXX 递增
- 严重程度：blocker / high / medium / low
- 状态：open / in-progress / fixed
- 每个问题包含：描述、复现步骤、期望行为、实际行为、建议修复方向

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
- **状态**：open
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
