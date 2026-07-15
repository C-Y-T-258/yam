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
