# 会话逐轮分析记录

> 来源文档：`d:\yam\Full UI Test Prompt Document.md`（36,529 行，约 1,061KB）
> 分析日期：2026-07-24
> 分析范围：完整会话历史，从阶段 2（WebView2 分发验证）到阶段 5（CI/CD 发布流水线）全部闭环

---

## 总览

| 阶段 | 主题 | 对话轮次（估计） | 完成状态 | 涉及文件数 |
|------|------|:---:|:---:|:---:|
| 2 | WebView2 安装验证与文档 | 8 | ✅ 完成 | ~5 |
| 2 | 内置登录向导 | 4 | ✅ 完成 | ~4 |
| 3 | 采集状态机 + 原子启动锁 + ISSUE-022 | 6 | ✅ 完成 | ~7 |
| 4 | 五层规范化数据模型 + 方向级功能 | 12 | ✅ 完成 | ~12 |
| 5 | 自动化测试 + 错误恢复 + 安全 + 性能 + 诊断 + CI/CD | 20 | ✅ 完成 | ~20 |

---

## 一、阶段 2：WebView2 安装验证与文档

### 轮次 1：WebView2 安装验证 B（已有 WebView2 路径）

| 项目 | 内容 |
|------|------|
| **用户意图** | 先执行 C（文档写清楚所有情况），然后执行 B（当前机器验证） |
| **执行操作** | 写入 `release/INSTALL-VERIFICATION.md` 新增完整章节，执行 NSIS 安装包测试 |
| **关键发现** | 启动时弹出空 Python 控制台窗口 |
| **根因定位** | Rust 端多处 `std::process::Command` 调用 python 未隐藏控制台 |
| **修复** | 实现 `new_hidden_command()` + `CREATE_NO_WINDOW (0x08000000)` |
| **涉及文件** | `commands.rs`、`release/INSTALL-VERIFICATION.md`、`release/RELEASE-NOTES.md`、`docs/roadmap.md`、`docs/progress.md` |
| **验证** | NSIS + Portable 均通过，无控制台窗口 |
| **当前状态** | 已完成，代码存在于当前工作区 |

### 轮次 2：WebView2 测试优先级讨论

| 项目 | 内容 |
|------|------|
| **用户意图** | 真诚询问有没有必要测试无 WebView2 的 Win10/Win11 |
| **AI 分析** | Win11 几乎都预装 WebView2；Win10 少量缺失但真实存在 |
| **建议优先级** | 干净 Win10 虚拟机 > 已有 WebView2 > 干净 Win11 |
| **用户决策** | "不做验证了"——Win10 没 WebView2 也是极少数 |
| **当前状态** | 决策已记录，阶段 2 分发验证标记完成 |

---

## 二、阶段 3：采集稳定（登录向导 + 原子锁 + 状态机 + ISSUE-022）

### 轮次 3：阶段 3 全面盘点

| 项目 | 内容 |
|------|------|
| **用户意图** | 继续推进阶段 3 |
| **执行操作** | 对 roadmap/progress/known-issues/session-handoff 与代码做完整交叉核对 |
| **核心发现** | 登录向导主体已落地但缺采集前预检；状态机不是文档定义的五状态机；原子锁可被 `reset_crawl` 绕过 |
| **方法** | 只读审计，绘制完整采集链路 Mermaid 流程图 |
| **涉及文件** | `CrawlingPage.tsx`、`commands.rs`、`db.ts`、`SettingsPage.tsx`、`dynamic.py`、`cli.py`、`roadmap.md`、`progress.md` |
| **当前状态** | 盘点已记录，后续逐项修复 |

### 轮次 4：登录向导完整盘点

| 项目 | 内容 |
|------|------|
| **用户意图** | （AI 自动推进） |
| **完成项** | `LoginRequiredModal` 已实现、`check_login_status` 已实现、Cookie 自动保存已实现、登录/刷新/清除三条命令已实现 |
| **缺口 A** | 采集前没有主动检查登录状态，而是先启动失败再弹窗 |
| **缺口 B** | 登录状态只检查 Cookie 文件存在，不做服务端验证 |
| **缺口 C** | `login_and_fetch()` 与 `interactive_login()` 存在重复 `init()` 调用 |
| **涉及文件** | `LoginRequiredModal.tsx:4-64`、`commands.rs:809-894`、`CrawlingPage.tsx:90-109`、`dynamic.py:716-754` |
| **当前状态** | 后续已修复缺口 A，B/C 保持低优先级 |

### 轮次 5：采集状态机盘点

| 项目 | 内容 |
|------|------|
| **关键发现** | 文档自身口径冲突：roadmap 写"五状态"，handoff 文档列六/七状态 |
| **前端** | 声明 7 个值但 `cancelled` 从未进入状态 |
| **后端** | 没有状态枚举，用 `running/done/error` 布尔组合推导 |
| **缺口** | 无共享状态枚举、取消与失败混用、状态迁移无集中管理 |
| **涉及文件** | `CrawlingPage.tsx:18-83`、`commands.rs:340-421`、`db.ts:796-807`、`session-handoff.md:6-41` |
| **当前状态** | 后续已实现统一五状态机 |

### 轮次 6：原子启动锁盘点

| 项目 | 内容 |
|------|------|
| **已完成** | `running` 是 `AtomicBool`、`run_crawl` 使用 `compare_exchange`、前端 `isLaunchingRef` |
| **缺口 A** | `reset_crawl` 能绕过原子锁——先 kill 子进程再重置，然后 `run_crawl` 重新获取锁 |
| **缺口 B** | 多个前端入口无条件调用 `reset_crawl`（专业选择页、管理页、采集页各一次） |
| **缺口 C** | `AtomicBool` 置于 `Mutex` 内，原子收益有限 |
| **缺口 D** | 前端 `isLaunchingRef` 异常时不复位 |
| **涉及文件** | `commands.rs:424-433`、`MajorSelectPage.tsx:183-196`、`MajorManagementPage.tsx:31-41`、`CrawlingPage.tsx:90-109` |
| **当前状态** | 后续已收紧原子边界 |

### 轮次 7：ISSUE-022 盘点

| 项目 | 内容 |
|------|------|
| **旧定义** | `disabled=true` 专业卡住 |
| **新定义** | "可见即可查"，七类专业状态 |
| **已完成** | 前端切到 `majors_realtime.json`（2255 专业，无 enabled 字段） |
| **缺口** | CLI 仍保留旧 `enabled` 分支、七状态模型未实现、"暂无公开数据"和"接口不可达"无区分 |
| **涉及文件** | `known-issues.md:37-574`、`roadmap.md:86-127`、`cli.py:62-74`、`config.py:44-58` |
| **当前状态** | 后续已闭环（统一数据源 + 结构化错误码） |

### 轮次 8-9：阶段 3 全部闭环实施

| 项目 | 内容 |
|------|------|
| **实施内容** | 1. 收紧 `reset_crawl`（运行中拒绝重置，仅显式取消可终止）
2. 登录预检（启动前 `checkLoginStatus`，未登录直接弹窗）
3. 五状态机（Rust 后端统一 `idle/running/completed/failed/cancelled`）
4. ISSUE-022 闭环（实时目录为主数据源，删除 `enabled` 拒绝路径）
5. 结构化错误（`UNKNOWN_MAJOR/LOGIN_REQUIRED/NO_PUBLIC_DATA/UNREACHABLE/FAILED`）
6. 局部恢复（桌面端默认不传 `--force`，依据 `fetch_log` 跳过成功项）
7. 专业级重试（失败页新增"重试失败项"） |
| **涉及文件** | `commands.rs`、`CrawlingPage.tsx`、`BackgroundTaskPanel.tsx`、`db.ts`、`appStore.ts`、`config.py`、`cli.py` |
| **验证** | `python compileall`/`npm run build`/`cargo check`/编辑器诊断均通过 |
| **当前状态** | 已完成，29 个 ISSUE 全部 fixed |

---

## 三、阶段 4：数据模型统一与方向级分析

### 轮次 10：阶段 4 全面盘点

| 项目 | 内容 |
|------|------|
| **用户意图** | 继续推进阶段 4 |
| **盘点范围** | 正式五层模型、方向级比较/筛选/排序、多方向展开、趋势/收藏/导出粒度、数据来源/可信度、数据质量检测 |
| **核心结论** | UX 展示层完成度较高，但正式模型、数据真实性和方向分析未闭环 |
| **关键发现** | ① Major 无正式实体 ② Department 与 Direction 混在一起 ③ 校专业分数被复制到所有方向（最严重的数据真实性缺口）④ 同步链路丢失 `source/updated_at` |
| **涉及文件** | Python `db.py/models.py`、`sync_to_tauri.py`、Rust `db.rs`、TS `db.ts/shared/types.ts`、`WorkspacePage.tsx` |
| **当前状态** | 盘点已记录，逐项修复 |

### 轮次 11-12：分数线粒度与可信度闭环 + 方向 fallback

| 项目 | 内容 |
|------|------|
| **实施内容** | 1. 同步链路贯通 `score_scope/source/updated_at/match_note`
2. 院校详情/计划视图/导出统一显示分数粒度（"院校专业参考线"→"门类参考线"）
3. 统一空方向 fallback（"考试科目→专项计划→未注明研究方向"）
4. 删除详情左栏硬编码 `学费8000元/年、学制3年、更新时间2025-05-20` |
| **涉及文件** | `sync_to_tauri.py`、`db.rs`、`db.ts`、`WorkspacePage.tsx`、`Modals.tsx` |
| **验证** | `compileall`/`cargo check`/`npm run build` 通过；隔离同步 `081200` 271 校/1043 院系/3567 年份 |
| **当前状态** | 已完成 |

### 轮次 13-14：数据质量检测（空方向 + 重复计划 + 年份断档）

| 项目 | 内容 |
|------|------|
| **实施内容** | 1. 空方向检测（`research_direction IS NULL or TRIM = ''`）
2. 重复计划检测分组键补全（加入 `major_code/plan_id/spe_id` 等）
3. 同计划年份断档检测
4. 隔离样本验证（真实 `081200` 无误报，小样本确认规则触发） |
| **涉及文件** | `audit.py`、`verify.py` |
| **验证** | CLI `audit` 命令在真实数据上运行通过 |
| **当前状态** | 已完成 |

### 轮次 15：多方向并行展开

| 项目 | 内容 |
|------|------|
| **实施内容** | 1. 院系/方向按 `department_id` 独立管理（`expandedDepartmentIds: Set<number>`）
2. 同一学校多个方向可同时展开
3. 计划视图改为 `expandedPlanIds: Set<number>`
4. 每个方向独立选择年份、切换历年分析 |
| **涉及文件** | `WorkspacePage.tsx` |
| **验证** | `npm run build` 通过（2201 模块，约 1.13 秒） |
| **当前状态** | 已完成 |

### 轮次 16-17：方向级排序 + 真实方向比较

| 项目 | 内容 |
|------|------|
| **实施内容** | 1. 计划视图新增院系名称排序、研究方向名称排序
2. 比较入口从学校复选框改为计划行复选框
3. 比较弹窗接收真实 `WorkspacePlanRow[]`，删除 `MOCK_COMPARE_SCHOOLS`
4. 展示院校、地区、层次、专业、院系、方向 fallback、分数粒度、来源、更新时间等完整字段 |
| **涉及文件** | `WorkspacePage.tsx`、`App.tsx`、`Modals.tsx`、`db.rs` |
| **验证** | `npm run build` 通过，搜索确认 `MOCK_COMPARE_SCHOOLS` 已删除 |
| **当前状态** | 已完成 |

### 轮次 18-19：方向/计划收藏（独立于学校收藏）

| 项目 | 内容 |
|------|------|
| **实施内容** | 1. 新增 `plan_favorites` 表，唯一键：`school_id + major_code + department_name + research_direction + exam_subjects(JSON)`
2. 不依赖同步后变化的 `department_id`
3. 新增 Tauri commands：`fetch_plan_favorites`/`toggle_plan_favorite`/`remove_plan_favorite`
4. 浏览器 fallback 持久化到 localStorage
5. 收藏页接入，分区展示学校收藏 + 方向收藏 |
| **涉及文件** | `db.rs`、`commands.rs`、`main.rs`、`db.ts`、`WorkspacePage.tsx`、`Modals.tsx` |
| **验证** | `cargo check`/`npm run build` 通过，5 个文件诊断 0 错误 |
| **当前状态** | 已完成 |

### 轮次 20：跨同步稳定身份（`plan_key` + `source_department_id`）

| 项目 | 内容 |
|------|------|
| **实施内容** | 1. `workspace_departments` 新增 `source_department_id TEXT`、`plan_key TEXT`
2. `plan_key` 使用 9 字段规范 JSON 数组的 SHA-256（64 位十六进制）
3. 旧库 `plan_key=''` 时 Rust 生成 `legacy:{school}|{major}|{department_id}` fallback
4. 展开、比较、React key 全部改用 `plan_key` |
| **涉及文件** | `sync_to_tauri.py`、`db.rs`、`db.ts`、`WorkspacePage.tsx`、`Modals.tsx` |
| **验证** | 隔离同步 `081200`：1043 计划、`COUNT(DISTINCT plan_key)=1043`、非空 `plan_key` 1043/1043 |
| **当前状态** | 已完成 |

### 轮次 21：学校与院系元数据全链路贯通

| 项目 | 内容 |
|------|------|
| **实施内容** | 1. 同步链路新增学校 `source/updated_at`、院系 `source/updated_at`
2. Rust DTO 和 TS 类型同步扩展
3. 院校详情显示真实"院校来源/更新时间"
4. 计划展开区显示"计划来源/更新时间"
5. CSV/Excel/JSON 导出新增来源元数据列 |
| **涉及文件** | `sync_to_tauri.py`、`db.rs`、`db.ts`、`WorkspacePage.tsx`、`Modals.tsx` |
| **验证** | 隔离同步 `081200`：271/271 学校元数据非空、1043/1043 院系元数据非空 |
| **当前状态** | 已完成 |

### 轮次 22-23：正式五层规范化模型实施

| 项目 | 内容 |
|------|------|
| **实施内容** | 1. 新增四张新表 + 状态表：
- `workspace_majors`（专业目录实体）
- `workspace_department_entities`（院系实体，SHA-256 稳定键）
- `workspace_plans`（方向/计划行，`plan_key` 保持原算法，`plan_id` 继承旧 `department_id`）
- `workspace_plan_years`（年份分数，含 `score_scope/source/match_note`）
- `workspace_model_state`（按专业迁移状态）
2. 旧三表完整保留
3. Python 同步改为单专业单事务（失败全回滚）
4. Rust 按专业 `status=ready + 计数一致` 切读新模型
5. 旧库迁移改为非破坏策略（不再 DROP 表） |
| **涉及文件** | `sync_to_tauri.py`、`db.rs` |
| **验证** | 隔离同步 `081200`：271 校/1043 计划/3567 年份/321 院系实体，双向 `EXCEPT` 均为 0 |
| **当前状态** | 已完成 |

---

## 四、阶段 5：可维护产品

### 轮次 24：单元测试基础建设（Vitest + workspace-utils）

| 项目 | 内容 |
|------|------|
| **实施内容** | 1. 接入 Vitest（`"test:unit": "vitest run"`）
2. 提取 `workspace-utils.ts`：方向 fallback、`score_scope` 中文映射、趋势 Y 轴、导出转换
3. 15 条前端测试（fallback/粒度/趋势/导出列数/来源元数据）
4. 2 条 Rust 测试（`normalized_model_ready` 切换、legacy→normalized 一致性） |
| **涉及文件** | `package.json`、`workspace-utils.ts`、`workspace-utils.test.ts`、`db.rs`、`WorkspacePage.tsx`、`Modals.tsx` |
| **验证** | `npm run test:unit` 15/15、`cargo test` 3/3、`npm run build` 通过 |
| **当前状态** | 已完成 |

### 轮次 25：组件测试（TrendChart + WorkspaceFilterPanel）

| 项目 | 内容 |
|------|------|
| **实施内容** | 1. 安装 `@testing-library/react`/`jsdom` 等
2. 趋势图提取为 `TrendChart.tsx` 独立组件
3. 补齐 `WorkspaceFilterPanel` 的 `viewMode` 类型和 `researchDirection` 筛选逻辑
4. 22 项测试（3 个文件）全部通过 |
| **涉及文件** | `TrendChart.tsx`、`TrendChart.test.tsx`、`WorkspaceFilterPanel.test.tsx`、`WorkspaceFilterPanel.tsx`、`vite.config.ts`、`test/setup.ts` |
| **验证** | 3 个测试文件、22/22 通过、`npm run build` 通过 |
| **当前状态** | 已完成 |

### 轮次 26：Tauri E2E 与旧库迁移修复

| 项目 | 内容 |
|------|------|
| **关键问题** | 真实桌面 E2E 启动发现旧库迁移缺口：`workspace_department_years` 缺少新增可信度列，查询 `unwrap()` 导致进程崩溃 |
| **修复** | 补齐旧库增量列迁移逻辑 |
| **E2E 内容** | 非破坏 E2E：验证后端查询、新模型字段、计划收藏往返、工作区 UI 切换 |
| **涉及文件** | `db.rs`（迁移逻辑）、`scripts/test_stage4_e2e.cjs` |
| **当前状态** | 已完成 |

### 轮次 27：错误恢复全链路审计（只读）

| 项目 | 内容 |
|------|------|
| **用户意图** | 处理 5.6 错误恢复 |
| **审计范围** | 所有 Tauri 命令、Python 错误输出、前端 invoke 消费、`YAM_ERROR` 协议 |
| **高风险发现** | H1: DB 命令大量 `unwrap()` panic 可毒化全局数据库锁
H2: 收藏/历史写操作直接 panic
H3: 启动阶段数据库错误 `expect` 直接终止应用
H4: Python traceback/stderr 可原样进入前端
H5: `Err(String)` 无统一归一化，错误经常丢失 |
| **中风险** | M1: 可失败命令返回裸 `String`
M2: `error_code` 已到 IPC 但前端类型缺失
M3-M7: Python code 协议不一致、采集主阶段 traceback、JSON 损坏静默吞掉、恢复 UI 断点、取消失败被吞 |
| **涉及文件** | `commands.rs`、`db.rs`、`main.rs`、`sync_to_tauri.py`、`cli.py`、`db.ts`、`CrawlingPage.tsx`、`BackgroundTaskPanel.tsx`、`LoginRequiredModal.tsx`、`SettingsPage.tsx`、`Modals.tsx` |
| **当前状态** | 审计已记录，逐项修复 |

### 轮次 28：结构化采集错误前端闭环

| 项目 | 内容 |
|------|------|
| **实施内容** | 1. `db.ts`：`CrawlProgress` 补 `error_code`、新增 `AppError`/`normalizeAppError`/`getErrorMessage`/`invokeApp`
2. `CrawlingPage.tsx`：按 `error_code` 展示"发生原因/影响/下一步"，`LOGIN_REQUIRED` 打开登录弹窗
3. `BackgroundTaskPanel.tsx`：删除空错误非空断言
4. `cli.py`：异常统一输出 `LOGIN_REQUIRED/UNREACHABLE/FAILED`
5. `commands.rs`：Rust 超时补 `TIMEOUT` |
| **涉及文件** | `db.ts`、`CrawlingPage.tsx`、`BackgroundTaskPanel.tsx`、`cli.py`、`commands.rs`、`error-utils.test.ts` |
| **验证** | `npm run test:unit` 38/38、`npm run build` 通过、`cargo test` 3/3 |
| **当前状态** | 已完成 |

### 轮次 29：数据库边界 panic 隔离

| 项目 | 内容 |
|------|------|
| **实施内容** | 1. 新增 `AppError`（可序列化，字段为 `code/message/impact/action/retryable`）
2. 新增 `db_guard`/`db_query`/`db_write`，使用 `catch_unwind` 隔离 panic
3. Mutex 中毒时通过 `into_inner()` 恢复
4. 改造 9 条只读命令 + 5 条写命令 |
| **涉及文件** | `commands.rs`、`db.ts`、`error-utils.test.ts` |
| **验证** | `cargo test` 5/5、`npm run test:unit` 39/39、`npm run build` 通过 |
| **当前状态** | 已完成 |

### 轮次 30：数据库损坏自动备份恢复

| 项目 | 内容 |
|------|------|
| **实施内容** | 1. `open_or_recover_database`：`PRAGMA quick_check` → 失败时备份为 `.corrupt-YYYYMMDD-HHMMSS`
2. 自动创建新库并初始化
3. 设置页新增"本地数据"卡片，展示状态和备份路径
4. 测试：非 SQLite 文件成功备份 + 健康新库 |
| **涉及文件** | `db.rs`、`main.rs`、`commands.rs`、`db.ts`、`SettingsPage.tsx`、`Cargo.toml`（+`chrono`/`tempfile`） |
| **验证** | `cargo test` 7/7、`npm run test:unit` 39/39 |
| **当前状态** | 已完成 |

### 轮次 31：安全审查（只读）

| 项目 | 内容 |
|------|------|
| **审计范围** | Cookie 本地存储与日志脱敏、导出是否夹带认证信息、CDP 配置、数据库恢复备份路径 |
| **核心发现** | ① 未鉴权本机 CDP 可执行任意 JS ② `login_yanzhao` 把 `major_code` 直接插入 Python `-c` 源码（可形成代码执行）③ 但两个关键点在当前未提交改动前已存在，本次 diff 未扩大 |
| **最终结论** | 本次变更未引入或恶化任何满足 `confidence≥0.80` 且可利用的安全漏洞 |
| **当前状态** | 审计已完成，CDP 配置后续分离到开发专用配置 |

### 轮次 32：设置页导出目录偏好

| 项目 | 内容 |
|------|------|
| **实施内容** | 1. 设置保存至 `~/.yam/config/desktop-settings.json`
2. 新增 `get_export_settings`/`choose_export_directory`/`clear_export_directory`
3. 原子写入（临时文件 + 原子替换，Windows 用 `MoveFileExW`）
4. CSV/JSON/Excel 优先写入配置目录，失效时回退保存对话框
5. 设置页新增"导出"卡片 |
| **涉及文件** | `commands.rs`、`main.rs`、`Cargo.toml`、`default.json`（权限）、`db.ts`、`SettingsPage.tsx` |
| **验证** | `cargo test` 11/11、`npm run test:unit` 39/39 |
| **当前状态** | 已完成 |

### 轮次 33：性能盘点（只读）+ 同步查询去重

| 项目 | 内容 |
|------|------|
| **盘点发现** | ① 后端没有真正分页（全量读后前端 `slice`）② 院系详情逐行 N+1 ③ 切换专业仍全量 loading ④ 导出全量数组同步构建单次 IPC |
| **首项实施** | `load_score_lines` 从每个院系循环内提升到循环外，`081200` 从 1043 次降到 271 次 |
| **涉及文件** | `sync_to_tauri.py`、`db.rs` |
| **当前状态** | 已完成，继续推进分页 |

### 轮次 34：独立院系详情命令（消除 N+1）

| 项目 | 内容 |
|------|------|
| **实施内容** | 1. 新增 `fetch_workspace_departments` 独立命令
2. 查询从"1 次基础行 + N 次 years"降为"1+1"
3. 前端缓存使用 `majorCodesKey|schoolId`，Promise 去重
4. 专业切换显式失效旧缓存 |
| **涉及文件** | `commands.rs`、`main.rs`、`db.rs`、`db.ts`、`WorkspacePage.tsx` |
| **验证** | `cargo test` 12/12、`npm run test:unit` 39/39 |
| **当前状态** | 已完成 |

### 轮次 35：计划视图服务端分页

| 项目 | 内容 |
|------|------|
| **实施内容** | 1. 新增 `WorkspacePlanPage`、`get_workspace_plans_page`
2. 只读取每计划 latest 摘要（3 字段参与排序），分页后再加载页内 years
3. 补齐 `research_direction` 筛选和统一搜索
4. 比较改为 `Map<plan_key, row>` 跨页保留
5. 导出点击时单独拉全量 |
| **涉及文件** | `db.rs`、`commands.rs`、`main.rs`、`db.ts`、`WorkspacePage.tsx` |
| **验证** | `cargo test` 13/13、CDP IPC 验证：页传输 32.6KB/80 years vs 全量 1.57MB/3567 years（下降 97.9%），搜索 `total=798` 与全量一致 |
| **当前状态** | 已完成 |

### 轮次 36：静默刷新（stale-while-revalidate）

| 项目 | 内容 |
|------|------|
| **实施内容** | 1. 切换专业时保留旧列表、显示"正在刷新"
2. 每专业/计划独立请求序号，旧响应不覆盖新结果
3. 刷新失败保留旧数据 + 可重试横幅
4. 展开缓存按专业组合键隔离 |
| **涉及文件** | `WorkspacePage.tsx`、`workspace-utils.ts`、`workspace-utils.test.ts` |
| **验证** | `npm run test:unit` 42/42、`cargo test` 13/13 |
| **当前状态** | 已完成 |

### 轮次 37：大数据后台导出

| 项目 | 内容 |
|------|------|
| **实施内容** | 1. Rust 新增 `ExportState`（独立 SQLite 连接，后台线程）
2. 先写 `.part`，成功后原子替换
3. 通过 `export-progress`/`export-done` 推送进度
4. 前端只传筛选条件，不再在 WebView 构建全量数据 |
| **涉及文件** | `commands.rs`、`main.rs`、`db.ts`、`WorkspacePage.tsx` |
| **验证** | `cargo test` 17/17、真实库导出 `081200` 1043 条、CSV 表头+1043 数据行、无 `.part` 残留 |
| **当前状态** | 已完成 |

### 轮次 38：院校视图服务端分页

| 项目 | 内容 |
|------|------|
| **实施内容** | 1. 按唯一 `school_id` 分页（页内返回该校所有命中专业行）
2. `total` 为唯一学校数
3. 同校多专业不拆页
4. 导出改为点击后异步拉全量 |
| **涉及文件** | `db.rs`、`commands.rs`、`main.rs`、`db.ts`、`WorkspacePage.tsx` |
| **验证** | `cargo test` 18/18、真实 IPC：全量 88,978 字节，20 校页 6,652 字节（下降 92.5%） |
| **当前状态** | 已完成 |

### 轮次 39：阶段 5 收尾审计 + 本地诊断日志

| 项目 | 内容 |
|------|------|
| **审计发现** | 多项路线图任务已完成但复选框未更新 |
| **实施内容** | 1. Rust 诊断模块：`~/.yam/logs/yam-desktop.log`（UTC JSON 行日志、2MB 轮转 `.1`~`.3`、敏感值脱敏）
2. Python 诊断：`~/.yam/logs/yam-python.log`（同样轮转、traceback 脱敏）
3. Panic hook + 数据库错误 + 子进程失败记录
4. 设置页"诊断日志"卡片 |
| **涉及文件** | `diagnostics.rs`、`main.rs`、`commands.rs`、`diagnostics.py`、`cli.py`、`db.ts`、`SettingsPage.tsx` |
| **验证** | `cargo test` 21/21、`npm run test:unit` 42/42、Python 脱敏脚本通过、真实异常落盘无敏感值 |
| **当前状态** | 已完成 |

### 轮次 40-41：CI/CD 发布流水线 + 后端内嵌

| 项目 | 内容 |
|------|------|
| **实施内容** | 1. `ci.yml`：Windows push/PR，Node+Python+Rust，`test:release:auto`
2. `release.yml`：`v*` tag 触发，构建 NSIS/MSI/Portable，上传 artifact，draft Release
3. `check-version.ps1`：版本一致性校验
4. `package-release.ps1`：产物收集/重命名/SHA256
5. Release Rust 使用 `include_bytes!` 将约 60.5MB 后端嵌入桌面程序
6. 首次调用原子释放到 `~/.yam/runtime/yam-backend-<version>.exe`
7. NSIS/MSI/Portable 均不再依赖源码目录或系统 Python |
| **涉及文件** | `ci.yml`、`release.yml`、`check-version.ps1`、`package-release.ps1`、`commands.rs`、`tauri.conf.json`、`backend_entry.py`、`package.json` |
| **验证** | `test:release:auto` 通过（`tsc --noEmit`/前端 42/Rust 21/Vite build），`-SkipBuild` 打包测试通过，staging 产物 SHA256 一致 |
| **当前状态** | 已完成 |

### 轮次 42：TypeScript 严格类型清零 + 发布质量收尾

| 项目 | 内容 |
|------|------|
| **实施内容** | 1. 修复 11 个历史类型错误（未使用导入/参数、缺失依赖、CSS 类型声明等）
2. 补齐 `WorkspaceDepartment` 稳定 key 字段
3. 统一筛选接口排序属性声明
4. `backend_entry.py` doctor 增加内置资源验证
5. 最终质量数据：前端 44/44、Rust 23/23、Python dispatcher 7/7、npm audit 0 漏洞 |
| **涉及文件** | `WorkspaceFilterPanel.tsx`、`db.ts`、`SettingsPage.tsx`、`MajorSelectPage.tsx`、`WorkspacePage.tsx`、`workspace-utils.ts`、`SplashScreen.tsx`、`vite-env.d.ts`、`backend_entry.py`、`package.json` |
| **验证** | `tsc --noEmit` 清零、`npm run test:release:auto` 通过、后端独立运行正常 |
| **当前状态** | 已完成 |

---

## 五、修改文件汇总

### 前端（TypeScript/React）

| 文件 | 修改类型 | 主要内容 |
|------|:---:|------|
| `WorkspacePage.tsx` | 重度修改 | 静默刷新、后端分页、多方向展开、方向 fallback、分数粒度展示、后台导出、比较/收藏接入 |
| `db.ts` | 重度修改 | `AppError`/`invokeApp`/分页 API/方向收藏/导出设置/诊断状态/类型补齐 |
| `Modals.tsx` | 修改 | 真实方向比较（替换 mock）、方向收藏接入 |
| `WorkspaceFilterPanel.tsx` | 修改 | `viewMode` 类型、`researchDirection` 筛选、排序属性 |
| `SettingsPage.tsx` | 修改 | 数据库状态卡片、导出目录偏好、诊断日志卡片 |
| `CrawlingPage.tsx` | 修改 | 登录预检、五状态机、结构化错误展示 |
| `BackgroundTaskPanel.tsx` | 修改 | 空错误修复、按码展示 |
| `App.tsx` | 修改 | 真实 `WorkspacePlanRow[]` 比较状态 |
| `MajorSelectPage.tsx` | 修改 | 类型错误修复 |
| `SplashScreen.tsx` | 修改 | 类型错误修复 |
| `TrendChart.tsx` | **新建** | 独立趋势图组件 |
| `toastStore.ts` | **新建** | 全局 toast 通知系统 |
| `workspace-utils.ts` | **新建** | 纯逻辑提取（fallback/粒度/趋势/导出） |
| `workspace-utils.test.ts` | **新建** | 纯逻辑单测 |
| `TrendChart.test.tsx` | **新建** | 趋势图组件测试 |
| `WorkspaceFilterPanel.test.tsx` | **新建** | 筛选面板组件测试 |
| `error-utils.test.ts` | **新建** | 错误归一化单测 |
| `test/setup.ts` | **新建** | Vitest jsdom 环境 |
| `vite-env.d.ts` | 修改 | CSS 类型声明 |

### Rust（Tauri 后端）

| 文件 | 修改类型 | 主要内容 |
|------|:---:|------|
| `commands.rs` | 重度修改 | `CrawlProgress` 扩展、`AppError`/`db_guard`/恐慌隔离、独立院系命令、分页命令、后台导出、导出设置、诊断命令 |
| `db.rs` | 重度修改 | 五层规范化模型（5 张新表 + 状态表）、学校/计划分页、独立院系查询、方向收藏、`plan_key` 稳定键、数据库恢复、元数据同步 |
| `main.rs` | 修改 | 注册 15+ 新命令、数据库恢复启动、诊断状态托管 |
| `diagnostics.rs` | **新建** | 本地轮转日志、脱敏、panic hook |
| `Cargo.toml` | 修改 | 依赖新增（`chrono`/`tempfile`/Windows API） |
| `tauri.conf.json` | 修改 | 后端内嵌字节、资源路径 |
| `capabilities/default.json` | 修改 | 目录选择权限 |
| `build.rs` | 修改 | 后端字节嵌入逻辑 |

### Python

| 文件 | 修改类型 | 主要内容 |
|------|:---:|------|
| `sync_to_tauri.py` | 重度修改 | 五层规范模型 DDL、双写迁移、单事务同步、去重查询、稳定键算法、元数据贯通 |
| `cli.py` | 修改 | 统一错误协议、asyncio 异常边界、脱敏日志接入 |
| `config.py` | 修改 | 实时目录优先数据源 |
| `dynamic.py` | 修改 | Cookie 持久化（已有基础） |
| `audit.py` | 修改 | 空方向检测、重复计划分组建补全、年份断档 |
| `diagnostics.py` | **新建** | 本地轮转日志、脱敏函数 |
| `backend_entry.py` | **新建** | 统一 Python dispatcher（同步/采集/登录/刷新/搜索/目录/诊断） |
| `browser.py` | **新建** | 浏览器管理 |

### 文档与配置

| 文件 | 修改类型 | 主要内容 |
|------|:---:|------|
| `docs/roadmap.md` | 重度修改 | 阶段 3/4/5 任务细化与完成标记同步 |
| `docs/progress.md` | 重度修改 | 所有实施细节与验证结果记录 |
| `docs/known-issues.md` | 修改 | ISSUE-001~029 全部 fixed，状态汇总表同步 |
| `docs/tech-debt.md` | **新建** | 技术债务系统化清单 |
| `docs/session-handoff.md` | **新建** | 方案 A 设计摘要（补缺） |
| `docs/conversation-analysis.md` | **新建** | 本文档 |
| `.github/workflows/ci.yml` | **新建** | Windows CI 自动门禁 |
| `.github/workflows/release.yml` | **新建** | Tag 发布流水线 |
| `scripts/check-version.ps1` | **新建** | 版本一致性校验 |
| `scripts/package-release.ps1` | **新建** | 产物收集/重命名/SHA256 |
| `scripts/build-desktop.ps1` | **新建** | 桌面构建脚本 |
| `scripts/build-python-backend.ps1` | **新建** | Python 后端构建 |
| `scripts/test_stage4_e2e.cjs` | **新建** | 阶段 4 E2E 测试 |
| `package.json` | 修改 | 新增 `test:unit`/`test:release:auto`/`release:check`/`release:package` |
| `vite.config.ts` | 修改 | Vitest jsdom 环境配置 |
| `pyproject.toml` | 修改 | 依赖更新 |

---

## 六、验证统计

| 验证项 | 轮次 | 最终结果 |
|------|:---:|------|
| `python -m compileall yam` | 多次 | ✅ 通过 |
| `cargo check` | 多次 | ✅ 通过（仅旧 `idx` warning） |
| `cargo test` | 多次 | ✅ 23/23 |
| `cargo fmt --check` | 多次 | ✅ 通过 |
| `npm run build` | 多次 | ✅ 通过（仅旧 chunk size warning） |
| `npm run test:unit` | 多次 | ✅ 44/44 |
| `npx tsc --noEmit` | 收尾 | ✅ 0 错误 |
| `npm audit` | 收尾 | ✅ 0 漏洞 |
| Python dispatcher `doctor --json` | 收尾 | ✅ 通过 |
| 隔离数据库同步（081200） | 多次 | ✅ 271 校/1043 计划/3567 年份 |
| CDP 真实 IPC 验证 | 多次 | ✅ 分页/导出/搜索一致性 |
| NSIS + MSI 构建 | 收尾 | ✅ 通过（staging 产物） |
| IDE diagnostics | 全程 | ✅ 0 错误 |
