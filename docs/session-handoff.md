# 方案 A 交接文档（登录向导 + 原子启动锁 + 状态机重构）

> 本文档记录“内置研招网登录向导 + 采集任务启动锁优化”的设计与实现要点。
> 详细历史问题与踩坑记录见 [`docs/data-collection-handoff-prompt.md`](data-collection-handoff-prompt.md)。

## 目标

1. **内置登录向导**：桌面端检测到未登录研招网时，自动弹出浏览器窗口引导用户登录并保存 cookie，无需用户在终端手动执行 `yam fetch-seeds -m <code> --login`。
2. **原子启动锁**：Rust 后端使用原子操作确保同一时间只有一个采集任务在运行，避免前端重复调用导致“已有采集任务在运行”与正常流程日志并存。
3. **采集流程状态机重构**：后端任务状态统一为 `idle / running / completed / failed / cancelled` 五种状态；前端的 `checking / syncing / no-target` 仅作为页面展示阶段，不再作为后端任务状态。

## 核心设计

### 1. 登录状态与向导

- **Tauri 命令**：
  - `check_login_status()`：检查 `~/.yam/cookies/yz.chsi.com.cn.json` 中是否存在有效的 `CASTGC` 等登录凭证，返回 `{ logged_in, expires_at? }`。
  - `login_yanzhao(major_code)`：调用 `DynamicYanZhaoCrawler.login_and_fetch`，弹出可见浏览器让用户登录，成功后返回种子抓取结果。
  - `refresh_login()` / `clear_login()`：手动刷新或清除登录态。

- **Python 端**：
  - `yam/crawler/dynamic.py` 中的 `DynamicReader.interactive_login` 和 `DynamicYanZhaoCrawler.login_and_fetch`。
  - 登录成功后 cookie 持久化到 `~/.yam/cookies/`。

- **前端**：
  - 设置页展示登录状态卡片（已登录/未登录徽章 + 时间戳 + 操作按钮）。
  - 采集前若未登录，弹出 `LoginRequiredModal` 引导登录。

### 2. 原子启动锁

- Rust 端 `commands.rs` 中的 `CrawlState` 使用 `AtomicBool`。
- `run_crawl` 入口使用 `compare_exchange` 确保只有一个任务运行。
- 任务结束（成功/失败/取消）时必须原子复位 `running=false`。
- `child_pid` 用 `Mutex` 保护，`cancel_crawl` 加锁后 kill。

### 3. 状态机与 CrawlingPage

- 状态：`idle | checking | running | done | error | cancelled | no-target`。
- 组件 mount 时只调用一次 `getCrawlProgress()`，根据后端状态决定行为。
- 避免重复调用 `runCrawl`（使用 ref 守卫）。
- 进度通过 `YAM_PROGRESS` / `YAM_LOG` / `YAM_DONE` / `YAM_ERROR` 协议驱动 UI。

## 相关文件

### Rust / Tauri
- `yam-desktop/src-tauri/src/commands.rs`
- `yam-desktop/src-tauri/src/main.rs`（命令注册）
- `yam-desktop/src/lib/db.ts`（前端封装）

### Python
- `yam/crawler/dynamic.py`
- `yam/crawler/yanzhao.py`
- `yam/cli.py`
- `yam/fetcher.py`（NiceGUI 版）

### 前端
- `yam-desktop/src/pages/CrawlingPage.tsx`
- `yam-desktop/src/pages/SettingsPage.tsx`
- `yam-desktop/src/components/LoginRequiredModal.tsx`
- `yam-desktop/src/stores/appStore.ts`（crawl 状态）

## 验证要点

- 未登录时触发采集 → 弹出登录向导 → 登录后自动继续。
- 重复点击“开始采集” → 只启动一次，后续返回“已有任务在运行”。
- 采集过程中切页面再切回 → 不重复启动。
- 取消后状态正确重置，可重新启动。
- 日志使用 `YAM_LOG {level} {msg}` 结构化推送，带阶段徽章和已耗时。

## 参考

- 完整踩坑历史与旧流程问题：[docs/data-collection-handoff-prompt.md](data-collection-handoff-prompt.md)
- 项目总路线图：[docs/roadmap.md](roadmap.md)
- 已知问题跟踪：[docs/known-issues.md](known-issues.md)

---

**维护说明**：本文件为方案 A 的设计摘要。实现细节以代码和上述文档为准。
