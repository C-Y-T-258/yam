# 数据采集问题上下文提示词

> 下一会话请优先阅读本文件，再处理任何与数据采集、桌面端采集流程、专业选择/添加相关的任务。

## 项目基本信息

- 工作区：`d:\yam`
- 桌面端目录：`d:\yam\yam-desktop`
- 后端目录：`d:\yam\yam`
- 桌面端 DB：`~/.yam/data/yam-desktop.db`
- Python 后端 DB：`~/.yam/data/yam.db`
- 登录 cookie 路径：`~/.yam/cookies/yz.chsi.com.cn.json`

## 已修复的数据采集问题（2026-07-15 至 2026-07-16）

以下问题已修复，修复后验证不要再重复踩坑：

### 1. 任务状态死锁：“已有其他采集任务在运行”

- **根因**：采集任务异常终止时 `running` 标志未重置，后续任务被拒绝。
- **修复**：`commands.rs` 将采集逻辑拆分为 `run_crawl_task`，确保任何情况下都重置 `running=false` 和 `done=true`；新增 `cancel_crawl` / `reset_crawl` 命令 kill 子进程并清空状态。
- **遗留问题**：前端 `CrawlingPage` 仍会重复调用 `runCrawl`，导致日志里同时出现"启动采集任务"和"启动采集失败：已有采集任务在运行"；将在方案 A 中用原子启动锁解决。

### 2. 采集返回 0 所学校（空数据）

- **根因 1**：`yam/crawler/yanzhao.py` 的 `fetch_schools()` 在本地种子文件缺失时直接返回空列表。
- **修复 1**：种子缺失时自动调用 `DynamicYanZhaoCrawler` 抓取；抓取失败时抛出 `LoginRequiredError` 或 `RuntimeError`，不再静默返回空列表。
- **根因 2**：动态抓取失败被静默吞掉。
- **修复 2**：`yam/crawler/dynamic.py` 无登录 cookie 时立即失败；`yanzhao.py` 在动态抓取失败时向上抛出异常。

### 3. 全跳过（如 085410 217 所全 skip）

- **根因**：`fetch_log` 中已有成功记录时 CLI 默认跳过所有院校。
- **修复**：`yam/cli.py` 新增 `--force` 参数；Tauri 桌面端采集命令默认传入 `--force`。

### 4. 未采集成功就添加专业

- **根因**：`MajorSelectPage.tsx` 里用户一点“确认”就调用 `addMajor`，不管后续采集是否成功。
- **修复**：
  - `MajorSelectPage.tsx`：`handleConfirm` 只设置 `crawlTarget`，不再 `addMajor`。
  - `CrawlingPage.tsx`：`syncWorkspaceData` 成功后才调用 `addMajor`，并更新 `schoolCount`/`lastUpdated`。

### 5. Python CLI 错误信息无法传递到 Tauri 前端

- **根因**：Python Windows 默认 GBK 输出，`BufReader::lines()` 丢弃含中文行。
- **修复**：`commands.rs` 设置 `PYTHONIOENCODING=utf-8` / `PYTHONUTF8=1`，改用 `String::from_utf8_lossy()` 解码；`cli.py` 输出 `YAM_ERROR ` 结构化协议。

### 6. 985/211 标签缺失

- **根因**：研招网 `b985` 字段不可靠（全 0）且无 `b211` 字段。
- **修复**：`sync_to_tauri.py` 用掌上考研 `/school/schoolList` 接口按学校名查询 `is_985`/`is_211`/`syl`，结果缓存；`WorkspacePage.tsx` 改为彩色标签显示。

---

## 方案 A：内置登录向导 + 原子启动锁（当前目标）

### 背景

当前采集流程仍要求用户在终端执行 `yam fetch-seeds -m <code> --login` 完成研招网登录，对普通用户过于抽象。同时 `CrawlingPage` 存在重复调用 `runCrawl` 的问题，日志里同时出现"启动采集任务"和"启动采集失败：已有采集任务在运行"。

### 目标

1. **内置登录向导**：桌面端检测到未登录时，直接弹出浏览器窗口引导用户登录并保存 cookie，无需终端命令。
2. **原子启动锁**：Rust 后端用原子操作确保同一时间只有一个采集任务在运行。
3. **状态机重构**：CrawlingPage 严格区分准备中/运行中/已完成/失败/取消五种状态，统一由 `reset_crawl` / `run_crawl` / `cancel_crawl` 驱动。

### 设计要点

#### 1. 登录向导入口

- **新增 Tauri 命令**：`check_login_status() -> Result<LoginStatus, String>`
  - 读取 `~/.yam/cookies/yz.chsi.com.cn.json`，检查是否存在有效 SESSION cookie。
  - 返回 `{ logged_in: bool, expires_at?: string }`。
- **新增 Tauri 命令**：`login_yanzhao(major_code: String) -> Result<LoginResult, String>`
  - 调用 `DynamicYanZhaoCrawler.login_and_fetch(major_code)` 弹出可见浏览器窗口。
  - 用户登录并关闭窗口后，返回 `{ success: bool, school_count: i32, error?: string }`。
  - 登录成功即抓取该专业种子文件，后续采集可直接开始。
- **Python 端调整**：
  - `yam/crawler/dynamic.py` 的 `login_and_fetch` 返回值从 `int` 改为 `dict`（包含 school_count、cookie_path）。
  - `yam/crawler/yanzhao.py` 的 `fetch_schools()` 在 `LoginRequiredError` 时不再提示"运行 yam fetch-seeds"，而是抛出干净异常，由前端决定如何引导。
  - `yam/cli.py` 的 `fetch` 命令错误提示改为"请在桌面端完成登录向导"或保留 CLI 提示（通过环境变量或参数区分调用来源）。

#### 2. 原子启动锁

- **Rust 端改造**：`yam-desktop/src-tauri/src/commands.rs`
  - `CrawlProgress` 中 `running` 改用 `AtomicBool` 或 `Mutex` 内联检查+设置。
  - `run_crawl` 入口处使用 `std::sync::atomic::AtomicBool::compare_exchange`（或 Mutex 包裹的布尔）检查并设置 `running=true`，失败立即返回 `"已有采集任务在运行"`。
  - 任务结束（成功/失败/取消）时原子复位 `running=false`，`done=true`。
  - 保持 `child_pid` 在 Mutex 内，kill 时加锁。

#### 3. 前端状态机重构

- **CrawlingPage.tsx**：
  - 引入本地状态 `status: 'idle' | 'checking' | 'running' | 'done' | 'error' | 'cancelled'`。
  - 组件 mount 时只做一次 `getCrawlProgress()`，根据后端状态设置 `status`：
    - `running=true` → 继续监听（同专业）或报错（不同专业）。
    - `done=true && major_code === crawlTarget.code` → 显示结果；`success>0` 则自动同步跳转，`error` 则显示错误。
    - `done=true && major_code !== crawlTarget.code` → 调用 `reset_crawl` 后启动新采集。
    - `done=false && running=false` → 调用 `reset_crawl` 后启动新采集。
  - 添加 `isLaunching` ref，确保 `runCrawl` 只调用一次。
  - 登录失败时弹出 `LoginRequiredModal`，点击"去登录"调用 `login_yanzhao(crawlTarget.code)`，登录成功后自动重新启动采集。
- **新增组件**：`LoginRequiredModal.tsx`
  - 文案："采集需要研招网登录，点击下方按钮打开浏览器完成登录。"
  - 按钮："打开登录窗口"、"取消"

#### 4. 错误提示统一

- 所有"请先运行 yam fetch-seeds..."的终端命令提示，从桌面端 UI 中移除。
- CLI 模式下保留原有提示（通过 `YAM_DESKTOP` 环境变量区分：Tauri 启动 Python 时设置 `YAM_DESKTOP=1`，CLI 模式不设置）。

### 关键代码文件

| 文件 | 作用 |
|------|------|
| `yam/crawler/dynamic.py` | 动态爬虫、登录窗口、cookie 保存 |
| `yam/crawler/yanzhao.py` | 研招网爬虫、种子自动抓取 |
| `yam/cli.py` | CLI 入口、区分桌面/CLI 错误提示 |
| `yam-desktop/src-tauri/src/commands.rs` | Tauri 命令、原子启动锁、登录状态检查 |
| `yam-desktop/src-tauri/src/main.rs` | 注册新命令 |
| `yam-desktop/src/lib/db.ts` | 前端调用 `checkLoginStatus` / `loginYanzhao` |
| `yam-desktop/src/pages/CrawlingPage.tsx` | 采集状态机、登录失败引导 |
| `yam-desktop/src/components/LoginRequiredModal.tsx` | 登录向导弹窗（新增） |

### 验收标准

- [ ] 未登录状态下选择专业采集，弹出登录窗口而非终端命令提示。
- [ ] 登录成功后自动抓取种子并继续采集流程。
- [ ] 快速双击"确认添加"/"更新"按钮不会导致重复启动采集。
- [ ] 日志中不再同时出现"启动采集任务"和"启动采集失败：已有采集任务在运行"。
- [ ] `npm run build` 通过，`cargo check` 通过，Python 语法检查通过。

## 当前采集流程正确路径（方案 A 实施后）

1. 用户在 `MajorSelectPage` 或 `SplashScreen` 选择专业。
2. `handleConfirm` 调用 `reset_crawl()` 后设置 `crawlTarget`，跳转 `CrawlingPage`。
3. `CrawlingPage` mount 时检查后端状态并原子启动 `runCrawl()`。
4. Python CLI 检测到未登录 → 输出 `YAM_ERROR 需要登录研招网...`。
5. 前端检测到登录错误 → 显示 `LoginRequiredModal`。
6. 用户点击"打开登录窗口" → Tauri 调用 `login_yanzhao(code)` 弹出浏览器。
7. 登录成功并抓取种子后，前端自动重新 `reset_crawl` + `run_crawl`。
8. 采集完成 → 自动同步 → `addMajor` → 进入工作区。

## 关键代码文件

| 文件 | 作用 |
|------|------|
| `yam/crawler/yanzhao.py` | 研招网爬虫、种子自动抓取、异常抛出 |
| `yam/crawler/dynamic.py` | 动态爬虫、登录检测 |
| `yam/cli.py` | CLI 入口、`--force` 参数 |
| `yam-desktop/src-tauri/src/commands.rs` | Tauri 采集/同步命令、任务状态管理 |
| `yam-desktop/src/pages/CrawlingPage.tsx` | 采集页面、进度轮询、同步成功后 addMajor |
| `yam-desktop/src/pages/MajorSelectPage.tsx` | 专业选择、只设 crawlTarget |
| `yam-desktop/src/stores/appStore.ts` | crawledMajors、addMajor、updateMajor |

## 常用验证命令

```powershell
# 检查 Rust 后端
cd d:\yam\yam-desktop\src-tauri
cargo check

# 检查前端构建
cd d:\yam\yam-desktop
npm run build

# 手动测试 CLI 采集（会访问研招网，需要登录时按提示操作）
python -m yam.cli fetch -m 085410 --force

# 手动同步到桌面端 DB
python -m yam.scripts.sync_to_tauri --major-code 085410

# 检查 Tauri DB 是否写入
sqlite3 ~/.yam/data/yam-desktop.db "SELECT COUNT(*) FROM workspace_schools WHERE major_code='085410';"
```

## 已知限制

- 动态抓取需要研招网登录 cookie，首次使用无 cookie 时会快速失败并提示登录。
- 网页端无法调用 Python 后端，只能测试 UI 流程；真实采集必须在桌面端 Tauri 环境中验证。
- Bug 跟踪使用 `docs/known-issues.md`，不使用 GitHub Issues。
