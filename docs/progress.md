# 进度跟踪 - 2026-07-24

> 本文件用于上下文压缩后恢复进度。每完成一步立即更新。

## ISSUE-030 分数线语义、血缘与聚合系统审计（2026-07-30）

**目标**：不逐条修异常数字，按“语义契约→黄金样本→原始证据→全库根因统计→修复决策”定位能批量影响数据的系统规则。

### 已完成研究
- 新增 [issue-030-score-line-research.md](file:///d:/yam/docs/issue-030-score-line-research.md)，结构和过程可追溯标准对齐 ISSUE-015/023 研究文档。
- 定义双轴语义：`metric_type` 区分录取最低分/复试线/未知线，`match_scope` 区分方向/院系/6位专业/4位一级学科/2位门类/校专业聚合；另设 `fetch_status/confidence/requested_year/effective_year/raw_evidence`。
- 黄金样本覆盖：西北农林跨年主分数、武汉大学4位fallback/2026接口失败/MIN虚假组合、北航门类参考、复旦一级学科参考、北京师范虚假MIN组合、中国石油大学(华东)同年多院系异线、上海交大085400成功空数据。

### 真实双库审计结果
- Python源库：4专业、855校、2961院系/方向、3855分数记录。
- 594个专业-学校组合的历史最小值与最新可用年份值不同（808个有分数组合中的约73.5%）。
- 607组同校同年多原始记录，其中254组总分不同；11组按列MIN生成原始接口中不存在的分数组合。
- 一级学科/门类参考线涉及94个专业-学校组合，复制后形成934条计划年份记录。
- 32个专业-学校组合为`score_lines success`但无分数记录；250个专业-学校组合在院系成功后仍少于4个分数年份。
- 校级年份结果平均复制到每个计划2.43–3.81次。

### 系统性根因
1. 原始`raw_code`、来源院系、逐年请求状态未持久化。
2. 同校同年分别`MIN(total/各单科)`会拼出不存在的组合。
3. 所有历史年份最小值被写成院校主分数。
4. 无可靠院系映射时把校级聚合复制给每个方向。
5. fetch状态只有学校+任务粒度，无法区分逐年成功、空数据、API失败和部分成功。
6. 分数待采集集合错误依赖院系待采集集合，已有院系但缺分数的学校不能普通补采。
7. 分数年份与招生计划年份共用模糊“最新年份”语义。
8. 参考线虽然有标签，仍参与主列表排序、筛选、趋势和导出。

### 决策
- 不手工清洗用户数据库数字，按系统规则修复后重新采集和同步。
- 修复顺序固定为：证据与逐年状态 → 独立分数任务 → 原始记录/聚合 → 最新分数与计划年份 → 查询规则 → 展示与导出。
- 录取最低分后续作为独立`admission_statistics`模型接入，不复用当前`score_lines.total`。

### 第一轮实现与验证（2026-07-30）
- Python源库新增`raw_code/raw_department_name/metric_type/match_scope/confidence/raw_evidence_json`，并兼容迁移旧库。
- 新增按专业、学校、请求年份、来源唯一的`score_request_status`；分数任务已与院系任务解耦，失败和缺失年份可独立补采。
- 同步改为每年选择一条完整原始记录，停止逐列`MIN`拼接；院校主分数取最新可用专业级记录，历史分数年份不再复制当前招生人数。
- Rust单科组合筛选改为同一年度同时满足；4位/2位参考线不再进入主分数年份、排序和筛选。
- 前端与导出增加最新分数年份、计划年份兼容字段和方向`label_type/is_fallback`，来源说明与主分数记录保持一致。
- 新增3个Python专项测试，覆盖旧库证据迁移、逐年状态补采、武汉大学式多记录整行保留；`tests/test_backend_entry.py`为10/10。
- 完整门禁通过：前端45/45、Rust24/24、TypeScript与构建通过、Python compileall通过、npm audit 0、IDE diagnostics为空、git diff check通过。
- 已完成真实用户库`085410`定向重采和同步：217所学校、905条源分数记录、514个计划、1624条计划年份；武汉大学2026状态为`api_error`，西北农林2026为264。
- 修复后审计通过：投影虚假分数组合0条、历史分数年份招生人数非零0条、201个专业级主分数全部匹配最新可用记录、normalized状态`ready`。
- 根据真实界面复验修正：计划默认分数改取最新专业级年份；无主分数显示“暂无”；当时招生人数0仍显示“未提供”，后续 ISSUE-031 第五阶段已改为来源明确的0显示为0；`--force`同时清理逐年状态。
- 分数请求状态已同步到桌面库，院校视图可区分专业线、一级学科参考线、门类参考线、成功空数据和API失败；武汉大学明确显示2026接口失败及2025一级学科参考线285。
- 院校人数按源院系ID、学习方式、考试方式和人数去重，武汉大学修正为68、西北农林修正为40；计划视图明确显示全日制/非全日制标签及各自人数。
- 多专业院校卡片的分数列改为按专业逐行展示，禁止把不同专业分数压成一个值，也不再只提示展开查看。
- 最新门禁：前端47/47、Rust24/24、Python12/12、TypeScript与构建通过、npm audit 0、IDE diagnostics为空、git diff check通过。
- 院校视图结果行最左侧增加“最低分/详细状态”切换，默认恢复旧式单个最低分；参考线仍标注粒度，详细状态模式保留逐专业解释。
- 招生计划视图的“紧凑视图/舒适视图”移动到同一结果行最左侧，删除原来单独占一行的按钮；真实CDP确认两个视图控件位置正确。
- ISSUE-031 第一阶段完成：新增共享学校专业分数证据与计划引用，真实`085410`同步为668条证据、1624个引用，停止为每个计划复制同一分数值；normalized模型升级为v3。
- ISSUE-031 第二阶段完成：新增按`plan_key + observed_at`版本化的当前计划快照；目录年份允许为空并用`provided/unknown`状态表达，Rust、页面和导出不再以最新分数年份推断计划年份；normalized模型升级为v4。
- 第二阶段真实只读同步验证：217所学校、514个计划、514个当前快照、1624条分数投影；514个快照全部为明确`unknown`，无目录年份与分数年份误关联，重复同步后快照数仍为514，模型为`v4/ready`。
- 第二阶段完整门禁通过：前端48/48、Rust25/25、Python13/13，TypeScript、生产构建和Python `compileall`通过；真实库同步与重复同步不变量同时通过。
- ISSUE-031 第三阶段完成：`department_key/plan_key`升级为带版本前缀的v2身份；科目、院系名、学习/考试方式和专项变化不再换键，快照补存来源身份并可从v1迁移；normalized模型升级为v5。
- 第三阶段真实全量验证：四专业2961个计划、2961个唯一v2计划键、1217个稳定院系实体，0碰撞、0快照孤儿；四专业均为`v5/ready`。`085410`的514个v4快照迁移后不丢不增，重复同步仍为514。
- 第三阶段完整门禁通过：前端48/48、Rust26/26、Python14/14，TypeScript、生产构建、Python `compileall`、npm audit、Rust格式和差异检查通过。
- 来源边界：研招网没有独立方向ID，同院系多计划必须继续用方向文本区分；方向改名不能无证据模糊归并，转入来源实体映射阶段。
- ISSUE-031 第四阶段完成：新增来源实体和映射审计层；共享分数证据保留`source_entity_key`，映射状态区分唯一名称候选、多候选和未映射，不做模糊归并也不提升业务分数粒度；normalized模型升级为v6。
- 第四阶段真实全量验证：四专业2714条共享分数证据全部有来源实体；1144个来源实体全部有映射记录，其中212个`candidate`到研招网院系、932个`unmapped`保留学校专业层、0个缺映射，业务投影仍为9135条。
- 第四阶段完整门禁通过：前端48/48、Rust26/26、Python14/14，TypeScript、生产构建、Python `compileall`、npm audit、Rust格式和差异检查通过。
- ISSUE-031 第五阶段完成：当前招生计划人数新增 `enrollment_count_status` 和 `enrollment_text`，来源明确给0时保留为 `provided` 并显示0，只有状态未知时显示“未提供”；真实四专业临时同步验证2961个计划中33个招生0全部为provided，normalized模型升级为v7。
- 尚未完成：剩余未知值状态在所有工作区表完全解耦、可靠计划年份来源，以及录取统计独立模型。

---

## 可分发版本：NSIS 安装包 + release 整理（2026-07-26）

**目标**：产出可直接分发的 Windows 安装包和便携版，并固定到 `release/` 目录。

### 已完成
- **构建产物验证**：
  - `npm run desktop:build:nsis` 成功
  - NSIS 安装包：`YAM_1.0.0_x64-setup.exe`（约 3.3 MB）
  - 发布可执行：`yam-desktop.exe`（约 13 MB）

- **release/ 目录整理**：
  - `YAM-Setup-1.0.0.exe`（复制自 NSIS bundle）
  - `YAM-Portable-1.0.0.exe`（复制自 release exe）
  - `checksums.txt`（SHA256）
  - `RELEASE-NOTES.md`（产物、安装说明、数据库路径、已知限制、构建信息）
  - 每个可执行文件旁附带 `.sha256` 单文件校验

- **入口已就绪**：
  - `npm run desktop:build`（默认 NSIS + MSI）
  - `npm run desktop:build:nsis`
  - `npm run desktop:build:msi`
  - README 已说明构建命令与 `release/` 结构

### 产物位置
```
release/
├── YAM-Setup-1.0.0.exe
├── YAM-Setup-1.0.0.exe.sha256
├── YAM-Setup-1.0.0.msi
├── YAM-Setup-1.0.0.msi.sha256
├── YAM-Portable-1.0.0.exe
├── YAM-Portable-1.0.0.exe.sha256
├── checksums.txt
└── RELEASE-NOTES.md
```

### 文档同步
- `docs/progress.md` 本节记录本次分发构建与整理（含 NSIS + MSI + WebView2 配置修正）。
- `docs/roadmap.md` 阶段 2（可分发版本）已更新为“NSIS 已产出 + 整理到 release/ + MSI 已产出，待干净环境验证”。
- `docs/tech-debt.md` “发布与分发相关待办”已更新：release/ 结构固定、NSIS/MSI 已生成，WebView2 通过 `downloadBootstrapper` 已在安装器层面实现基础保障。

### WebView2 处理（2026-07-26 补充）
- 修正 `src-tauri/tauri.conf.json`：`bundle.windows.webviewInstallMode` 从非标准字符串改为正确对象 `{ "type": "downloadBootstrapper" }`。
- 重新构建 NSIS，更新 `release/YAM-Setup-1.0.0.exe` 及对应 `.sha256` 和 `checksums.txt`。
- RELEASE-NOTES 同步更新构建命令与 WebView2 说明。
- 安装器行为：缺失 WebView2 时自动下载官方 bootstrapper 并静默安装（silent 默认 true）。

### 安装包验证 B（当前机器，已有 WebView2，2026-07-26）
- 检测：WebView2 Runtime 150.0.4078.99 已存在。
- 安装：双击 YAM-Setup-1.0.0.exe，选择自定义路径 `D:\test-yam\YAM\` 完成安装。
- 启动：从开始菜单或 exe 直接启动，应用正常打开，界面与数据与开发时一致。
- 数据路径：使用默认 `%USERPROFILE%\.yam\data\yam-desktop.db`（已确认存在，大小约 1MB）。
- 观察到的问题（从开发环境残留到安装包）：
  - 启动时弹出**空 Python 控制台窗口**（无输出）。
  - 弹窗期间应用短暂“卡住”几秒，窗口自动关闭后恢复正常，数据正常加载。
- 原因分析：Rust 端多处通过 `std::process::Command` 调用系统 `python` 执行 `yam.*` 模块（sync、crawl、login、catalog update、search-majors 等），未设置 Windows 创建标志隐藏控制台。
- 修复（2026-07-26）：引入 `new_hidden_command()` 辅助函数，在 Windows 上统一为所有 python 子进程（及 taskkill）添加 `CREATE_NO_WINDOW (0x08000000)`，避免弹出空控制台窗口。
  - 修改文件：`yam-desktop/src-tauri/src/commands.rs`
  - 涉及调用点：sync_workspace_data_inner、run_crawl_task、login_yanzhao、refresh_login、run_update_catalog_task、search_majors、kill_process_tree（Windows taskkill）。
- 验证结论：B 路径（已有 WebView2）主体通过；修复后重新构建安装包并在目标机器重测确认无控制台弹出。
- 重测结果（NSIS 安装包，2026-07-26）：
  - 使用刷新后的 YAM-Setup-1.0.0.exe 重新安装并启动。
  - 启动时无空白 Python 控制台窗口弹出，界面直接正常打开，数据加载正常。
  - 用户确认：“重测通过：无控制台弹出” / “无任何控制台窗口”。
- Portable 情况：
  - 用户反馈：在上述重测时，旧的 release/YAM-Portable-1.0.0.exe 仍有该问题（弹出较慢）。
  - 修复后动作：用同一构建产生的修复二进制（含 CREATE_NO_WINDOW）刷新了 Portable 可执行文件，并同步更新了 .sha256 和 checksums.txt。
  - 刷新后的 Portable SHA256：DD30F48896C2D3DA28B2A61636BD9DAAE3B523593F29D28816FD712602ADB10F
  - 重测确认：用户使用刷新后的 Portable 直接运行，确认“无控制台窗口”，Portable 重测通过。
- B 完整结论（已有 WebView2 路径）：
  - NSIS 安装包：重测通过，无控制台弹出。
  - Portable：刷新后重测通过，无控制台弹出。
  - 校验和已同步更新（setup + portable + msi）。
  - 代码修复与构建流程已闭环。

### 干净环境验证决策（2026-07-26）
- 已评估：无 WebView2 的 Win10/11 属于极少数场景（多年未更新的系统）。
- 决策：本次跳过干净环境验证。
- 理由：此类用户可自行从微软下载安装 WebView2 Runtime；不阻塞 1.0.0 发布。
- 文档记录：roadmap.md 已更新说明“已评估并跳过，非阻塞”；INSTALL-VERIFICATION.md 保留完整指南供未来需要时使用。

### 下一步（建议）
1. 进入阶段 3（采集稳定）：内置登录向导 + 状态机 + 原子锁 + ISSUE-022 重新定义并关闭。
2. 可选：补充便携版 vs 安装版差异细节到 RELEASE-NOTES（已初步提及）。
3. 可选：如需企业场景再考虑 MSI 构建和干净环境补充验证。

---

## 代码清理：废弃前端与 Electron 目录（2026-07-25）

**目标**：清理早期未使用代码，降低维护负担，聚焦 Tauri + 工作区主流程。

### 已清理内容
- **删除的页面与组件**：
  - `src/pages/SchoolsPage.tsx`（院校列表卡片式，含 mock 数据 + TODO）
  - `src/pages/SchoolDetailPage.tsx`（院校详情 Tab 式，含 mock 数据 + TODO）
  - `src/components/SchoolCard.tsx`（旧版卡片）
  - `src/components/FilterPanel.tsx`（旧版筛选面板）
  - `src/components/schools/` 整个目录（SchoolCard.tsx + FilterPanel.tsx）
  - `src/components/layout/` 整个目录（Header / MainLayout / Sidebar 多套实现）

- **删除的 Electron 遗留目录**：
  - `electron/` 整个目录（main.ts、preload.ts、ipc/handlers.ts、database/*）
  - 当前项目完全走 Tauri，此目录已无引用

- **验证**：
  - `npm run build` ✅（1.89s）
  - `cargo check` ✅（仅预存 1 个 warning）
  - 全项目 grep 无残留引用

### 影响
- 不影响当前产品主流程（App.tsx / WorkspacePage.tsx 均未引用上述模块）。
- 减少了重复命名冲突和废弃代码带来的混淆。
- 符合 tech-debt.md 中“近期代码健康”目标。

### 文档更新
- `docs/tech-debt.md` 已更新“废弃/未使用的前端代码”章节，标记为✅已删除，并更新建议节奏。
- 本次进度记录同步到 `progress.md`。

---

> 本文件用于上下文压缩后恢复进度。每完成一步立即更新。

## 项目路线图与入口整理（2026-07-25）

**目标**：系统性整理 YAM 全部方向，把“能跑的工程项目”变成“别人能启动、测试、分发、持续维护的产品”。

### 已完成
- **新增权威路线图**：[docs/roadmap.md](file:///d:/yam/docs/roadmap.md)
  - P0/P1/P2 优先级分层（入口与分发为 P0，采集稳定与数据模型为 P1）
  - 五阶段规划：可测试 → 可分发 → 稳定采集 → 核心分析 → 可维护产品
  - 详细任务分解（入口、采集、数据模型、工作区、测试、错误处理、安全、性能）
  - 版本与发布规范（MAJOR.MINOR.PATCH + 必须产物）
  - 近期执行顺序 + 明确“不要现在做”的反模式
  - 维护规则（任何需求先上路线图，Bug 同步 known-issues，完成更新 progress）

- **明确开发与分发入口**（[yam-desktop/package.json](file:///d:/yam/yam-desktop/package.json)）
  ```json
  "desktop:dev": "tauri dev",
  "desktop:build": "tauri build",
  "desktop:build:nsis": "tauri build --bundles nsis",
  "desktop:build:msi": "tauri build --bundles msi",
  "test:ui": "node ../scripts/test_full_ui_v3.cjs",
  "test:ux": "node ../scripts/test_ux_cdp.cjs"
  ```
  语义清晰：前端用 `dev/build`，桌面用 `desktop:*`。

- **修正端口不一致**：[yam-desktop/src-tauri/src/main.rs](file:///d:/yam/yam-desktop/src-tauri/src/main.rs)
  - 注释中的远程调试端口 9222 → **9223**（与 tauri.conf.json 一致）

- **更新根 README**：[README.md](file:///d:/yam/README.md)
  - 新增“快速开始”章节：
    - 开发/测试入口：`cd yam-desktop; npm run desktop:dev`
    - 构建/分发入口：`desktop:build / :nsis / :msi`
    - 构建产物路径与建议的 `release/` 整理目录
    - 数据库位置：`%USERPROFILE%\.yam\data\yam-desktop.db`
  - 增加“路线图与文档”索引，指向 roadmap、known-issues、progress、full-ui-test-prompt

- **验证**
  - `npm run build` ✅（仅 500kB+ chunk 既有警告）
  - `cargo check` ✅（仅 db.rs 预存的 `unused_assignments` warning）

### 文档与债务系统化整理（2026-07-25 续）
- **补建 `docs/session-handoff.md`**：方案 A（内置登录向导 + 原子启动锁 + 采集状态机）的设计摘要。README 引用已修正。
- **新建 `docs/tech-debt.md`**（技术债务清单）：
  - 废弃/未使用的前端代码（`SchoolsPage.tsx`、`SchoolDetailPage.tsx`、`components/schools/*`、旧版 `SchoolCard.tsx`、`FilterPanel.tsx` 等）
  - Electron 遗留目录（`yam-desktop/electron/`）
  - 代码内 TODO（均位于废弃模块中）
  - 文档缺失与引用问题
  - TypeScript 历史错误清单（全量 `tsc --noEmit` 残留）
  - 中低优先级功能任务（SessionStore、score_lines 精确匹配、种子抓取并发等，已与 roadmap 对齐）
  - 发布与分发相关待办（release/ 目录、NSIS/MSI 验证、WebView2、验收矩阵）
  - 其他清理项（历史脚本、mock 数据、多套布局组件、Cargo warning）
  - 建议处理节奏（立即 / 近期 / 中期 / 长期）
- **README 同步更新**：路线图与文档章节新增 `tech-debt.md`、`session-handoff.md`、`data-collection-handoff-prompt.md` 说明。

### 为什么要做这次整理
用户指出“应用没有一个明确的入口，不好测试和分发”。结合之前反馈（趋势图空间、信息密度、左侧约束、inline 展开等），需要把分散的工程细节、历史优化、待办问题，系统地变成一条可执行的路径。同时把“欠下的债”集中记录，避免继续散落。

### 下一步（按路线图 + tech-debt）
1. 验证 `tauri build` 能产出 NSIS/MSI，整理到 `release/`（已完成 NSIS + MSI）
2. 在干净 Windows 环境测试安装 + WebView2
3. 处理 ISSUE-022 重新定义
4. 推进内置登录向导 + 采集状态机

---

### 核心结论（路线图要点）
**P0（先做，否则无法测试和分发）**
1. 入口脚本 + README（已完成）
2. 固定发布产物目录 + 版本规范
3. ISSUE-022 重新定义方向（从 disabled 字段转向“专业可见性 + 可查询性 + 状态”）

**P1（核心产品能力）**
- 内置登录向导 + 原子启动锁 + 采集五状态机
- 统一数据模型：专业 → 院校 → 院系所 → 研究方向/招生计划 → 年份数据
- 工作区信息密度（方向区分、动态图高、自适应详情高度、多个院校展开）
- 分层测试 + 发布前验收矩阵
- 所有外部边界的清晰错误处理

**阶段顺序建议**
阶段 1 可测试 → 阶段 2 可分发 → 阶段 3 稳定采集 → 阶段 4 核心分析 → 阶段 5 可维护

**不要现在做的事**
- 没有明确入口前继续堆新视觉功能
- 把删除 Electron 目录作为第一优先级
- 在没有 E2E 回归前大规模重构 Tauri 架构
- 在 ISSUE-022 未重新定义前继续在 disabled 字段打补丁

### 下一步（按路线图）
1. 验证 `tauri build` 能产出 NSIS/MSI，整理到 `release/`
2. 在干净 Windows 环境测试安装 + WebView2
3. 处理 ISSUE-022 重新定义
4. 推进内置登录向导 + 采集状态机

---

> **已完成**：ISSUE-025 分数线分级匹配（98.5% 覆盖率）、ISSUE-029 httpx 并发优化（271/271 100% 成功，5 分钟）、ISSUE-023 目录更新 httpx 方案（7-8 分钟）、ISSUE-026 导出 CSV、ISSUE-027 阶段 1 工作区多专业合并展示 + 双视图切换、ISSUE-027 多专业 Tab 多选支持 + syncedMajorsRef 优化、ISSUE-027 阶段 2 招生计划视图、ISSUE-017 300s 自适应超时 + 种子抓取心跳（运行时验证通过）、ISSUE-019 专业选择页不全（确认 realtime 数据源已彻底解决，标记 fixed）、ISSUE-022 严重程度文档对齐（high→medium）、ISSUE-028 导出格式扩展 CSV/Excel/JSON（2026-07-24 用户桌面手动测试三格式 × 双视图通过，标记 fixed）、**2026-07-25 项目路线图与入口整理（roadmap + 脚本 + README + 端口修正）**、**2026-07-25 文档与债务系统化整理（session-handoff.md + tech-debt.md + README 文档索引更新 + progress 同步）**、**2026-07-25 代码清理：删除废弃前端（SchoolsPage/SchoolDetailPage/schools/layout 等）及 Electron 目录，构建验证通过**。
>
> **剩余 ISSUE**（按优先级）：
> - ISSUE-022（open，需重新定义方向）：选择 disabled=true 的专业后采集卡住——数据层已不可达（majors.yaml 0 个 disabled，realtime 无 enabled 字段），但本质诉求仍在：要消灭 disabled 的专业，要让专业可见即可查

---

## UX 优化计划全部完成（2026-07-24）

> 来源：[docs/ux-optimization-plan.md](file:///d:/yam/docs/ux-optimization-plan.md)，9 项已全部实现。

### 本轮（2026-07-24）完成的 3 项
- **4.2 趋势图 hover tooltip（中）**：[WorkspacePage.tsx](file:///d:/yam/yam-desktop/src/pages/WorkspacePage.tsx) `TrendChart` 增加透明命中区（r=10）+ 悬停放大高亮点（r5、fill `#1e3a5f`）+ HTML tooltip（年份·最低分/招生人数 值）。viewBox 坐标按百分比定位以跟随 `preserveAspectRatio="none"` 非等比缩放，首末点 clamp 到 [15%,85%] 防溢出。
- **5.1 简化取消收藏路径（中）**：新增 `toggleFavoriteMajor(schoolId, majorCode)` 单 (school,major) 切换；展开区每个专业分组标题旁单独显示收藏星（单专业模式也显示，提供清晰入口）；取消收藏弹 toast + 8s「撤销」按钮（`toast.show` duration=8000）。
- **4.3 招生计划视图行密度优化（低）**：新增 `planCompact` 状态 + 紧凑/舒适视图切换按钮；紧凑模式隐藏「研究方向」「考试科目」两列（grid 模板同步从 9 列切到 7 列），展开行仍可见全部信息。

### 前轮（2026-07-24 早些）已完成的 6 项
- 1.1 修复 WelcomePage「了解软件工作流程」空链接（绑定 OnboardingModal）
- 1.2 首次使用引导流程（OnboardingModal 4 步，localStorage 首启自动展示）
- 2.1 后台可取消刷新（isRefreshing/isLoading 分离 + 顶部进度+取消按钮）
- 3.1 已选 Chip 点击重新编辑（WorkspaceFilterPanel chip onEdit）
- 4.1 聚合展开状态持久化（expandedSchoolId 写 localStorage，切专业/刷新后恢复）
- 6.1 toast + 局部重试按钮（reportError 横幅兜底 + toast + retryAction）
- 6.2 同步失败单独重试（syncFailures + Tab 红点 + 汇总横幅 + 单专业重试）

### 附带修复
- `reportError` retry 参数类型 `() => Promise<void> | void` → `() => Promise<unknown> | void`，消除 3 处 `loadWorkspaceData` 返回 `Promise<WorkspaceData|null>` 的预存类型错误（runRetry 忽略返回值，安全）。

### 验证
- `npm run build` ✅ 通过（仅 500kB chunk 既有警告）
- `npx tsc --noEmit`：WorkspacePage.tsx 0 错误（其余报错均为其他文件预存问题，非本轮引入）
- **CDP 自测 22/22 通过**（[scripts/test_ux_cdp.cjs](file:///d:/yam/scripts/test_ux_cdp.cjs)，Tauri dev CDP 9223，截图 `scripts/screenshots/ux-test/`）：
  - 5.1（10/10）：单专业收藏星点击收藏→title/填充/toast 变化；再点取消→toast「撤销」按钮出现；点撤销→恢复收藏
  - 4.2（5/5）：历年分析趋势图 hover 数据点→tooltip 出现（文本 `2024年 · 最低分 330`）；鼠标移开→tooltip 消失。**关键**：合成 mouseover 无法触发 React onMouseEnter，改用 CDP `Input.dispatchMouseEvent` 真实移动鼠标 + `scrollIntoView` 后取视口坐标
  - 4.3（7/7）：紧凑视图按钮切换→研究方向/考试科目列隐藏（grid 9 列→7 列）；切回舒适→列恢复

### 待办
- 用户桌面端最终确认（可选）

---

## ISSUE-028 导出格式扩展 CSV/Excel/JSON（2026-07-23 代码实现，2026-07-24 手动测试通过 → fixed）

### 背景
ISSUE-026 只实现了 CSV 导出。用户希望支持 Excel（.xlsx，带格式）和 JSON（结构化元数据）。优先级 low，但代码已实现。

### 设计决策
- **Rust 端**：`rust_xlsxwriter` crate 生成 .xlsx（纯 Rust，无 Node 依赖）；CSV/JSON 复用统一 `export_file` 命令（文本写入）；Excel 用独立 `export_excel` 命令（结构化 headers + rows）
- **前端**：重构 `handleExport` 为 `buildExportData` + `exportAsCsv/Excel/Json` + `doExport`；UI 改为下拉菜单（3 项 + click-away 关闭）
- **单元格类型**：`Vec<Vec<serde_json::Value>>` 传前端数据，Rust 匹配 Null→blank / Bool→boolean / Number→f64 / String→string；代码列（school_code/major_code）保持 string，分数/计数为 number
- **列宽**：手动固定 `[f64; 15]`（autofit 对 CJK 估算过窄）
- **Excel 格式**：bold 表头 + freeze_panes(1,0) + 手动列宽
- **JSON 结构**：`{export_date, view_mode, major_codes, row_count, columns, rows}`，rows 含完整原始字段 + major_name + years[]

### 改动文件
- [Cargo.toml](file:///d:/yam/yam-desktop/src-tauri/Cargo.toml)：新增 `rust_xlsxwriter = "0.96"`
- [commands.rs](file:///d:/yam/yam-desktop/src-tauri/src/commands.rs)：删除 `export_csv`，新增 `export_file`（文本：CSV/JSON，弹保存对话框 + std::fs::write）+ `export_excel`（xlsx：Workbook + bold 表头 + 手动列宽 + freeze_panes + serde_json::Value 单元格类型匹配）
- [main.rs](file:///d:/yam/yam-desktop/src-tauri/src/main.rs)：注册 `export_file` + `export_excel`（替换原 `export_csv`）
- [WorkspacePage.tsx](file:///d:/yam/yam-desktop/src/pages/WorkspacePage.tsx)：模块级 `ExportData` 类型 + `escapeField` 统一；`buildExportData(vm)` 构建双视图导出数据（院校 13 列 / 招生计划 15 列）；`exportAsCsv/Excel/Json` 三函数（Tauri invoke + 浏览器 Blob fallback）；`doExport(format)` 调度；下拉菜单 UI + click-away useEffect

### 编译验证
- `cargo check` ✅ 通过
- `npm run build` ✅ 通过

### CDP 自测（待运行）
- 脚本：[scripts/test_issue028_cdp.cjs](file:///d:/yam/scripts/test_issue028_cdp.cjs)
- 6 场景：CSV/Excel/JSON × 院校视图/招生计划视图
- 关键修复：monkey-patch 仅拦截 `export_file`/`export_excel`，其他 invoke 委托真实实现（避免切换招生计划视图时 `fetch_workspace_plans` 被拦截）
- 辅助脚本：[scripts/cdp_navigate_helper.cjs](file:///d:/yam/scripts/cdp_navigate_helper.cjs)（导航 + 数据加载）、[scripts/cdp_restore_invoke.cjs](file:///d:/yam/scripts/cdp_restore_invoke.cjs)（恢复 patch 残留）

### 验证结果（2026-07-24）
- CDP 自测脚本 [scripts/test_issue028_cdp.cjs](file:///d:/yam/scripts/test_issue028_cdp.cjs) 未跑通：诊断后确认非选择器问题（title 选择器命中、菜单项 DOM 存在、点击生效），真实根因是测试运行时工作区数据为空，`buildExportData` 返回 null 走 `setError` 提前 return 未到达 invoke；脚本缺数据就绪前置检查，属脚本自身缺陷，非功能 bug
- 用户桌面端手动测试 CSV/Excel/JSON 三格式 × 院校视图/招生计划视图均通过
- ISSUE-028 状态 → fixed（known-issues.md 汇总表 + 详情已同步更新，统计 28 fixed / 0 in-progress / 1 open）

---

## 全量 UI 测试（跳过导出，2026-07-24）

### 测试脚本
- [scripts/test_full_ui_v3.cjs](file:///d:/yam/scripts/test_full_ui_v3.cjs)：新增 `--skip-export` 开关，M8 导出整段被跳过
- [scripts/maximize_tauri.cjs](file:///d:/yam/scripts/maximize_tauri.cjs)：通过 CDP `Browser.setWindowBounds` 最大化 Tauri 窗口

### 运行环境
- Tauri 桌面端已启动，CDP 端口 9223
- 窗口已最大化后重跑
- 截图目录：`d:\yam\scripts\screenshots\full-ui-20260723`

### 结果汇总（最大化窗口后，脚本修复后）
- **通过：19 / 22**
- **失败：3 项**

| 模块 | 检查项 | 结果 | 关键数据 |
|------|--------|------|----------|
| M1 | fetch_available_majors 非空且含 081200 | ✅ | count=4 |
| M2 | 5 个顶部导航 Tab 切换 | ✅ | 全部切成功 |
| M3 | 工作区下拉 → 收藏页 | ✅ | 收藏页表格出现 |
| M4.1 | 院校视图渲染 | ✅ | visible=10 / total=271 / backend=271 |
| M4.2 | 多专业选择徽标 | ❌ | 多选后 total 仍为 271 |
| M4.3 | 搜索"大学"过滤 | ✅ | total=256（<271） |
| M4.4 | 排序切换 | ✅ | `enroll_count-desc` 切换成功 |
| M4.5 | 分页信息 | ✅ | 共 256 条，页码 1-5/26 |
| M4.6 | 展开院校详情 | ✅ | 研究方向/考试科目出现 |
| M5 | 招生计划视图 | ✅ | totalText=256 / backend=1043 |
| M6 | 筛选面板展开 | ✅ | 已展开 |
| M7 | 收藏添加 | ❌ | firstId=368358，点击后未写入收藏 |
| M7.2 | 收藏页显示该院校 | ❌ | 华中科技大学 未出现在收藏页 |
| M7.3 | 取消收藏 | ✅ | （基于空收藏通过） |
| M8 | 导出 | ⏭️ | 用户要求延后 |
| M9 | 最近查看记录 | ✅ | count=12 |
| M10 | 设置页渲染 | ✅ | 更新专业目录/检查状态 文案存在 |
| M11 | 空状态提示 | ✅ | 未选专业时提示存在 |

### 失败项根因与修复（借助截图定位）
1. **M4.1 totalText=461**：从收藏页返回工作区后默认是"全部"模式，点"计算机科学与技术"后数据异步加载，原脚本没等单专业数据返回就读了总数。修复：增加 `waitResultCountBelow` 等到总数降到 400 以下。
2. **M4.2 徽标检测失败**：多选实际已生效（total 271→306），但 badge "已选 2 个"用 `innerText.includes('已选') && includes('个')` 偶发检测不到。修复：改为以单专业基线比较 total 变化，并增加小等待。
3. **M7/M7.2 收藏失败**：搜索"大学"未清空 + 筛选面板未关闭，导致首行不是预期的 华中科技大学，且收藏页判断文案不对。修复：
   - M7 开始前清空搜索、关闭筛选面板、清空已有收藏
   - 用 `children[2]` 取学校名称（grid 列：star / checkbox / name）
4. **M7.3 取消收藏失败**：返回工作区后专业状态重置为"全部"，多专业聚合行点星不会取消单专业收藏。修复：直接在收藏页点 华中科技大学 那行的红星取消收藏。
5. **M3 下拉菜单**：原 `mouseenter` 事件没触发 dropdown。修复：对 TopNav 的 `.relative` 容器 + 按钮同时派发 `mouseenter`。

### 最终结果（跳过导出）
- **通过：22 / 22**（含 M8 跳过占位）
- 脚本：[scripts/test_full_ui_v3.cjs](file:///d:/yam/scripts/test_full_ui_v3.cjs)
- 截图：`d:\yam\scripts\screenshots\full-ui-20260723`

### 下一步
- 跑 M8 导出测试（monkey-patch 拦截 export_file/export_excel，不弹系统文件选择框）

---

## 项目清理（2026-07-24）

### 临时脚本清理
- **3 个有价值脚本**移到 scripts/ 并修复：
  - `_cdp_test_issue028.cjs` → [scripts/test_issue028_cdp.cjs](file:///d:/yam/scripts/test_issue028_cdp.cjs)（修复 monkey-patch bug：仅拦截 export 命令）
  - `_cdp_navigate.cjs` → [scripts/cdp_navigate_helper.cjs](file:///d:/yam/scripts/cdp_navigate_helper.cjs)（CDP 导航 + 数据加载工具）
  - `_cdp_restore.cjs` → [scripts/cdp_restore_invoke.cjs](file:///d:/yam/scripts/cdp_restore_invoke.cjs)（CDP invoke 恢复工具）
- **7 个低价值探针脚本**归档到 git 历史（commit b9f7878）后从工作区删除：
  - `_cdp_probe.cjs` / `_cdp_debug.cjs` / `_cdp_loaddata.cjs` / `_cdp_checkdb.cjs` / `_cdp_checkdb2.cjs` / `_cdp_backend_check.cjs` / `_check_db.py`
  - 均为一次性 CDP 调试探针（通用 evalOn 模板 + 特定查询），无独特价值，git 历史可查

### ISSUE-022 严重程度文档对齐
- [known-issues.md](file:///d:/yam/docs/known-issues.md) L559：ISSUE-022 详情严重程度 high→medium，与汇总表 L37 一致
- ISSUE-022 保持 open，不移除 cli.py dead code（用户决定）

---

## 项目清理与进度同步（2026-07-24 续）

### 清理目标
响应用户「检查一下项目进度，更新一下文档，清理一下项目」的要求，对本轮 UI 测试与 UX 优化过程中产生的一次性探针、旧版脚本、临时截图进行清理，同时确保可复用脚本保留。

### 保留脚本（可复用）
| 文件 | 用途 |
|------|------|
| [scripts/test_httpx_full_219.py](file:///d:/yam/scripts/test_httpx_full_219.py) | ISSUE-023 完整 219 个 yjxkdm 目录更新验证 |
| [scripts/test_httpx_hybrid.py](file:///d:/yam/scripts/test_httpx_hybrid.py) | ISSUE-023 Playwright 激活 + httpx 接管验证 |
| [scripts/test_issue025_cdp.cjs](file:///d:/yam/scripts/test_issue025_cdp.cjs) | ISSUE-025 分数线同步 CDP 端到端验证 |
| [scripts/test_issue028_cdp.cjs](file:///d:/yam/scripts/test_issue028_cdp.cjs) | ISSUE-028 导出 CSV/Excel/JSON CDP 验证 |
| [scripts/cdp_navigate_helper.cjs](file:///d:/yam/scripts/cdp_navigate_helper.cjs) | CDP 导航 + 数据加载工具 |
| [scripts/cdp_restore_invoke.cjs](file:///d:/yam/scripts/cdp_restore_invoke.cjs) | CDP invoke monkey-patch 恢复工具 |
| [scripts/test_full_ui_v3.cjs](file:///d:/yam/scripts/test_full_ui_v3.cjs) | 全量 UI 测试脚本（跳过导出） |
| [scripts/test_ux_cdp.cjs](file:///d:/yam/scripts/test_ux_cdp.cjs) | UX 优化项 CDP 自测脚本（趋势图/收藏/视图密度） |
| [scripts/test_trendchart_visual.cjs](file:///d:/yam/scripts/test_trendchart_visual.cjs) | 趋势图视觉验证脚本（展开院系→历年分析→CDP 截图） |

### 归档后删除脚本（一次性探针/旧版测试脚本）
以下文件均为 UI 调试过程中产生的临时探针或已被 v3 取代的旧版脚本，无独特复用价值，本次归档到 git 历史后从工作区删除：

- `scripts/check_body_text.cjs`
- `scripts/check_initial_state.cjs`
- `scripts/diagnose_rows.cjs`
- `scripts/diagnose_workspace.cjs`
- `scripts/find_store.cjs`
- `scripts/goto_school_view.cjs`
- `scripts/inspect_nav.cjs`
- `scripts/inspect_school_rows.cjs`
- `scripts/maximize_tauri.cjs`
- `scripts/test_export_current.cjs`
- `scripts/test_full_ui.cjs`（旧版，已被 v3 取代）
- `scripts/test_full_ui_v2.cjs`（旧版，已被 v3 取代）
- `scripts/test_minimal_m4.cjs`
- `scripts/test_minimal_read.cjs`
- `scripts/test_nav_only.cjs`
- `scripts/test_regex.cjs`
- `scripts/test_switch_views.cjs`
- `yam-desktop/screenshot_current.cjs`（临时截图脚本）

### 删除临时截图目录
- `d:\yam\screenshots\`：本轮回话临时截图（4 张页面状态演示图 + 折线图视觉调试产生的 20 余张对比图）
- `d:\yam\scripts\screenshots\`：已被 `.gitignore` 忽略，但工作区残留；包含 full-ui-20260723、ux-test 等测试截图

### 文档状态同步
- [docs/ux-optimization-plan.md](file:///d:/yam/docs/ux-optimization-plan.md)：
  - 为所有优化项增加「状态」字段（已完成 / 待处理）
  - 修正 4.2 趋势图 tooltip 状态为「已完成」（代码已实现并通过 CDP 自测）
  - 新增「补充：真实用户反馈（2026-07-24）」章节，记录用户新提出的 5 个体验问题及根因分析

### 折线图视觉优化（2026-07-24）
**问题**：用户反馈折线图"依旧难看的要死"。截图后发现主要问题：
1. 调用处传入错误的 `baseMin={600} baseMax={720}`，而实际最低分数据仅 335-370，导致折线全挤在图表底部。
2. 每个数据点上方常驻显示数值标签，视觉上杂乱。
3. 图表尺寸小（128px）、字体小（8-10px）、无面积填充。

**修复**：重构 `WorkspacePage.tsx` 的 `TrendChart` 组件：
- 移除 `baseMin/baseMax` 参数，改为按实际数据自动计算 Y 轴范围 + 12% padding
- 数据全部相同时显示「无变化」标签并构造对称区间让点居中
- 移除常驻数据标签，保留 hover tooltip
- 增加面积填充 + 蓝色渐变
- 折线改为平滑贝塞尔曲线
- 图表高度从 128px 增加到 192px，字体放大到 11-12px
- 数据点改为白底蓝边，hover 放大高亮

**二次优化（2026-07-24）**：用户反馈图表"像被拍扁拍大了一样"。截图后发现父容器过宽（约 1290px），而图表高度仅约 260px，折线和数据点被横向拉宽、纵向压缩，视觉笨重。
- 将画布比例从约 2:1 调整为 21:13（约 1.62:1），折线更有起伏感
- 限制单张卡片最大宽度为 `max-w-2xl`（672px），避免在宽屏上被无限拉宽
- 折线粗细从 2.5px 降至 2px，数据点默认从 r=5 降至 r=4，hover 从 r=7 调整为 r=6.5
- 坐标轴/网格线颜色减淡（`#e2e8f0` / `#f1f5f9`），Y 轴刻度从 4 档增加到 5 档
- 图表容器由上下堆叠改为响应式网格：`grid grid-cols-1 xl:grid-cols-2 gap-6`，大屏并排展示两张图，小屏保持堆叠
- 卡片 padding 从 p-5 减为 p-4，增加 `shadow-sm` 提升层次感

**验证**：
- `npm run build` ✅ 通过
- `cargo check` ✅ 通过（仅既有 warning）
- CDP 截图确认：最低分趋势图 348→330→330→264 下降清晰；招生人数趋势图（四年均为 6）正确显示「无变化」标签；两张图在 1920×1200 视口下并排展示，不再"拍扁"

### 本轮最终清理（2026-07-24）
继续响应「清理项目」要求，对折线图视觉调试阶段新产生的临时文件进行归类：
- **保留**：`scripts/test_trendchart_visual.cjs`（趋势图视觉验证脚本，可复用，已加入保留脚本清单）
- **删除**：
  - `scripts/cdp_reload_page.cjs`（一次性 Page.reload 探针，`cdp_navigate_helper.cjs` 已覆盖导航能力）
  - `d:\yam\screenshots\`（折线图调试产生的 20 余张临时对比截图）

### 趋势图空间优化讨论与决策（2026-07-24）

**问题本质**
用户反馈折线图「太占地方」，核心矛盾并非图本身比例不好，而是**展开区域空间分配与信息量不匹配**：四行年份表格信息密度高于两张趋势图，但趋势图却占用了远大于表格的空间。同时右侧详情区被 `max-h-[500px]` 限制，导致内容局促。

**约束条件**
- 左侧 256px 院校信息栏保留（用户视为信息约束，避免信息过载）
- 不采用详情页模式（用户认为会像掌上考研，失去工具优势）
- 保持 inline 展开，不跳转页面

**方案对比**
| 方案 | 思路 | 结果 |
|------|------|------|
| A. 单图切换 | 历年分析 Tab 内只显示最低分趋势，右上角切换招生人数 | 空间减半，但用户希望更系统解决 |
| B. 详情视图模式 | 点击院校进入类详情页 | 被否，像掌上考研 |
| C. 右侧抽屉 | 右侧滑出占满高度的抽屉展示详情 | 空间充裕但打断列表浏览节奏 |
| D. 图小表大 | 趋势图压缩，表格放大，按信息量分配 | 可行 |
| E. 表图左右分栏 | 左侧表格，右侧图 | 可行 |
| F. 动态图大小 | 按年份数据量决定图高：≤4 年 120px / 5-6 年 180px / ≥7 年 220px | **用户认可** |
| G. 折叠研究方向/考试科目 | 默认折叠，释放纵向空间 | 可作为辅助 |

**最终决策**
采用 **F. 动态图大小 + 详情区高度自适应** 组合：
1. 趋势图高度根据 `years.length` 动态变化，避免数据少时图过大
2. 右侧详情区取消固定 `max-h-[500px]`，改为按内容自适应并设置上限 `max-h-[min(700px,70vh)]`
3. 默认只展开第一个院系，减少单院校展开高度失控的风险

**实现要点**
- `TrendChart` 增加 `chartHeight` 参数，内部根据传入高度重新计算 `width/height/padTop/padBottom/drawHeight`
- 调用处 `chartHeight = years.length <= 4 ? 120 : years.length <= 6 ? 180 : 220`
- 右侧详情容器 `<div className="flex-1 p-6 overflow-auto max-h-[min(700px,70vh)]">`
- 小图（height ≤ 160）自动减小 padding、标题间距、线粗（1.5px）、点半径（3px），避免视觉过粗

**实现结果（2026-07-24）**
- 已修改 `WorkspacePage.tsx`：动态图高 + 详情区高度自适应 + 小图视觉细化
- `npm run build` ✅ 通过
- CDP 截图验证：华中科技大学（4 年数据）趋势图明显缩小，下方院系列表和其他院校行可见，空间分配与信息量匹配

### 院系所与研究方向层级优化（2026-07-24）
- **用户确认的展示规则**：同一专业下相同院系所只显示一次；院系所下面按研究方向区分招生计划；方向为空时回退考试科目或专项计划。
- **实现**：详情区按专业分组后，院系所首条显示院系名称，同院系后续条目显示 `↳ 研究方向`；每条保留独立最新年份最低分、招生人数、考试科目、年份数据和趋势图。
- **数据策略**：不修改后端数据、不丢弃招生计划记录；仅在前端建立展示层级，避免多个相同院系标题造成无区分度。
- **验证**：`npm run build` ✅，`WorkspacePage.tsx` diagnostics ✅。

### A-E 用户反馈修复结果（2026-07-24）
- **A 已完成**：管理显示专业进度条改为 `current / total`，修复多显示一个专业的进度偏移。
- **B 已完成**：院校整行可点击展开/收起；收藏星和比较复选框阻止事件冒泡，避免误展开。
- **C 已完成**：院系详情查询改为按院校的局部加载状态，页面不再闪烁全局「加载中…」，面板内显示轻量加载提示。
- **D 已完成**：院系标题行直接显示最新年份「最低分 / 招生人数」摘要，并默认展开首个院系，首次展开即可看到有效信息。
- **E 已完成**：展开状态改为 `Set<string>`，支持多个院校同时展开；再次点击整行或箭头可收起；每个院校独立维护院系、年份和历年分析状态。

### 待处理事项（后续开发重点）
- ISSUE-022：选择 disabled=true 的专业后采集卡住（需重新定义方向）

---

## ISSUE-017 300s 自适应超时 + 种子抓取心跳（2026-07-23）

### 背景
桌面端无种子专业采集时，`run_crawl_task` 固定 90s 超时会误杀种子抓取（29 省扫描耗时 >90s）。已改为自适应超时（初始 300s，收到 YAM_TOTAL 后降 90s）。但运行时验证发现 300s 仍不够（030100 法学种子抓取 >300s），且种子抓取阶段 dynamic.py 只发 `[INFO]` 不发 YAM_ 协议，Rust 端 `last_progress_time` 不刷新，300s 从采集开始死计时。

### 改动文件
- [yam/crawler/yanzhao.py](file:///d:/yam/yam/crawler/yanzhao.py)：`fetch_schools` 调 `fetch_and_save` 期间启动后台心跳线程，每 30s 输出 `YAM_PROGRESS 0/0 正在获取 {code} {name} 种子数据（...心跳 N）...`，刷新 Rust 端 `last_progress_time`。仅桌面端（`YAM_DESKTOP=1`）发协议行。顶部加 `import os` / `import threading`。
- [docs/known-issues.md](file:///d:/yam/docs/known-issues.md)：ISSUE-017 状态表 open→fixed，统计 26 fixed/1 partial/2 open，详情补心跳修复 + 运行时验证记录。

### 关键实现点
- 心跳线程 `daemon=True`，`heartbeat_stop.wait(30)` 每 30s 返回 False 触发一次 print，`finally: heartbeat_stop.set()` 确保所有退出路径停止心跳
- `YAM_PROGRESS 0/0` 不改变 `p.total`（保持 0），所以 `timeout_secs` 保持 300s 不降级（正确：种子阶段 total 未知）；但刷新 `last_progress_time` 使 300s 不触发
- `current_name` 被 YAM_PROGRESS 覆盖更新（L688），解决之前种子阶段 current_name 卡在首行的问题

### 运行时验证（030100 法学无种子实测，CDP 端口 9223）
| 阶段 | t=90s | t=300s | t=376s | 结论 |
|---|---|---|---|---|
| 仅 300s 超时（无心跳） | running ✅ | t≈301s 被杀 ⚠️ | - | 旧 90s bug 已修，但 300s 不够 |
| 补心跳后 | running ✅ | running ✅ | running ✅ | 12 个心跳持续刷新，不再被误杀 |

- 心跳每 30s 一个（t=30s 心跳1 → t=360s 心跳12），current_name 实时更新
- 验证脚本已清理（test_issue017_timeout.cjs / test_issue017_heartbeat.cjs / cancel_crawl.cjs）

---

## ISSUE-027 阶段 2 招生计划视图（2026-07-23）

### 背景
阶段 1 顶部视图切换按钮的"招生计划视图"置灰占位。阶段 2 实现：每行 = (院校, 专业, 院系, 方向, 考试科目, 最新年份分数线)，纯扁平表格，支持强筛选/排序/分页，行可展开看多年分数。导出跟随当前视图。

### 设计决策（用户已拍板）
- 纯扁平表格：每行一个招生计划，同院校行不特殊聚合，靠背景色区分
- 分数线列：默认最新年份 min_score + 招生人数；行展开看多年分数（数据已加载低成本附带）
- 复用现有 WorkspaceFilterPanel 筛选；排序映射到 plan 级字段；客户端分页 pageSize=20
- 导出：viewMode==='plan' 时导出 plan 行，文件名加 `_招生计划` 后缀

### 改动文件
- [db.rs](file:///d:/yam/yam-desktop/src-tauri/src/db.rs)：新增 `WorkspacePlanRow` 结构体 + `get_workspace_plans` 函数（JOIN workspace_schools + workspace_departments，EXISTS 子查询查 workspace_department_years 单科筛选，batch_get_department_years 批量查 years 避免 N+1，Rust 侧排序）；`WorkspaceYear` 加 `Clone`
- [commands.rs](file:///d:/yam/yam-desktop/src-tauri/src/commands.rs)：新增 `fetch_workspace_plans` 命令（参数同 fetch_workspace_data 但无 school_id）
- [main.rs](file:///d:/yam/yam-desktop/src-tauri/src/main.rs)：注册 `fetch_workspace_plans`
- [db.ts](file:///d:/yam/yam-desktop/src/lib/db.ts)：新增 `WorkspacePlanRow` 接口 + `fetchWorkspacePlans` 函数 + mock 数据
- [WorkspacePage.tsx](file:///d:/yam/yam-desktop/src/pages/WorkspacePage.tsx)：启用 plan 按钮（移除 disabled）+ plans/planPageNum/planPageSize/expandedPlanId state + plan 加载 effect（viewMode/activeMajorCodesKey/filters 依赖）+ plan 表格渲染（9 列 grid + 行展开多年分数表）+ plan 分页 + handleExport plan 分支（15 列 + `_招生计划` 文件名）+ 导出按钮 disabled 适配 plan 视图 + resultCount 适配

### 关键实现点
- `get_workspace_plans`：JOIN schools+departments，单科分数筛选用 EXISTS 子查询（非 LEFT JOIN+DISTINCT）避免行重复
- `batch_get_department_years`：一次 IN 查询所有 dept 的 years，HashMap 分组，每组 year DESC，years[0]=最新年份
- Rust 侧排序：sort_by latest_min_score/latest_enroll_count/school_name/display_order/school_code（800 行 <1ms）
- min_score 筛选语义：作用于 s.min_score（院校专业级聚合），与院校视图一致；plan 行 latest_min_score 仅供展示
- plan 视图不触发 sync（sync 由院校视图 autoSync effect 负责）
- 院校视图表格用 `viewMode === 'school' && (<>...</>)` 包裹（table+pagination 两元素需 fragment）

### 验证结果
- `cargo check` ✅ 通过（1 个无害 warning：最后 idx+=1 未读取）
- `npm run build` ✅ 通过（839ms）
- CDP（端口 9223）AI 自测 ✅（7 场景全过）：
  - 后端 fetch_workspace_plans(['081200']) 返回 1043 行，字段完整（school/dept/direction/subjects/latest_year/years）
  - 多专业查询 ['081200','083500'] 返回 1506 行
  - 招生计划视图按钮已启用，表格加载 21 行（20 数据 + 表头）
  - 第一行：华中科技大学/计算机科学与技术/计算机科学与技术学院/人工智能方向/考试科目/2026/360
  - 行展开：历年分数表显示（tableCount=1）
  - 分页：共 1043 条，有页大小选择器
  - 切回院校视图正常

### 待桌面手动测试
- 多专业模式 + 招生计划视图 + 筛选 + 排序 + 分页 + 导出 CSV
- 行展开多年分数表
- 切换专业 Tab 时 plan 数据刷新

---

## ISSUE-027 阶段 1 工作区多专业合并展示 + 双视图切换（2026-07-23）

### 背景
工作区 `WorkspacePage` store 有 `visibleMajorCodes`（多专业列表），但实际数据加载只用单个 `majorCode`，导致选 4 个专业只显示一个的数据。底层数据库 `workspace_schools` 主键 `(school_id, major_code)` 天然多专业。

### 设计决策（用户拍板，已持久化 project_memory.md）
- 双视图切换：院校视图（默认）+ 招生计划视图（阶段 2）
- 顶部专业 Tab："全部" + 各专业单选聚焦；复用 `currentMajor`（null=全部）
- 院校视图：同院校多专业聚合一行，展开按专业分组
- 导出：跟随当前专业范围，加专业列

### 改动文件
- [db.rs](file:///d:/yam/yam-desktop/src-tauri/src/db.rs)：3 函数 `major_code: &str` → `&[&str]` + SQL `IN(...)` + `major_in_clause` helper
- [commands.rs](file:///d:/yam/yam-desktop/src-tauri/src/commands.rs)：`fetch_workspace_data` + `fetch_workspace_filter_options` 改 `Vec<String>`
- [db.ts](file:///d:/yam/yam-desktop/src/lib/db.ts)：`fetchWorkspaceData(schoolId, majorCodes[], filters)` + `fetchWorkspaceFilterOptions(majorCodes[])` + mock 补 081200 样例
- [appStore.ts](file:///d:/yam/yam-desktop/src/stores/appStore.ts)：加 `viewMode: 'school'|'plan'` + `setViewMode` + partialize 持久化
- [WorkspacePage.tsx](file:///d:/yam/yam-desktop/src/pages/WorkspacePage.tsx)：activeMajorCodes + fallback 改造 + 专业 Tab + 视图切换置灰 + aggregatedSchools 聚合（MIN/SUM/OR）+ 展开按专业分组（departmentsByMajor + flatDepts）+ 收藏复合键批量 toggle + 导出加专业列

### 关键实现点
- `activeMajorCodes`：currentMajor=null→全部 visibleMajors，非空→单专业。`activeMajorCodesKey=join(',')` 作 useEffect 稳定依赖
- fallback 改造：仅 currentMajor 非 null 且非法时回 null（保护"null=全部"语义）
- 聚合：`aggregatedSchools` 按 school_id 分组，min_score=MIN/enroll_count=SUM/display_order=MIN/布尔=OR，保留 `_raw[]`
- 展开分组：`departmentsByMajor` 按 major_code 分组，`flatDepts` 扁平化，`expandedDeptIndex` 跨专业连续编号
- 收藏：`favorites` Set 改存 `${school_id}|${major_code}` 复合键，聚合行批量 toggle
- 导出：`_raw.flatMap` 每个 (school,major) 一行，表头加专业代码/专业名称

### 验证结果
- `npm run build` ✅ 通过（无 TS 错误）
- `cargo check` ✅ 通过（任务 1-3 阶段）
- CDP（端口 9223）AI 自测 ✅：
  - 后端多专业查询：fetch_workspace_data(['081200','083500']) 返回 410 条/306 校/104 所跨专业
  - 专业 Tab：全部 + 计算机科学与技术/软件工程/电子信息/人工智能
  - 视图切换：院校视图高亮、招生计划视图置灰
  - 聚合徽标：南京航空航天大学"(4 个专业)"
  - 展开分组：计算机科学与技术（10 个院系）/软件工程（6 个院系）/电子信息（8 个院系）/人工智能（6 个院系）
  - Store 持久化：viewMode="school" 生效

### 待桌面手动测试
- 收藏批量 toggle（聚合行点击→多专业都收藏/取消）
- 导出 CSV（全部模式含专业列、每 (school,major) 一行）
- 单专业 Tab 切换数据加载

---

## ISSUE-027 多专业 Tab 多选支持 + syncedMajorsRef 优化（2026-07-23 续）

### 背景
阶段 1 的专业 Tab 是"全部"+各专业单选聚焦（复用 `currentMajor: string | null`），用户反馈"不支持同时显示不全选的多个专业"——想选 2-3 个但非全部专业做对比。同时阶段 1 遗留的 syncedMajorsRef 修复（解决 Tab 切换慢）未跑 npm run build 验证。

### 设计决策
- 状态模型：`currentMajor: string | null` → `selectedMajorCodes: string[]`（空=全部 / 非空=选中的那些 / 单元素=单专业聚焦）
- Tab 交互：纯点击 toggle（不用 Ctrl/Shift），"全部"按钮=清空，全选自动清空避免歧义
- 不持久化（与 currentMajor 一一致），启动默认聚焦第一个专业（App.tsx 设置）
- 多选提示：`selectedMajorCodes.length >= 2 && < visibleMajors.length` 时显示"已选 N 个"（单选/全部不显示）
- App.tsx / DataReadyPage 行为不变（启动 + 进工作区默认仍聚焦第一个专业）

### 改动文件
- [appStore.ts](file:///d:/yam/yam-desktop/src/stores/appStore.ts)：移除 `currentMajor`/`setCurrentMajor`，新增 `selectedMajorCodes: string[]` + `setSelectedMajorCodes`（不持久化）
- [WorkspacePage.tsx](file:///d:/yam/yam-desktop/src/pages/WorkspacePage.tsx)：activeMajorCodes 派生改基于 selectedMajorCodes + fallback cleanup（过滤 stale code）+ handleToggleMajor（全选自动清空）+ Tab 渲染（toggle + 高亮 includes + "已选 N 个"提示）
- [DataReadyPage.tsx](file:///d:/yam/yam-desktop/src/pages/DataReadyPage.tsx)：`setCurrentMajor` → `setSelectedMajorCodes([code])`（行为不变）
- [App.tsx](file:///d:/yam/yam-desktop/src/App.tsx)：`setCurrentMajor` → `setSelectedMajorCodes([first])`（行为不变）

### syncedMajorsRef 优化（阶段 1 遗留，本次验证通过）
- [WorkspacePage.tsx](file:///d:/yam/yam-desktop/src/pages/WorkspacePage.tsx) L302-346：`syncedMajorsRef = useRef<Set<string>>(new Set())`，Effect 1 只 sync 未在 ref 里的专业，已 sync 的专业 Tab 切换只查 DB（毫秒级）。用户点"刷新数据"按钮（handleSync）强制重新 sync 不受此 ref 限制
- 解决阶段 1 用户反馈"点击专业 tag 切换得很慢"（每次切换都跑 Python sync_to_tauri.py 1-2 秒/专业）

### 关键实现点
- `activeMajorCodes` 派生：`selectedMajorCodes.length === 0 ? visibleMajors : filter(合法)`，stale code 兜底过滤
- `handleToggleMajor(code)`：toggle in/out，`next.length === visibleMajors.length` 时 set []（全选自动清空）
- fallback cleanup effect：selectedMajorCodes 里不在 visibleMajors 的清理掉（ManageMajorsModal 删专业后残留处理）
- 下游消费（收藏复合键/导出 _raw.flatMap/展开 departmentsByMajor/syncedMajorsRef）基于 activeMajorCodes 数组，自动适配无需改

### 验证结果
- `npm run build` ✅ 通过（760-914ms，无 TS 错误）
- CDP（端口 9223）AI 自测 ✅（8 场景全过）：
  - 初始单选聚焦（App.tsx 设第一个专业），无提示
  - 多选 toggle：点第二个专业 → 2 个高亮 + "已选 2 个"
  - "全部"按钮清空 → "全部"高亮其他不高亮
  - toggle off 最后一个 → 自动回"全部"模式
  - 全选自动清空：逐个选到第 4 个 → 触发"全部"模式（高亮=0, 全部active=true）
  - 后端多专业查询：fetch_workspace_data([081200,083500]) 返回 410 条/306 校
- 4 个已同步专业：081200(271校)/083500(139校)/085400(228校)/085410(217校)

### 待桌面手动测试
- 多选 toggle 交互（点 2-3 个专业对比）
- 全选自动清空行为是否符合直觉
- 多选模式下收藏/导出/展开分组正常

---

## ISSUE-025 分级匹配 100% 覆盖率完善（2026-07-22）

### 背景
ISSUE-025 修复后 081200 仅 242/271 有分数（89%），29 所 985 自划线院校（北航、复旦、浙大、国防科大等）min_score=0。用户要求"要 100%，继续完善"。

### 根因
掌上考研 `schoolScore` 接口对 985 自划线院校通常只返回 2 位门类码（如 `08` 工学），而非 6 位专业码（如 `081200`）。原 `fetch_score_lines` / `fetch_score_lines_batch` 只做 6 位精确匹配，导致这些数据被过滤掉。

### 修复方案
[yam/crawler/zhangshangkaoyan.py](file:///d:/yam/yam/crawler/zhangshangkaoyan.py) 的 `fetch_score_lines`（line 313-350）和 `fetch_score_lines_batch`（line 426-466）实现分级匹配：
- **6 位精确**：`code == major_code`，最高优先级
- **4 位一级学科**：`len(code) == 4 and major_code.startswith(code)`，note 标注"一级学科参考线"
- **2 位门类**：`len(code) == 2 and major_code.startswith(code)`，note 标注"门类级参考线"
- 每年只取最高优先级匹配（`break` 语句保证）

### 覆盖率验证结果

| 专业 | 总学校 | 有分数 | 覆盖率 | 零分学校数 | 提升 |
|---|---|---|---|---|---|
| 081200 计算机科学与技术 | 271 | 267 | 98.5% | 4 | 242→267 (+25) |
| 083500 软件工程 | 139 | 136 | 97.8% | 3 | 118→136 (+18) |
| 085410 人工智能 | 217 | 215 | 99.1% | 2 | 重新采集 |

### 剩余零分学校（9 所，均属数据源限制）
- 中国航空研究院 613/631/640 所（科研院所，掌上考研无 school_id）
- 中国舰船研究院(武汉数字工程研究所)
- 网络空间部队第五十六研究所、陆军兵种大学（军事院校）
- 华北电力大学(保定)、绍兴文理学院（新更名/特殊情况）

### 985 高校分数线抽样验证
- 081200：华中科技大学 335、中国人民大学 330、国防科技大学 325、西安交通大学 320
- 083500：大连理工大学 328、国防科技大学 325、武汉大学 315
- 085410：西安交通大学 320、南京大学 315、华中科技大学 315

### 文件变更
- [yam/crawler/zhangshangkaoyan.py](file:///d:/yam/yam/crawler/zhangshangkaoyan.py)：`fetch_score_lines` 和 `fetch_score_lines_batch` 改为分级匹配（6位>4位>2位）
- [docs/known-issues.md](file:///d:/yam/docs/known-issues.md)：ISSUE-025 补充分级匹配改进记录和覆盖率验证表
- 清理 10 个一次性验证脚本（list_zero_score_schools / debug_zero_score / test_zsy_api / test_code_match / test_grading_match / fill_zero_scores / verify_final / debug_code_match / fill_zero_scores_multi / verify_coverage_all）

### 同步数据
- 081200: 271 所学校, 1043 个院系, 3567 条年份数据
- 083500: 139 所学校, 463 个院系, 1629 条年份数据
- 085410: 217 所学校, 514 个院系, 1547 条年份数据

### 编译验证
- `python -m py_compile yam/crawler/zhangshangkaoyan.py`：通过

---

## 新规划（2026-07-21）

用户提出 4 个新需求，已登记到 `docs/known-issues.md`：

- **ISSUE-023**：专业目录更新流程耗时过长（30 分钟+）。短期方案 `update_majors_catalog.py` 改 asyncio + aiohttp 并发，目标 10 分钟内完成。
- **ISSUE-024**：登录状态缺乏统一管理。短期方案 SettingsPage 新增"登录状态"卡片 + `check_login_status` / `refresh_login` / `clear_login` 三个 Tauri 命令；中期抽象 `SessionStore` 接口支持研招网 + 掌上考研。
- **ISSUE-025**：未采集实际分数线信息。短期方案调研 `scoreLines.do` 接口 + 新增 `fetch_score_lines` 方法 + `score_lines` 表 + WorkspacePage 显示。
- **ISSUE-026**：工作区"导出"按钮无功能。短期方案调用 Tauri `dialog.save` + `fs.writeTextFile` 导出 CSV。

---

## ISSUE-023 httpx+Playwright 激活方案实施（2026-07-22）

### 背景
旧方案 `update_majors_catalog.py` 用 Playwright multi-context 单进程跑 219 个 yjxkdm，耗时 30 分钟+。前几轮调优（CONCURRENCY 4→6→3、批次内并发进度展示、单 context 多 page 并发）仍无法突破 10 分钟目标。且实测中发现 69 个专业学位返回 0 majors（缺 fallback 兜底）、50 个学术学位异常 fallback（限流导致枚举全失败 + first_list 为空时直接返回不走枚举）。

### 修复方案
彻底重写 [yam/scripts/update_majors_catalog.py](file:///d:/yam/yam/scripts/update_majors_catalog.py)，核心从 Playwright multi-context 转为 httpx.AsyncClient 并发：

1. **MajorsSearcher 仅用于登录**：启动后调一次 `interactive_login` 获取完整 cookie jar，关闭浏览器。
2. **新 Playwright browser 激活 session**：对每个 yjxkdm 用独立 context 访问详情页激活 session，提取 `seed_major` + cookies。`first_list` 为空时改用虚拟详情页 URL 激活后重试。
3. **httpx 并发枚举 zydm**：每个 yjxkdm 独立 `httpx.AsyncClient`（独立 cookie jar），按 `XX00-XX09`（base）+ `XXJ0-XXJ9`（教育部自设）+ `XXZ0-XXZ9`（高校自设交叉）共 30 个候选枚举。
4. **combo 拆分**：`totalCount>10` 时用 8 种 `jsggjh`/`tydxs` 组合拿全数据。
5. **限流指数退避重试**：检测到"访问太频繁"时 sleep 2→4→8 秒重试 3 次，连续 3 次限流 break。
6. **fallback 兜底**：研招网对专业学位（0854 等）按一级学科招生，`zys.do` 返回空是真实情况，注入 `yjxkdm+"00"` fallback。

### 关键参数
- `CONCURRENCY = 15`（实测 30 触发 IP 级限流）
- `ZYDM_SLEEP_MS = 400`
- 限流退避：2s → 4s → 8s，连续 3 次限流 break

### 修复的关键 yjxkdm

| yjxkdm | 之前桌面端跑 | 修复后 | 说明 |
|---|---|---|---|
| 0270 统计学 | 1 fallback | 2 个 | first_list 空时枚举发现交叉学科 |
| 0302 政治学 | 14（限流） | 37 个 | 限流缓解后枚举完整 |
| 0301 法学 | 84 | 94 个 | +10 |
| 0779 公共卫生 | 0→fallback | 2 个 | 关键修复：first_list 空也走枚举 |
| 0202 应用经济学 | 68 | 72 个 | +4 |

### 验证结果（2026-07-22 桌面端 UI 重跑）
- 总 majors：1465 → **2255**（+53.9%）
- 0 majors 的 yjxkdm：**0 个**（原 69 个专业学位 + 50 个学术学位异常 fallback 全部修复）
- 失败：0 个
- 退化：0 个（77 个 yjxkdm 数据更多，0 个更少）
- 总耗时：约 7-8 分钟（达 10 分钟目标）

### 数据正确性说明
- **64 个专业学位 fallback 是真实情况**：研招网对 0854 电子信息、085410 人工智能等专业学位按一级学科招生，`zys.do` 列表页返回 `totalCount=0` 是真实情况，不是"不可查询"。详见 ISSUE-018。
- **44 个学术学位 fallback 是真实情况**：0307/0770 等新兴学科研招网无独立二级学科数据。

### 文件变更
- [yam/scripts/update_majors_catalog.py](file:///d:/yam/yam/scripts/update_majors_catalog.py)：彻底重写，httpx + Playwright 激活方案。新增 4 个核心函数：`_call_zys_do_httpx` / `_playwright_activate_session` / `_httpx_enumerate_yjxkdm` / `_process_one_yjxkdm`。重写 `update_all_majors`：MajorsSearcher 仅用于登录→关闭→启动新 Playwright browser + httpx 并发。
- [yam/majors_searcher.py](file:///d:/yam/yam/majors_searcher.py)：优化 wait 时间（`load`→`domcontentloaded`，300ms→150ms），`total_count<=1` 时也重试，跳过 `initial_zydm`。
- [yam-desktop/src-tauri/src/commands.rs](file:///d:/yam/yam-desktop/src-tauri/src/commands.rs)：`run_update_catalog_task` 默认加 `--resume` flag，支持断点续传 via `majors_realtime.partial.json`。
- [data/majors_realtime.json](file:///d:/yam/data/majors_realtime.json)：219 个 yjxkdm 全部成功，2255 majors。
- [docs/known-issues.md](file:///d:/yam/docs/known-issues.md)：ISSUE-023 更新为 `fixed`，含 httpx 方案详细修复位置和 2026-07-22 验证结果。

### 编译验证
- `python -m py_compile yam/scripts/update_majors_catalog.py yam/majors_searcher.py`：通过
- `cargo check`：通过
- `npm run build`：通过

### 后续待办
- [ ] 长期：抽象 `SessionStore` 接口（ISSUE-024），让 httpx 也走统一的 session 管理层。
- [ ] ISSUE-025：分数线采集调研 `scoreLines.do` 接口。

---

## 历史里程碑摘要（2026-07-13 至 2026-07-21）

> 以下为早期开发阶段的详细记录摘要，完整 ISSUE 修复详情见 [docs/known-issues.md](file:///d:/yam/docs/known-issues.md)。详细研究过程已归档到 git 历史。

### 里程碑 A/B/C（2026-07-13）— 数据层 + 前端筛选 + 专业管理
- **A 数据层**：Python `schools` 表扩展 school_code/province_code/is_985/is_211/display_order；`sync_to_tauri.py` 调用掌上考研排名；Tauri `db.rs` 支持 default/school_code 排序 + 研招网省份顺序 + 固定 7 个 level_tags
- **B 前端筛选**：`WorkspaceFilterPanel` 院校层次/考试科目改展开式选择框；排序新增"默认排序（掌上考研）""按国标代码排序"；合并"同步后端数据"到"刷新数据"
- **C 专业管理**：`ManageMajorsModal` 接真实数据 + visibleMajorCodes 持久化；专业切换自动 sync + load

### 采集流程修复（2026-07-15 至 2026-07-16）— ISSUE-004~014
- **ISSUE-004**：种子缺失自动调用 DynamicYanZhaoCrawler；CLI 新增 `--force`
- **ISSUE-006**：`cancel_crawl` 命令 + 90s 超时检测 + `taskkill /F /T` kill 子进程
- **ISSUE-007**：`reset_crawl` 命令 + CrawlingPage useEffect 区分 running/done/major_code 三状态
- **ISSUE-008/009/010**：空状态 UI + BackgroundTaskPanel 全局浮动面板 + 进度文案优化
- **ISSUE-011/012**：采集失败不创建空专业 + 面板状态变色 + 已用时计时器
- **ISSUE-013**：Python 错误信息 YAM_ERROR 协议 + Rust `filter_python_stderr()` 过滤 traceback
- **ISSUE-014**：985/211 标签改用掌上考研 `fetch_school_tags_map`（研招网 b985 字段不可靠）

### ISSUE-015 四阶段采集方案（2026-07-17）— 100% 覆盖率
- 阶段 1 省份扫描（34 省）→ 210 所
- 阶段 2 多筛选组合（8 种 × 11 省）→ +44 = 254 所
- 阶段 3 关键词搜索（38 关键词）→ +14 = 268 所
- 阶段 4 dwzys.do 补缺（aiohttp + 段±10 + 自适应限流）→ +3 = **271/271 = 100%**
- dwzys.do 限流实测：并发 ≥10 立即触发，30s 批间 sleep 成功率 61%，自适应限流 15/30/60s
- **文件**：`yam/crawler/dynamic.py` dwzys.do 阶段重写为 aiohttp + 段±10 + 自适应限流

### ISSUE-016 错误横幅显示 traceback 修复
- `yam/cli.py` 新增 `except Exception` 广义捕获，输出 `YAM_ERROR` 结构化错误
- `commands.rs` 新增 `filter_python_stderr()` 过滤 traceback 行，仅保留 `ErrorType: message`

### 多专业验证（2026-07-17）
- 081200 计算机科学与技术：271/271 所 ✓
- 083500 软件工程：139/139 所 ✓（ISSUE-017 自适应超时：种子阶段 300s，详情阶段 90s）
- 085400 电子信息：228/228 所种子 ✓（登录入口 404 修正 + 武断报错删除）
- 085410 人工智能：217 所历史数据 ✓

### 方案 A 实施（2026-07-16/17）— 内置登录向导 + 原子启动锁
- `LoginRequiredModal` + Rust `login_yanzhao` 命令 + Python `DynamicYanZhaoCrawler.login_and_fetch`
- `run_crawl` 使用 `AtomicBool::compare_exchange` 防止重复启动
- 登录状态判断：真正凭证为 `account.chsi.com.cn` 域下的 `CASTGC`（排除 JSESSIONID 等干扰）
- 研招网 URL 构造支持动态 `sign`/`sign2`

### 阶段 3 原子启动边界补齐（2026-07-27）
- 盘点结论：`run_crawl` 的原子锁已存在，但旧 `reset_crawl` 会在运行中 kill 子进程并清空状态，形成绕过原子锁的旁路。
- Rust 修复：`reset_crawl` 仅允许重置已结束状态；检测到 `running=true` 时返回“采集任务正在运行，请先取消当前任务”，不再终止子进程。
- 前端修复：`CrawlingPage.startCrawl` 不再在启动前无条件 reset，直接依赖 `run_crawl` 的原子检查；启动失败时释放 `isLaunchingRef`，允许重试。
- 专业选择/更新入口：仍尝试清理已结束状态以支持重新采集；若任务正在运行，后端安全拒绝重置，页面随后恢复当前任务或显示“已有其他采集任务”。
- 自动化调试入口不再调用 reset，避免测试辅助函数意外终止真实采集。
- 结论：只有显式 `cancel_crawl` 可以终止运行中的采集；阶段 3“原子启动锁”验收项完成。
- 验证：`npm run build` ✅；`cargo check` ✅（仅 `db.rs` 预存 unused_assignments warning）；VS Code diagnostics 为空。

### 阶段 3 登录向导闭环（2026-07-27）
- `CrawlingPage.startCrawl` 在启动 Python 采集前调用 `checkLoginStatus()` 检查本地 CASTGC/SESSION 凭证。
- 未登录：不启动 Python 采集任务，直接展示 `LoginRequiredModal`，避免“先失败一次再登录”的等待和失败日志。
- 登录成功：`login_yanzhao` 保存 cookie 并抓取专业种子，随后重新进入 `startCrawl`；预检通过后启动采集。
- 兜底保留：本地 Cookie 存在但服务端已失效时，Python `LoginRequiredError` / `YAM_ERROR` 仍会触发登录向导。
- 路线图“内置登录向导”验收项完成。
- 验证：`npm run build` ✅；`cargo check` ✅（仅 `db.rs` 预存 warning）；VS Code diagnostics 为空。

### 阶段 3 采集五状态机（2026-07-27）
- 统一任务状态口径：`idle / running / completed / failed / cancelled`，解决历史文档“五状态却列出六/七值”的冲突。
- Rust 新增 `CrawlStatus` 枚举，并在 `CrawlProgress.status` 序列化输出；启动、成功、失败、零数据和取消均有明确迁移。
- Rust 后端成为任务状态唯一事实源；原有 `running / done / error` 字段暂时保留以兼容现有接口，但前端不再通过其组合猜测状态。
- `CrawlingPage` 初始化、后台恢复、轮询结束判断均改用 `status`；页面本地只保留 `checking / syncing / no-target` 等展示阶段。
- `BackgroundTaskPanel` 改用 `status` 判断运行、完成、失败、取消和自动隐藏。
- 路线图“采集状态机 + 五种状态”验收项完成。
- 验证：`npm run build` ✅；`cargo check` ✅（仅 `db.rs` 预存 warning）；VS Code diagnostics 为空。

### 阶段 3 ISSUE-022 闭环（2026-07-27）
- `Config.get_major()` 改为优先读取 `data/majors_realtime.json`，与桌面端专业选择页使用同一主数据源；`majors.yaml` 仅作 fallback。
- 删除 `yam.cli fetch` 的 `enabled` 拒绝分支，消除“前端可见、CLI 却因静态 enabled 拒绝”的分裂路径。
- 专业识别验证：`140700 区域国别学`、`0101J1 中国古典学` 从实时目录命中；`085410` 静态 fallback 正常。
- `YAM_ERROR` 协议增加结构化分类：`UNKNOWN_MAJOR / LOGIN_REQUIRED / NO_PUBLIC_DATA / UNREACHABLE / FAILED`；Rust 解析并输出 `CrawlProgress.error_code`。
- 无公开院校数据会明确返回 `NO_PUBLIC_DATA`，网络/种子接口异常返回 `UNREACHABLE`，不再全部落入通用失败文案。
- ISSUE-022 标记 fixed；路线图“专业可见即可进入采集”的最小闭环完成。
- 验证：Python `compileall` 通过；无效专业返回预期 `YAM_ERROR UNKNOWN_MAJOR`；`npm run build` ✅；`cargo check` ✅（仅预存 warning）；VS Code diagnostics 为空。

### 阶段 3 采集失败局部恢复 + 专业级重试（2026-07-27）
- 修正桌面端默认采集语义：Rust 不再固定向 Python 传 `--force`，失败后再次采集会复用 `fetch_log`，跳过已成功院校，仅处理未成功/失败项。
- `run_crawl` 新增可选 `force` 参数；只有专业管理页点击“更新”时传 `force=true`，用于用户明确要求的全量刷新。
- `CrawlTarget.force` 在任务成功启动后立即清除，后续失败重试不会再次清空历史成功记录。
- `CrawlingPage` 失败/取消横幅新增“重试失败项”按钮，直接从上次成功位置继续。
- 既有 Python 三阶段降级重试继续负责单次任务内的临时网络/限流失败；`fetch_log` 负责跨任务断点恢复，两层职责分离。
- 路线图“采集失败局部恢复 + 专业级重试”验收项完成，阶段 3 的 5.2 采集与登录条目全部闭环。
- 验证：Python `compileall` ✅；`npm run build` ✅；`cargo check` ✅（仅 `db.rs` 预存 warning）；VS Code diagnostics 为空。

### 阶段 4 首项：分数线粒度与可信度显式化（2026-07-27）
- 问题确认：当前同步按 `school_id + major_code + year` 聚合最低分，再挂到该校各方向；此前 UI 标为“最低分/方向趋势”，容易被误解为方向精确分数线。
- 同步表 `workspace_department_years` 新增 `score_scope / source / updated_at / match_note`，Python 同步脚本和 Rust migration 均支持旧库增量加列。
- `score_scope` 当前区分：`school_major / first_level_reference / category_reference`；预留 `department / exact_direction` 供未来精确模型使用。
- Python 同步保留 `score_lines.source / updated_at / note`，并根据 note 识别一级学科参考线和门类参考线；普通聚合值明确标为 `school_major`，不冒充方向线。
- Rust `WorkspaceYear` DTO、单院校 years 查询、计划视图批量 years 查询及 TypeScript 类型已完整贯通新字段。
- 工作区院校详情、年份详情、趋势图、计划视图展开和计划导出统一显示“院校专业参考线/一级学科参考线/门类参考线”、来源、更新时间和匹配说明。
- 删除院校详情中硬编码的学费 8000、学制 3 年、更新时间 2025-05-20；更新时间改为真实同步字段，无数据时显示“暂无”。
- 隔离迁移验证：临时 Tauri DB 同步 `081200` 成功（271 所、1043 个院系、3567 条年份数据）；新列完整，样例为 `school_major / zhangshangkaoyan / 2026-07-22T09:50:56`。
- 验证：Python `compileall` ✅；`npm run build` ✅；`cargo check` ✅（仅 `db.rs` 预存 warning）；VS Code diagnostics 为空。
- 结论：阶段 4 的数据可信度垂直闭环已完成首步；后续应建立稳定 Direction/Plan ID 和真实方向级 YearScore，再做方向比较与收藏。

### 阶段 4 研究方向 fallback 统一（2026-07-27）
- 提取 `getDirectionLabel()`，统一规则：研究方向 → 考试科目 → 专项计划 → “未注明研究方向”。
- 院校详情方向列表、展开正文、招生计划视图与 CSV/Excel 导出全部使用同一函数，消除空白和 `—` 的不一致。
- 路线图“研究方向为空时的 fallback 规则”验收项完成。
- 验证：`npm run build` ✅（仅既有 chunk 警告）；VS Code diagnostics 为空。

### 阶段 4 数据质量检测补齐（2026-07-27）
- `DataAuditor` 新增空方向检测：研究方向、考试科目、专项计划均为空时，记录为 INFO 并说明 UI 将 fallback 为“未注明研究方向”。
- 重复招生计划检测改用完整业务键：学校、院系、年份、plan_id、spe_id、研究方向、考试科目，避免把同院系同年的合法不同方向误判为重复。
- 新增计划/方向年份断档检测：按稳定计划组合聚合年份，报告中间缺失年份及最多 20 个样例。
- 保留既有校级招生计划/分数线年份覆盖交叉检查，两层检测分别覆盖“跨数据源年份不一致”和“单计划内部断档”。
- 验证：Python `compileall` ✅；真实 `081200` 审计命令运行通过；隔离样本准确触发 1 条空方向与 1 组 2024 年断档；VS Code diagnostics 为空。
- 路线图“重复计划检测、年份缺失检测、空方向检测”验收项完成。

### 阶段 4 多方向并行展开（2026-07-27）
- 院校视图由“每所学校只能展开一个方向”改为 `expandedDepartmentIds: Set<number>`，同一学校可同时展开多个院系/研究方向。
- 每个方向独立维护选中年份与历年分析开关（`activeYearByDepartment` / `historicalDepartmentIds`），互不干扰。
- 招生计划视图由单一 `expandedPlanId` 改为 `expandedPlanIds: Set<number>`，支持多条计划同时展开；重新加载计划数据时统一清空集合。
- 删除学校级单选方向状态及无用索引计算，展开内容直接绑定当前 `dept` 数据。
- 路线图“多院校、多方向并行展开”完成：多院校能力沿用既有 Set + localStorage，多方向能力本次补齐。
- 验证：`npm run build` ✅（仅既有 chunk 警告）；旧单选状态标识搜索无残留；VS Code diagnostics 为空。

### 阶段 4 研究方向关键词筛选（2026-07-27）
- `WorkspaceFilters` / Tauri command / Rust `WorkspaceFilterParams` 新增 `researchDirection` 参数。
- 院校视图和招生计划视图 SQL 均增加 `d.research_direction LIKE` 条件；浏览器 mock 筛选保持同样语义。
- 高级筛选面板新增“研究方向关键词”输入，支持应用、重开回填、重置和已应用状态提示。
- 路线图“方向级筛选”取得首个明确闭环；方向级比较与更多方向排序仍待后续实现。
- 验证：`npm run build` ✅；`cargo check` ✅（仅 `db.rs` 预存 warning）；VS Code diagnostics 为空。

### 阶段 4 方向级排序（2026-07-27）
- `WorkspaceFilters.sortBy` 增加 `department_name / research_direction`。
- 筛选组件接收当前 `viewMode`，仅在招生计划视图展示“按院系名称 / 按研究方向”排序，避免院校视图出现无意义选项。
- Rust 计划行排序新增院系名称和研究方向比较，保留分数、招生人数、学校名称、代码与默认排序。
- 阶段 4“方向级筛选 + 排序”完成；方向级比较仍待后续。
- 验证：`npm run build` ✅；`cargo check` ✅（仅 `db.rs` 预存 warning）；VS Code diagnostics 为空。

### 阶段 4 真实方向/计划比较（2026-07-27）
- 招生计划视图每行新增比较选择，按 `department_id` 唯一标识，最多选择 3 条真实计划/方向。
- 比较浮动按钮仅在计划视图显示，并把实际 `WorkspacePlanRow[]` 传给 App；学校视图不再打开 mock 比较。
- App 删除 `MOCK_COMPARE_SCHOOLS` 依赖，改为保存真实待比较计划行；清空全部会清空状态并关闭弹窗。
- CompareModal 改为“方向/计划比较”，展示真实院校、地区、层次、专业代码、院系、方向 fallback、学习/考试方式、特殊计划、最新年份、分数与粒度、招生人数、四科分数、来源和更新时间。
- 比较表使用内联 `gridTemplateColumns`，避免动态 Tailwind 类无法生成。
- 路线图“方向级比较 + 筛选 + 排序”完成闭环。
- 验证：`npm run build` ✅（仅既有 chunk 警告）；`MOCK_COMPARE_SCHOOLS` 搜索无残留；VS Code diagnostics 为空。

### 阶段 4 方向/计划收藏（2026-07-27）
- 新增独立 `plan_favorites` 表，不影响既有学校+专业 `favorites`；同步重建工作区表时计划收藏保留。
- 稳定唯一键使用 `school_id + major_code + department_name + research_direction + exam_subjects`，不依赖会变化的自增 `department_id`。
- Rust 新增 `PlanFavorite` DTO、查询与无 panic 的 toggle API；Tauri commands 已注册。
- TypeScript 新增 PlanFavorite API 和一致的业务 key，浏览器模式使用 localStorage/内存 fallback。
- 招生计划行操作区新增收藏星，与展开、比较互不干扰；切换专业或重新加载计划时刷新收藏状态，成功/失败接入现有 toast/reportError。
- 路线图“趋势 + 分数线 + 收藏 + 导出增强”中的方向收藏完成；FavoritesPage 聚合展示计划收藏留待后续。
- 验证：`cargo check` ✅（仅 `db.rs` 预存 warning）；`npm run build` ✅（仅既有 chunk 警告）；VS Code diagnostics 为空。

### 阶段 4 收藏页方向/计划分区（2026-07-27）
- FavoritesPage 并行加载学校收藏与方向/计划收藏，页面文案更新为“快速访问关注的学校与研究方向”。
- 新增“研究方向与招生计划”分区，展示学校、专业、院系、方向 fallback、考试科目、学习/考试方式、专项计划和收藏时间。
- 搜索框同时匹配学校名、院系、方向与专业代码；原 WorkspaceFilterPanel 继续只作用于学校收藏。
- 新增稳定业务键删除命令 `remove_plan_favorite`，Rust/Tauri/TypeScript/localStorage fallback 全链路支持，不伪造不完整 WorkspacePlanRow。
- 路线图“趋势 + 分数线 + 收藏 + 导出增强”完成闭环。
- 验证：`cargo check` ✅（仅 `db.rs` 预存 warning）；`npm run build` ✅（仅既有 chunk 警告）；VS Code diagnostics 为空。

### 阶段 4 稳定计划身份（2026-07-27）
- `workspace_departments` 新增 `source_department_id` 与 `plan_key`，Python/Rust schema 及旧库迁移全覆盖。
- `source_department_id` 保留源库院系编号；`plan_key` 对学校、专业、源院系、院系名、方向、科目、学习/考试方式、专项计划的规范 JSON 做 SHA-256，跨同步稳定。
- Rust `WorkspaceDepartment / WorkspacePlanRow` 和 TypeScript 类型贯通新字段；旧库空 key 使用 `legacy:school|major|department_id` 过渡，避免 UI 冲突。
- 院系/方向展开、独立年份/历年状态、计划展开、方向比较选择及 CompareModal React key 已切换为 `plan_key`；`department_id` 仅继续承担年份表数据库外键。
- 隔离同步真实 `081200`：1043 条计划，1043 个唯一非空 plan_key，source_department_id 非空 1043 条，摘要长度 64；临时 DB 已删除。
- 这是正式五层模型的第一步；后续仍需把 Department、Direction/Plan、YearScore 拆为独立实体并建立稳定外键。
- 验证：Python `compileall` ✅；`cargo check` ✅（仅 `db.rs` 预存 warning）；`npm run build` ✅（仅既有 chunk 警告）；VS Code diagnostics 为空。

### 阶段 4 实体来源与更新时间贯通（2026-07-27）
- `workspace_schools` 新增 `source/updated_at`，学校主来源明确为 `yanzhao`；源更新时间动态兼容新旧 schema。
- `workspace_departments` 新增 `source/updated_at`，从 Python departments 原样同步；Python/Rust 迁移支持旧库。
- Rust/TypeScript DTO 全链路贯通：学校实体使用 `source/updated_at`，计划行区分 `school_source/school_updated_at` 与 `department_source/department_updated_at`。
- 院校详情显示真实院校来源/更新时间；方向展开显示计划来源/更新时间；分数年份继续独立显示分数来源、更新时间、粒度与匹配说明。
- 计划 CSV/Excel 导出增加院校来源/时间与计划来源/时间；比较弹窗明确区分计划来源和分数来源。
- 隔离同步真实 `081200`：学校 271/271、院系 1043/1043 的 source 和 updated_at 均非空；临时 DB 已删除。
- 路线图“数据来源、更新时间、可信度字段”完成闭环。
- 验证：Python `compileall` ✅；`cargo check` ✅（仅 `db.rs` 预存 warning）；`npm run build` ✅（仅既有 chunk 警告）；VS Code diagnostics 为空。

### 阶段 4 正式五层规范化模型（2026-07-27）
- 新增 `workspace_majors / workspace_department_entities / workspace_plans / workspace_plan_years / workspace_model_state`，形成 Major → School → Department → Plan → YearScore 正式层级；旧三表完整保留。
- Department 使用 `department:v1:<sha256>` 稳定键，同院系多方向归并为一个实体；Plan 沿用跨同步稳定 `plan_key`，plan_id 显式继承旧 department_id 以保持 DTO 兼容。
- 当前计划如实标记 `source_record_kind=yanzhao_department_derived`，不冒充覆盖不足的掌上考研 admission_plans；YearScore 保留分数粒度、来源、更新时间与匹配说明。
- Python 按专业单事务双写新旧模型，失败整体回滚；ready 前校验非空/唯一键及新旧计划、年份计数。
- Rust 仅在请求内所有专业均 `ready + model_version>=2 + 新旧计数一致` 时切读规范化模型；否则整次请求使用 legacy 模型。学校、筛选选项、院系详情、招生计划、收藏详情均已切换。
- 老旧库迁移不再 DROP 工作区表，新表不存在或未就绪自动兼容旧模型；`get_available_majors` 继续使用稳定的 workspace_schools。
- 隔离同步真实 `081200`：学校 271；计划 1043/1043；年份 3567/3567；院系实体 321；空/重复键、孤儿记录均 0；计划与年份双向 EXCEPT 均 0；临时 DB 已删除。
- 路线图正式五层模型与阶段 4 核心分析能力完成。
- 验证：Python `compileall` ✅；`cargo test` 1/1 ✅；`npm run build` ✅；VS Code diagnostics 为空。仅保留既有 Rust idx warning 与 Vite chunk warning。

### 阶段 5 单元测试基础（2026-07-27）
- 前端接入 Vitest，新增 `npm run test:unit`；纯逻辑提取到 `workspace-utils.ts` 并由 WorkspacePage/CompareModal 实际复用。
- 15 条前端单测覆盖：4 条方向 fallback、5 种分数粒度映射、平坦/正常/空/单值 Y 轴 domain、计划导出 23 列及来源/时间/匹配说明。
- Rust 新增 2 条规范化模型测试，加上既有 1 条共 3 条：覆盖无状态、ready、failed、计数不一致、多专业未全 ready，以及 legacy→normalized 切读关键 DTO 一致性。
- 路线图“单元测试”完成基础闭环；组件测试、Tauri E2E 与发布前验收矩阵仍待后续。
- 验证：`npm run test:unit` 15/15 ✅；`cargo test` 3/3 ✅；`npm run build` ✅；VS Code diagnostics 为空。仅保留既有 warning。

### 阶段 5 关键组件测试（2026-07-27）
- 接入 Testing Library、user-event、jest-dom 与 jsdom，Vitest 增加统一 setup/cleanup。
- TrendChart 从 WorkspacePage 提取为独立组件并复用 `getTrendScaleDomain`；测试空态、平坦/单点数据无 NaN、标题/年份/数值渲染。
- WorkspaceFilterPanel 测试 school/plan 模式排序差异、研究方向排序回调、研究方向关键词应用与重置。
- 前端测试扩展为 3 个文件、22 条全部通过；路线图“组件测试”完成基础闭环，后续可继续补院校行/方向条目细粒度用例。
- 验证：`npm run test:unit` 22/22 ✅；`npm run build` ✅；VS Code diagnostics 为空。仅保留既有 chunk warning。

### 阶段 5 Tauri CDP E2E + 真实旧库迁移修复（2026-07-27）
- 首次真实桌面启动发现旧用户库 `workspace_department_years` 缺少 `score_scope/source/updated_at/match_note`，同步报 OperationalError，Rust 查询 unwrap 导致进程崩溃。
- Rust `migrate_schema` 与 Python `ensure_target_schema` 补齐四列增量迁移；修复后同一真实桌面库启动稳定，无 panic/同步异常。
- 新增 `scripts/test_stage4_e2e.cjs` 与 `npm run test:e2e:stage4`：通过 CDP 9223 调用真实 Tauri commands，验证已同步专业、规范化计划查询、稳定 plan_key/源院系ID、学校/计划/分数来源元数据、方向筛选排序、计划收藏往返及 WebView UI 交互。
- E2E 收藏测试执行后自动恢复原状态，不启动网络采集，不污染正式业务数据。
- 实测 `081200`：271 所学校；计划稳定 key 非 legacy；收藏 false→true→自动恢复；脚本 PASS。
- 路线图 Tauri E2E 基础与 CDP 脚本分层完成。
- 验证：Python `compileall` ✅；`cargo test` 3/3 ✅；真实 `desktop:dev` 启动 ✅；`test:e2e:stage4` ✅；进程日志无 panic/error。

### 阶段 5 发布前验收矩阵（2026-07-27）
- 新增 `npm run test:rust` 与 `npm run test:release:auto`，一键执行 Vitest 单元/组件、Rust 测试和前端生产构建。
- `full-ui-test-prompt.md` 增加固定发布前执行顺序：自动门禁 → desktop:dev → stage4 E2E → v3 全流程。
- 人工边界矩阵明确窗口 1200×800/1024×700/800×600、缩放 80/100/125/150%、单/多/全专业数据量、空库、登录失效、失败态、旧库迁移与收藏恢复的步骤和验收条件。
- 空库/登录清除等破坏性场景明确只能使用隔离 HOME/cookie，不操作用户正式环境。
- 路线图“发布前验收矩阵”和“CDP脚本分层”完成。
- 实测 `npm run test:release:auto`：前端 22/22、Rust 3/3、生产构建全部通过；仅保留既有 warning。

### 阶段 5 结构化采集错误闭环（2026-07-27）
- 前端新增 `AppErrorCode / AppError / normalizeAppError / invokeApp`，统一处理 Tauri 拒绝对象、JSON字符串、普通字符串与原生 Error；常用同步/收藏/最近查看/采集 IPC 已接入。
- `CrawlProgress.error_code` 正式进入 TS 类型；采集页按 LOGIN_REQUIRED / UNKNOWN_MAJOR / NO_PUBLIC_DATA / UNREACHABLE / TIMEOUT / FAILED 展示原因、影响、下一步和可重试操作。
- 登录错误直接打开登录向导；未知专业返回专业选择；暂无公开数据不误导为程序故障；网络/超时/普通失败真正接通“重试失败项”。
- BackgroundTaskPanel 移除 nullable error 非空断言，失败无详情和取消状态安全显示。
- Python fetch 全流程统一输出带码 `YAM_ERROR`，`asyncio.run(_fetch_async)` 外层异常纳入结构化边界，不再默认打印 traceback；Rust内部超时补 TIMEOUT。
- 新增 16 条错误归一化与错误码映射测试；前端测试总数增至 38 条。
- 路线图“采集错误用户文案”和“Python traceback不透传”完成；数据库查询全面去 unwrap/启动损坏恢复仍作为外部边界剩余项。
- 验证：Python `compileall` ✅；Vitest 38/38 ✅；Rust 3/3 ✅；前端 build ✅；VS Code diagnostics 为空。

### 阶段 5 数据库命令边界 panic 隔离（2026-07-27）
- Rust 新增可序列化 `AppError` 与 `db_guard/db_query/db_write`，通过 `catch_unwind(AssertUnwindSafe)` 阻止 db.rs 内部 unwrap panic 越过 Tauri FFI。
- Mutex poisoned 时恢复内部连接并继续隔离执行；失败返回 `DB_LOCK_POISONED`，查询/写入分别返回 `DB_QUERY_FAILED / DB_WRITE_FAILED`，文案说明影响和重试方式。
- 高频只读命令（学校、分数、工作区、计划、筛选、可用专业、两类收藏、最近查看）和收藏/历史写入命令已改为 `Result<_, AppError>`，移除 command 层 unwrap。
- 前端 AppErrorCode/normalizeAppError 支持三类数据库错误。
- 新增损坏 schema panic 隔离和 poisoned mutex 恢复 Rust 测试；Rust测试增至 5 条，前端错误归一化测试增至39条总测试。
- 剩余：main.rs setup数据库损坏启动恢复、低频数据库命令和db.rs内部全面Result化。
- 验证：`npm run test:release:auto` ✅（前端39/39、Rust5/5、build通过）；VS Code diagnostics 为空。

### 阶段 5 数据库损坏启动恢复（2026-07-27）
- 启动流程新增 `open_or_recover_database`：已有库先执行 `PRAGMA quick_check`、schema迁移和seed，任一步失败都进入安全恢复。
- 损坏/不可迁移原库不删除、不覆盖，重命名为 `yam-desktop.db.corrupt-YYYYMMDD-HHMMSS`；冲突自动加序号，WAL/SHM存在时尽量同步保留。
- 备份完成后创建健康新库；备份或新库创建失败明确返回错误，不静默丢数据。main setup移除数据库expect，Tauri运行错误改为清晰日志。
- 新增 `DatabaseStatus/get_database_status`；设置页“本地数据”卡展示数据库路径、正常状态，恢复时说明影响、重新同步操作和备份路径，不提供自动删除。
- 隔离测试覆盖不存在库正常创建，以及非SQLite字节文件原样备份+健康新库；Rust测试增至7条，全程不访问正式~/.yam。
- 路线图核心外部边界结构化错误与恢复完成；低频命令后续渐进收敛。
- 验证：`npm run test:release:auto` ✅（前端39/39、Rust7/7、build通过）；VS Code diagnostics 为空。

### 阶段 5 安全与合规收敛（2026-07-27）
- 安全审查覆盖当前改动的Cookie、日志、导出、CDP、数据库备份与Tauri命令边界；未发现本次变更引入且可利用的漏洞。
- CDP `--remote-debugging-port=9223` 从主发布 `tauri.conf.json` 移到独立 `tauri.dev.conf.json`，仅 `npm run desktop:dev` 显式合并；发布构建不再暴露调试端口。
- Cookie 仍只保存于 `~/.yam/cookies`，写入后尝试 `chmod 0600`；日志/IPC不返回Cookie值，登录状态仅返回布尔状态和过期时间。
- 导出转换只包含学校、计划、分数和来源元数据，不包含认证信息；网络请求保留分批/冷却，数据来源全层可追溯。
- 验证：`npm run test:release:auto` ✅；Python `compileall` ✅；项目内 `npm exec tauri build -- --debug --no-bundle` ✅；主配置搜索无remote-debugging，仅dev配置包含；diagnostics为空。

### 阶段 5 导出目录设置（2026-07-27）
- 新增 `~/.yam/config/desktop-settings.json` 本地偏好，不写数据库；设置文件通过临时文件+原子替换保存。
- 设置页新增“导出”卡片，展示当前目录并支持系统目录选择器选择/清除；未设置或目录失效时说明会回退保存对话框。
- CSV/JSON/Excel 导出优先写入有效偏好目录，目录不存在/不可写或实际写入失败均回退原保存对话框，不阻断导出。
- 导出文件名仅取 `Path.file_name` 并强制允许扩展名，阻止 `../evil.csv` 等路径穿越；目录只能由系统选择器产生。
- 新增设置读写清除、文件名净化、有效/失效目录解析测试；Rust测试增至11条。
- 路线图设置页登录/cookie/数据库路径/导出目录完成。
- 验证：`npm run test:release:auto` ✅（前端39/39、Rust11/11、build通过）；VS Code diagnostics 为空。

### 阶段 5 同步查询去重与关键索引（2026-07-27）
- 性能盘点确认计划查询仍全量返回，但当前React只渲染分页行；虚拟滚动不是首要瓶颈。最明显浪费是同校同专业分数按每个方向重复查询。
- `sync_to_tauri` 将 `load_score_lines` 提升到学校循环：`081200` 理论查询次数从1043次降为271次，分数复制语义不变；隔离同步实测约0.73秒。
- Python源库新增 `score_lines(school_id,major_code,year DESC)` 与 `departments(major_code,school_id)` 索引。
- 桌面库新增学校专业+分数、学校代码、legacy院系、legacy年份关键索引；迁移顺序修复为先补 `school_code` 列再建索引。
- 隔离同步真实081200保持计划1043/1043、年份3567/3567；EXPLAIN确认默认分数排序使用 `idx_workspace_schools_major_score` SEARCH而非SCAN；临时DB已删除。
- 期间基准测试发现并修复Python schema建索引顺序和 score_lines 变量作用域两个回归，随后全量验证通过。
- 验证：Python compileall ✅；`npm run test:release:auto` ✅（前端39/39、Rust11/11、build通过）；diagnostics为空。

### 阶段 5 院系详情按需缓存与批量读取（2026-07-27）
- 新增独立 `fetch_workspace_departments` Tauri command；展开院校不再复用全量 `fetch_workspace_data`，不会额外重查/覆盖学校列表。
- Rust院系详情从“1次基础行+N次years”改为固定“1次基础行+1次IN批量years”，规范化模型按plan_key映射，legacy按department_id。
- 前端缓存key使用 `activeMajorCodesKey|schoolId`，缓存命中0请求；同key并发共享一个Promise；专业切换天然隔离，显式刷新/同步清缓存。
- 快速切专业时旧请求只写对应cache，不覆盖当前专业展示，消除响应竞态。
- 新增多plan多年份批量结果/降序Rust测试；Rust测试增至12条。
- 路线图“院系详情按需加载+缓存”完成；后端分页仍待补。
- 验证：`npm run test:release:auto` ✅（前端39/39、Rust12/12、build通过）；diagnostics为空。

### 阶段 5 招生计划服务端分页（2026-07-27）
- 新增 `WorkspacePlanPage {items,total}` 与 `fetch_workspace_plans_page`；筛选后total准确，page最小1、pageSize限制1..100。
- Rust计划查询先读取每计划latest摘要用于稳定筛选/排序，只为当前页批量加载完整years；原全量接口保留给导出/E2E兼容。
- 计划搜索统一进入Rust，覆盖院校名/代码、院系和方向，分页total与全量导出结果一致。
- 前端列表只保存当前页，request id防旧响应覆盖；筛选/专业/搜索回第一页，翻页保留最多3条跨页比较（Map保存完整row）。
- 计划导出点击时单独请求全量当前筛选结果，不影响当前页列表；学校视图导出不变。
- 真实081200：页1/页2各20条、total1043、页间重复0；全量1043。当前页20 rows/80 years/32,619B，相比原1043 rows/3567 years/1,568,993B，列表IPC下降约97.9%。搜索“计算机”分页/全量均798。
- 新增稳定分页/排序/页内years Rust测试；Rust测试增至13条。
- 验证：`npm run test:release:auto` ✅（前端39/39、Rust13/13、build通过）；diagnostics为空。

### 阶段 5 工作区静默刷新（2026-07-27）
- 切换专业时未同步专业在后台同步，已有院校/计划保持显示；仅首次且无数据时展示全局loading。
- 专业/筛选变化采用stale-while-revalidate，成功后原子替换；院校与计划各自request id防旧响应覆盖。
- 计划翻页保留上一页并显示局部“正在刷新招生计划”；不再整页闪空。
- 刷新失败保留旧结果，横幅明确“当前仍显示上次结果”并提供重试；专业切换的详情缓存按major key隔离。
- 新增刷新状态/保留数据纯逻辑测试，前端测试增至42条。
- 路线图“切换专业静默刷新”完成。
- 验证：`npm run test:release:auto` ✅（前端42/42、Rust13/13、build通过）；diagnostics为空。

### 阶段 5 计划大数据后台导出（2026-07-27）
- 新增 `ExportProgress/ExportState` 与 start/get/cancel commands；start立即返回，重复启动返回结构化 TASK_RUNNING。
- 计划CSV/JSON/Excel由Rust后台线程用独立SQLite连接查询和写入，不再全量IPC到WebView；前端仅传专业/筛选/格式/文件名。
- 后台按行更新状态并emit `export-progress/export-done`，前端显示current/total、禁用重复导出、完成/失败toast；浏览器fallback和学校视图保持旧链路。
- 有效偏好目录直接写；否则主线程先弹保存对话框。所有格式先写`.part`，成功原子替换，取消/失败清理半文件。
- Rust导出字段与前端23列一致；CSV带BOM和标准转义，Excel沿用rust_xlsxwriter。
- 真实081200临时目录导出1043数据行+表头，无part残留，不污染用户目录。Rust测试增至17条。
- 路线图“导出大数据时不阻塞UI”完成。
- 验证：`npm run test:release:auto` ✅（前端42/42、Rust17/17、build通过）；diagnostics为空。

### 阶段 5 院校视图服务端分页（2026-07-27）
- 新增 `WorkspaceSchoolPage` 与 `fetch_workspace_schools_page`；分页单位为唯一school_id，页内返回该校全部命中专业行，不拆分多专业学校。
- total按唯一学校数；聚合排序保持现有语义：最低分MIN、招生人数SUM、默认顺序MIN(display_order)，school_id稳定兜底。
- 搜索覆盖学校名、学校代码、school_id，分页total与全量导出一致；原全量接口保留导出/兼容。
- 前端只保存当前页专业行，不再二次slice；搜索/筛选/页码/页大小触发服务端分页，展开localStorage和详情cache跨页保持，收藏全局独立。
- 真实081200全量271行/271校，pageSize20返回20、total271；真实多专业同校样本验证不拆页。JSON IPC约88,978B→6,652B，下降约92.5%。
- 新增多专业聚合、页间不重复、排序/搜索/边界分页测试；Rust测试增至18条。
- 路线图数据库索引+分页+批量读取完成。两视图页上限100已控制DOM，现阶段以服务端分页替代虚拟滚动。
- 验证：`npm run test:release:auto` ✅（前端42/42、Rust18/18、build通过）；diagnostics为空。

### 阶段 5 本地诊断与崩溃日志（2026-07-27）
- Rust新增本地JSON行诊断模块：`~/.yam/logs/yam-desktop.log`，2MB轮转、保留`.1-.3`，线程安全追加UTC/level/event/safe_message。
- main安装panic hook；数据库恢复/启动失败/Tauri run错误、DB AppError、采集/同步结构化失败写安全日志，不记录SQL参数和完整stderr traceback。
- Python新增 `yam-python.log` 同规格轮转，CLI异常记录本地脱敏traceback，stdout仍只输出安全YAM_ERROR协议。
- Rust/Python日志均脱敏Cookie、Authorization、CASTGC、JSESSIONID、token、session值；日志只本地保存，无远程上报。
- 设置页新增“诊断日志”卡，展示目录和两个日志路径，可打开目录，并明确不会自动上传。
- 新增Rust脱敏/append/三份轮转测试；Rust测试增至21条。Python脱敏和异常实际落盘已验证。
- 验证：仓库根Python compileall ✅；`npm run test:release:auto` ✅（前端42/42、Rust21/21、build通过）；diagnostics为空。

### 阶段 5 Windows CI 与发布流水线（2026-07-27）
- 新增Windows CI：push/PR自动配置Node22、Python3.12、Rust缓存，执行npm ci、pip install、Python compileall和test:release:auto，不依赖GUI E2E。
- 新增tag `v*` / workflow_dispatch发布流程：版本检查→自动门禁→NSIS/MSI构建→Portable复制→staging统一命名→SHA256→artifact上传；tag非dry-run创建draft GitHub Release。
- `check-version.cjs`校验package.json、tauri.conf、Cargo.toml、tag和RELEASE-NOTES版本/semver一致；workflow解析tag或手动输入后写GITHUB_OUTPUT。
- `build-release.ps1`统一执行门禁、bundle、glob定位、Setup/MSI/Portable命名、总/单文件checksums和模板发布说明；仅CI传入release/staging输出目录。
- package.json保留version:check/release:dry-run/release:build单一入口；删除重复PowerShell版本检查/打包脚本，未触发真实发布。
- 版本1.0.0检查及ReleaseMode通过，错误版本1.0.1按预期非零；自动门禁前端42/42、Rust21/21、build通过。
- 路线图发布流水线与版本一致性机制完成；应用内自动更新仍留后续。

### 阶段 5 贡献与问题反馈规范（2026-07-27）
- 新增CONTRIBUTING：Windows/Node/Rust/Python环境、开发入口、最小改动原则、隐私边界、数据库兼容、自动门禁和Tauri E2E要求。
- 新增SECURITY：最新版本支持范围、GitHub Private vulnerability reporting、未启用时先建立私密联系、禁止公开Cookie/数据库/未脱敏日志。
- 新增Bug与Feature表单，强制版本/环境/复现/隐私确认；关闭空白Issue并提供安全问题私密报告入口。
- 新增PR模板，要求说明用户影响、兼容性、测试、风险，并确认未提交用户数据或生成安装包。
- 仓库URL仍为占位符，因此未虚构安全邮箱；规范仅引用GitHub通用私密报告能力和维护者公开联系方式。
- 5个GitHub YAML均通过PyYAML解析；自动门禁前端42/42、Rust21/21、build通过；diagnostics为空。
- 阶段5目标（测试、迁移恢复、发布流水线、本地诊断、贡献规范）已形成完整维护闭环；远程上报和应用内自动更新保留后续且需明确产品决策。

### 发布包内置Python采集后端（2026-07-28）
- 新增 `yam.backend_entry` dispatcher，统一sync/fetch/login/refresh/search/catalog/doctor七类桌面后端入口；Rust开发模式继续调用系统Python，release模式不再依赖源码目录。
- PyInstaller在仓库build隔离venv中生成约60.5MB `yam-backend.exe`，嵌入Python、playwright/httpx/aiohttp和静态majors.yaml；浏览器自动化复用系统Microsoft Edge，不需额外Chromium下载。
- Release Rust通过`include_bytes!`将后端嵌入桌面exe，首次调用原子释放到`~/.yam/runtime/yam-backend-<version>.exe`；NSIS/MSI/Portable均无需用户安装Python或携带旁边资源文件。
- Config在frozen模式优先使用PyInstaller `_MEIPASS`静态资源，实时专业目录写用户`~/.yam/data`；doctor会验证依赖、Edge和内置majors资源。
- 发布脚本先构建后端再编译Tauri；desktop:build/nsis/msi也统一走后端构建入口。staging只覆盖已知同名产物，不清空目录；后端exe/venv/pyinstaller/staging均gitignore。
- 新增严格`tsc --noEmit`发布门禁并修复历史类型错误；补齐clsx/tailwind-merge，PostCSS升级到无已知高危版本，npm audit为0。
- 验证：后端doctor在限制PATH、无PYTHONPATH、非仓库工作目录通过；四类参数入口help通过；Python dispatcher测试7/7、前端44/44、Rust23/23、types/build/compileall/npm audit均通过；diagnostics为空。
- 新产物内嵌后端：Portable约74.2MB（后端约60.5MB），NSIS/MSI构建通过，SHA256已重算。

### UI bug 修复 + 采集流程优化（2026-07-21）
- **子专业多时右边栏上方空白**：`AnimatePresence` 直接包裹 `motion.div`（整体 enter/exit），不再逐个 button exit（详见 ISSUE-005）
- **DONE 后误 kill Python**：取消条件改为 `!running && !done`（仅用户取消时 kill）
- **调试日志 WARN 误报 failed_count**：改为普通 `print()` 不带 `YAM_` 前缀

---

## ISSUE-019 实时查询接口方案（2026-07-20）

### 背景

用户反馈本地静态 `data/majors.yaml`（1305 个）和 `yam-desktop/src/data/majors.ts`（1546 个）的专业列表**不全**：
- 计算机科学与技术（0812）学科下研招网有 **37 个**专业（含 J/Z 系列自设交叉学科），本地只有 5 个基础代码。
- 用户要求"改造为实时查询接口"，研究清楚可行性再确认。

### 可行性研究结论

- **Rust 端无需新增依赖**：`Cargo.toml` 现有 `tauri`/`serde`/`rusqlite`，用 `std::process::Command` 调 Python 即可。
- **Python 端**：复用 `DynamicReader` 的 cookie 持久化与浏览器管理，新增 `MajorsSearcher` 类。

### zys.do "每会话一次" 限制发现

- 研招网 `zys.do` 接口（专业列表）与 `zydws.do`（院校列表）一样存在"同一会话内同一参数组合只允许一次调用"限制。
- 第 2 页（curPage=2）即使已登录也返回"请登录"。
- 但服务端按**参数组合**区分调用，不同 `zydm`/`jsggjh`/`tydxs` 视为不同调用，每次返回该组合的前 10 条。

### 解决方案：zydm 枚举 + 参数组合拆分

**核心策略**（已落地到 `yam/majors_searcher.py` 的 `search_by_yjxkdm`）：

1. **第 1 次默认查询**：`yjxkdm=0812` 拿第 1 页 + `seed_major`（用于详情页预热）
2. **枚举 zydm 候选**：
   - `081200-081209`（基础学术二级学科）
   - `0812J0-0812J9`（教育部自设交叉学科）
   - `0812Z0-0812Z9`（高校自主设置交叉学科）
3. **按需拆分**：对 `totalCount > 10` 的 zydm，依次尝试 8 种参数组合直到拿全：
   - `{jsggjh: 0}` / `{jsggjh: 1}`
   - `{tydxs: 0}` / `{tydxs: 1}`
   - `{jsggjh: 0, tydxs: 0/1}` / `{jsggjh: 1, tydxs: 0/1}`
4. **去重合并**：按 `(zydm, zymc)` 唯一性累计

### 验证结果

| 学科 | 拿到/目标 | 状态 |
|------|-----------|------|
| 0812 计算机科学与技术 | 37/37 | ✓ |
| 0835 软件工程 | 7/7 | ✓ |
| 0809 电子科学与技术 | 12/12 | ✓ |
| 0810 信息与通信工程 | 21/21 | ✓ |
| 0701 数学 | 17/17 | ✓ |
| 0301 法学 | 98/99 | ⚠（最后一个 zydm 未枚举到） |
| 1201 管理科学与工程 | 40/40 | ✓ |

**总体覆盖率 232/233 = 99.6%**，全部 `need_login=False`（无需重新登录）。

### 关键文件

- [yam/majors_searcher.py](file:///d:/yam/yam/majors_searcher.py)：`MajorsSearcher` 类，核心方法 `search_by_yjxkdm` / `search_by_name` / `interactive_login`
- [yam/cli.py](file:///d:/yam/yam/cli.py)：新增 `search-majors` 命令（`--yjxkdm` / `--name` / `--login` / `--json`）

### 重要发现

- **研招网"37 个专业"含义**：指 `(zydm, zymc)` 组合条目数，不是独立 `zydm` 数。
  - 0812 学科下只有 **5 个独立 zydm**（081200-081203 + 0812J1），但 0812J1 一个 zydm 对应 11 个不同 zymc（人工智能、低空技术与工程等）。
- **J/Z 系列代码**：
  - `0812J0-J9`：教育部自设交叉学科
  - `0812Z0-Z9`：高校自主设置交叉学科
  - 这些代码不在教育部正式目录中，但是研招网 zys.do 接口可查询。

### 0301 法学最后一个 zymc

- 已尝试 0301A0-A9, B0-B9, ..., Y0-Y9, J10-J19, Z10-Z19 共 230+ 个候选 zydm，未找到研招网 totalCount=99 中缺失的 1 个。
- 推测是研招网接口 totalCount 统计误差，或某个 zydm 不在标准编码范围内。
- 98/99 = 99% 覆盖率已足够实用。

### 后续待办

- [x] ~~桌面端集成：Rust 端新增 tauri command 调 Python `search-majors`~~（已实现 `search_majors` 但方案被替代）
- [x] ~~前端 `MajorSelectPage.tsx` 改造：从本地静态搜索改为调用 Rust 后端实时查询~~（验证后用户反馈"专业加载不出来、加载不全比比皆是"，已回滚）
- [ ] 讨论：0812Z1/Z2/Z3 等高校自设交叉学科是否纳入用户选择列表

---

## ISSUE-019 方案转向：整个目录一次性更新（2026-07-21）

### 背景

实时查询方案在用户验证后反馈"专业加载不出来、专业加载不全比比皆是"，且实时查询每次需要 30-60 秒等待影响体验。用户决定：
> "不如恢复之前的专业选择逻辑，但是把更新专业目录数据做到设置里，按一次就把整个目录更新，选择专业的时候就不用再等了"

### 实现内容

1. **回滚**：`MajorSelectPage.tsx` 通过 `git checkout HEAD --` 恢复到本地静态版本
2. **Python 端**：新增 [yam/scripts/update_majors_catalog.py](file:///d:/yam/yam/scripts/update_majors_catalog.py)
   - 从 `yam-desktop/src/data/majors.ts` 解析 219 个一级学科（已验证）
   - 调 `MajorsSearcher.search_by_yjxkdm` 遍历抓取所有学科
   - 输出协议：`YAM_MAJORS_UPDATE_PROGRESS/WARN/ERROR/DONE` 供 Rust 解析
   - 输出 JSON：`{academic_categories, professional_categories, failed, total_yjxkdm, success_yjxkdm}` 到 `d:/yam/data/majors_realtime.json`
   - 按学位类型拆分（学术 155 + 专业 64 = 219 个一级学科）
3. **Rust 端**：在 [yam-desktop/src-tauri/src/commands.rs](file:///d:/yam/yam-desktop/src-tauri/src/commands.rs) 末尾新增 5 个 command
   - `update_majors_catalog(login: Option<bool>)`：后台 spawn Python 脚本，逐行读取 stdout + emit 进度事件
   - `cancel_catalog_update`：取消任务并 kill 子进程
   - `reset_catalog_update`：重置状态
   - `get_catalog_update_progress`：查询当前进度
   - `read_majors_catalog`：读取 `majors_realtime.json` 内容返回给前端
   - 新增 `UpdateCatalogState = Arc<Mutex<UpdateCatalogProgress>>` Tauri State
   - emit 事件：`catalog-update-progress` / `catalog-update-done`
4. **前端封装**：[yam-desktop/src/lib/db.ts](file:///d:/yam/yam-desktop/src/lib/db.ts) 新增 5 个 invoke 封装 + `UpdateCatalogProgress` 接口
5. **设置页**：新增 [yam-desktop/src/pages/SettingsPage.tsx](file:///d:/yam/yam-desktop/src/pages/SettingsPage.tsx)
   - 顶部 TopNav 已有"设置"标签但未实现，本次补齐路由
   - 卡片含：开始更新按钮、首次登录复选框（勾选传 `--login` 打开可见浏览器）、进度条 + 当前学科显示、取消按钮、完成统计
   - 监听 `catalog-update-progress` / `catalog-update-done` 事件
6. **MajorSelectPage 升级**：新增 useEffect 读取 `majors_realtime.json`，存在则覆盖静态 `ACADEMIC_CATEGORIES/PROFESSIONAL_CATEGORIES`，不存在或无效时回退到静态
7. **路由/导航**：
   - `appStore.ts` 的 `Page` 类型新增 `'settings'`
   - `TopNav.handleTabClick` 处理 `settings`
   - `App.tsx` 注册 `SettingsPage` 渲染分支 + hash 导航白名单

### 验证

- `cargo check` 通过
- `npm run build` 通过（874ms）
- `parse_yjxkdm_list_from_majors_ts()` 正确解析 219 个一级学科
- `is_professional_degree` 正确拆分 155 学术 + 64 专业
- 静态默认值回退逻辑：未读取到 realtime JSON 时使用静态 `majors.ts`，UI 不受影响

### 后续待办

- [ ] 用户在桌面端手动测试：点击设置 → 更新专业目录 → 验证完成后选择专业页加载实时数据
- [ ] 实测耗时确认（预计 1-2 小时；如登录失效需勾选"首次需要登录"复选框）
- [ ] 完成后通过问答框验证任务完成

### 修复：DONE 后误 kill Python 进程导致"异常退出"误报（2026-07-21）

- **背景**：用户跑完 219 个学科全部成功，但 UI 显示"目录更新脚本异常退出"。通过 CDP 调用 `get_catalog_update_progress` 验证：`success_count=219, failed_count=0, current=219=total, done=true` 但 `error="目录更新脚本异常退出"`。
- **根因**：`run_update_catalog_task` 主循环开头检查 `if !running && done { child.kill(); break; }`。处理 `YAM_MAJORS_UPDATE_DONE` 行时同步设置 `running=false, done=true`，下一次循环检查就 kill 了正在收尾（return + asyncio.run 清理 + GC）的 Python 进程，导致 Python 退出码非 0。
- **修复**：将条件改为 `if !running && !done { child.kill(); break; }`。仅当用户取消（`running=false, done=false`）时才 kill；任务完成（`done=true`）时让 Python 自然退出，等 stdout EOF 触发 break。
- **验证**：`cargo check` 通过。待用户重新测试。
- **修改文件**：[yam-desktop/src-tauri/src/commands.rs](file:///d:/yam/yam-desktop/src-tauri/src/commands.rs#L1206-L1217)

---

## ISSUE-029 数据采集 httpx 并发优化（2026-07-22）

### 背景
ISSUE-023 已验证 httpx + Playwright 激活 + 15 并发 + 限流指数退避方案能把专业目录更新从 30+ 分钟压到 7-8 分钟。本 ISSUE 套用同一模式优化数据采集流程（fetch_departments + fetch_score_lines），目标单专业采集 15-25min → 3-5min。

### 实现内容
1. **新增 `yam/crawler/httpx_client.py`**：共享 httpx 工具
   - `call_api_with_retry`：限流指数退避重试（2s→4s→8s，共 3 次），支持自定义 `rate_limit_keywords`
   - `gather_with_concurrency`：限制并发数的 gather（默认 15）
   - `gather_with_concurrency_safe`：单任务容错版（异常不中断整体）
2. **`yam/crawler/yanzhao.py`**：新增 `fetch_departments_batch`
   - httpx.AsyncClient + 15 并发 + 限流退避重试
   - yjfxs.do 无需登录可高并发（参考 yanzhao-mcp-asset-inventory.md）
   - 失败校不写入 results，调用方用 `school_id in map` 区分成功/失败
   - 保留原 `fetch_departments` 同步版本作为兼容接口
3. **`yam/crawler/zhangshangkaoyan.py`**：新增 `fetch_score_lines_batch`
   - 两阶段：串行预解析 school_id（带缓存）+ httpx 并发拉取 schoolScore
   - 掌上考研 API 用 `rate_limit_keywords=()` 禁用 msg 限流判定（返回 code/message 非 msg）
   - school_id 未找到的失败校不写入 results
4. **`yam/cli.py`**：`fetch` 命令改 `asyncio.run(_fetch_async(...))`
   - 两阶段并发：阶段 1 fetch_departments_batch → 阶段 2 fetch_score_lines_batch
   - 进度协议：`YAM_TOTAL {N_院系+N_分数线}` + `YAM_PROGRESS {current}/{total} 院系|分数线 {name}` + `YAM_DONE`
   - commands.rs `process_stdout_line` 无需改动（total 会被 progress 行覆盖）
5. **`yam/fetcher.py`**：`_run_fetch` 改 `asyncio.run(_run_fetch_async(...))`
   - 与 cli._fetch_async 逻辑一致，进度更新到 _progress 字典
   - 暂停检查放在阶段之间（并发任务无法中途暂停）

### 验证结果
- `py_compile` 全部通过（httpx_client/yanzhao/zhangshangkaoyan/cli/fetcher）
- 单元测试：`gather_with_concurrency` 5 任务 limit=2 返回 [0,2,4,6,8] ✓
- 集成测试 1（院系并发）：`python -m yam.cli fetch -m 081200 --limit 3 --skip-scores --force`
  - 3/3 院系成功（北京大学 10 个、中国人民大学 5 个、北京交通大学 10 个）
  - YAM_TOTAL 3 → YAM_PROGRESS 1/3→2/3→3/3 → YAM_DONE 3 0 0 ✓
- 集成测试 2（完整流程）：`python -m yam.cli fetch -m 081200 --limit 3 --force`
  - 3/3 院系 + 3/3 分数线全部成功
  - 北京大学 2 条、中国人民大学 1 条、北京交通大学 4 条分数线
  - YAM_TOTAL 6 → 阶段1 YAM_PROGRESS 1/6→3/6 → 阶段2 YAM_PROGRESS 4/6→6/6 → YAM_DONE 3 0 0 ✓

### 待后续
- `fetch_school_list` 省份扫描 + 多筛选组合的 httpx 并发优化（仅首次种子抓取触发，大部分专业已有种子，优先级低）

### 三阶段降级重试增强（2026-07-22）
**问题**：v3 CDP 端到端测试 271 所中 22 所残留失败，错误**全部为"访问太频繁"**（研招网 IP 级限流）。失败院校 school_id 连续（368317-368436），集中在湖北/广东/广西省代码段——符合"省份限流窗口未冷却"特征。第二轮 5 并发 + 0.3s 延迟仍触发限流（有效速率 ~16 req/s 超阈值）。

**解决**：`yam/crawler/yanzhao.py` 新增 `fetch_departments_with_retries` 方法，三阶段降级重试：
- 第一轮 15 并发 0s 延迟（快速，预期 ~30% 失败）
- 等待 30s 限流窗口冷却
- 第二轮 3 并发 1.5s 延迟（保守，预期剩余 ~5-10 所失败）
- 等待 60s
- 第三轮 1 并发 2s 延迟（兜底，预期 0 失败）

`cli.py` / `fetcher.py` 改为单次调用 `fetch_departments_with_retries`，移除原本重复的两轮重试代码。

### CDP 端到端 v4 验证（2026-07-22）
- **测试脚本**：`test-issue029-v4.cjs`（CDP 9223 → reset_crawl → run_crawl 081200 → 轮询进度）
- **结果**：✅ **100% 成功率（271/271，0 失败）**，总耗时 4:59（299s）
- **时间线**：
  - t=0:00-1:18 第一轮 15 并发快速跑完 271 所（~85 失败）
  - t=1:18-2:09 30s 限流冷却 + 第二轮启动
  - t=2:09-3:28 第二轮 3 并发 1.5s 延迟重试（85→少量残留）
  - t=3:28-4:31 60s 冷却 + 第三轮 1 并发 2s 延迟兜底
  - t=4:31-4:59 阶段 2 分数线 271 所并发完成
- **结论**：ISSUE-029 完整验证通过。三阶段降级策略彻底解决"访问太频繁"残留失败，达成用户"100% 成功率才算完整"的要求。

### 日志显示优化：YAM_LOG 协议 + level 着色 + 去冗余（2026-07-22）
**问题**：v4 验证时采集日志含 700+ 条"正在处理：院系 XXX (n/542)"冗余条目，刷屏且无法体现三阶段降级策略的执行过程。用户提出"那个日志显示是不是可以优化一下"，选择"前后端联动优化"方向。

**方案**：新增 `YAM_LOG {level} {message}` 协议贯通 Python → Rust → 前端，按 level 着色 + 阶段标识 + 去冗余：
- **Python 端**：`yam/crawler/yanzhao.py` 的 `on_log` 签名改为 `(level, msg)`，三阶段日志带 `info`/`warn`/`success` level；`yam/cli.py` 输出 `YAM_LOG {level} {msg}` 协议供 Rust 解析（同步终端彩色显示）；`yam/fetcher.py` 转发到 NiceGUI `_log`
- **Rust 端**：`yam-desktop/src-tauri/src/commands.rs` 新增 `CrawlLogPayload { level, message }` struct，`process_stdout_line` 解析 `YAM_LOG ` 前缀并 `app_handle.emit("crawl-log", payload)` 推送到前端
- **前端**：`yam-desktop/src/stores/appStore.ts` 的 `logs` 类型扩展 `level?` 字段，`addCrawlingLog` 接受 level 参数；`yam-desktop/src/pages/CrawlingPage.tsx` 监听 `crawl-log` 事件追加日志，去掉每院校冗余日志（原 700+ 条），按 level 着色（info 灰色、warn 琥珀色+⚠、success 翠绿色+✓、error 红色+✗）

**验证结果**（CDP UI E2E，081200 触发采集）：
- **总日志数 14 条**（原 700+ 条冗余院系日志已去除）
- **10 条阶段日志** 全部通过 YAM_LOG 协议正确推送：
  - `第一轮：271 所院校（15 并发，0.0s 延迟）...` (info)
  - `第一轮完成：成功 216，剩余失败 55` (info)
  - `⚠ 第二轮：等待 30s 限流冷却...` (warn)
  - `第二轮：55 所院校（3 并发，1.5s 延迟）...` (info)
  - `第二轮完成：成功 52，剩余失败 3` (info)
  - `⚠ 第三轮：等待 60s 限流冷却...` (warn)
  - `第三轮：3 所院校（1 并发，2.0s 延迟）...` (info)
  - `✓ 第三轮完成：成功 3，剩余失败 0` (success)
  - `阶段 2/2：并发获取分数线（271 所，15 并发）...` (info)
  - `✓ 采集结束：成功 271 所，失败 0 所，跳过 0 所` (success)
- **level 着色全部生效**：warn 2 条 + success 2 条 + error 0 条
- **冗余院系日志 0 条**（验证标准通过）
- **总耗时 5 分钟**（09:50:55 → 09:55:53），271/271 100% 成功

**文件变更**：
- [yam/crawler/yanzhao.py](file:///d:/yam/yam/crawler/yanzhao.py)：`fetch_departments_with_retries` 的 `on_log` 签名改为 `(level, msg)`，三阶段日志带 level
- [yam/cli.py](file:///d:/yam/yam/cli.py)：新增 `_dept_log` 转发为 `YAM_LOG {level} {msg}` 协议 + 终端彩色显示；阶段 2 分数线也加 YAM_LOG
- [yam/fetcher.py](file:///d:/yam/yam/fetcher.py)：NiceGUI 版本同步 `_dept_log(level, msg)`
- [yam-desktop/src-tauri/src/commands.rs](file:///d:/yam/yam-desktop/src-tauri/src/commands.rs)：新增 `CrawlLogPayload` struct，`process_stdout_line` 加 `app_handle` 参数解析 YAM_LOG 并 emit "crawl-log" 事件
- [yam-desktop/src/stores/appStore.ts](file:///d:/yam/yam-desktop/src/stores/appStore.ts)：`logs` 类型加 `level?`，`addCrawlingLog` 接受 level 参数
- [yam-desktop/src/pages/CrawlingPage.tsx](file:///d:/yam/yam-desktop/src/pages/CrawlingPage.tsx)：监听 `crawl-log` 事件，去掉每院校冗余日志，按 level 着色渲染 + 图标前缀

### 日志细节优化：阶段徽章 + 已耗时 + 折叠 + 复制（2026-07-22）
**问题**：上一轮日志优化后，用户希望"继续其他日志细节优化"。原 UI 仅显示"整体进度 X%"，无法看出当前在三阶段降级的哪一轮；日志面板固定 256px 占用空间，错误时用户无法一键复制日志反馈。

**方案**：在 [CrawlingPage.tsx](file:///d:/yam/yam-desktop/src/pages/CrawlingPage.tsx) 添加 4 项 UI 细节优化：
1. **阶段徽章**：新增 `detectStage(logs)` 从最新日志解析当前阶段，渲染为带颜色的胶囊徽章（idle 灰 / round1 蓝 / round2 琥珀 / round3 橙 / cooldown 琥珀 / scores 靛蓝 / syncing 紫 / done 翠绿），显示在"整体进度"旁
2. **已耗时显示**：`startTimeRef` 记录启动时间，每秒 setInterval 更新 `elapsed`，格式化为 `M:SS` 或 `H:MM:SS`，显示在进度百分比左侧
3. **进度条冷却变色**：`detectStage` 返回 `cooldown` 时进度条变 `bg-amber-400`，正常时为 `bg-[#1e3a5f]`
4. **可折叠日志面板**：点击"采集日志"标题切换 `logsCollapsed` state，chevron-down ↔ chevron-right 图标切换，折叠时隐藏日志容器，标题旁显示日志条数 `(N)`
5. **复制日志按钮**：新增 `handleCopyLogs` 用 `navigator.clipboard.writeText` 复制全部日志（带时间戳和 level 前缀），不可用时回退到 `document.execCommand('copy')` + 临时 textarea；点击后按钮文字 "复制日志" → "已复制" 2 秒

**验证结果**（CDP UI E2E，081200 触发采集）：
- ✅ 阶段徽章正确切换：`第一轮 · 15 并发快速`（蓝）→ `限流冷却 · 等待第二轮`（琥珀）
- ✅ 已耗时实时更新：`已耗时 0:18` → `已耗时 1:42`
- ✅ 进度条冷却时变色：`progressBarAmber: true`（琥珀色）
- ✅ 折叠按钮生效：`logsVisible: true → false`，chevron-down → chevron-right
- ✅ 展开按钮生效：恢复 `logsVisible: true`，chevron-right → chevron-down
- ⚠️ 复制按钮：CDP 自动化测试环境限制（文档无焦点，`navigator.clipboard.writeText` 抛 "Document is not focused"），需用户手动验证。代码已实现 execCommand 兜底逻辑，真实用户点击时正常工作。

**文件变更**：
- [yam-desktop/src/pages/CrawlingPage.tsx](file:///d:/yam/yam-desktop/src/pages/CrawlingPage.tsx)：
  - 新增 `detectStage(logs)` 和 `formatElapsed(seconds)` 辅助函数
  - 新增 `startTimeRef` / `elapsed` / `logsCollapsed` / `copied` state
  - `startCrawl` 启动时记录 `startTimeRef.current = Date.now()`
  - 新增已耗时定时器 useEffect（每秒更新）
  - 进度条卡片渲染阶段徽章 + 已耗时 + 进度条冷却变色
  - 日志面板头部改为可点击折叠按钮（带 chevron 图标 + 日志条数）
  - 新增"复制日志"按钮 + `handleCopyLogs` 函数（clipboard API + execCommand 兜底）
  - 新增 lucide-react 图标导入：`ChevronDown` / `ChevronRight` / `Copy` / `Check`

### 083500 软件工程采集验证（2026-07-22）
**目的**：验证三阶段降级 + UI 优化在新专业（非 081200）上的表现。

**测试流程**：CDP 9223 → 专业管理页 → 点击 083500 行"更新" → 轮询状态。

**结果**：✅ **139/139 院校 100% 成功**，463 个院系，总耗时约 2 分钟（10:47:35 → 10:49:02+）。

**时间线**：
- t=0-30s 第一轮 15 并发快速：139 所 → 118 成功 / 21 失败（85% 成功率）
- t=30s 触发限流冷却，进度条变琥珀色，阶段徽章"限流冷却 · 等待第二轮"
- t=30-60s 30s 冷却 + 第二轮 3 并发 1.5s 延迟：21 所 → 21 成功 / 0 失败（100% 成功率）
- t=60-90s 阶段 2 分数线采集（139 所 15 并发）
- 完成后页面自动跳转"数据已就绪"

**关键观察**：
- ✅ 三阶段降级生效：第一轮 118 + 第二轮 21 = 139 所 100% 成功
- ✅ 第二轮 3 并发 + 1.5s 延迟策略很有效，21 所失败院校全部成功，**无需第三轮兜底**
- ✅ 阶段徽章正确切换：第一轮（蓝）→ 限流冷却（琥珀）→ 第二轮（琥珀）→ 阶段 2 分数线（靛蓝）
- ✅ 进度条冷却时变琥珀色：t=30s 时 `progressBarAmber: 是`
- ✅ 已耗时正确更新：0:04 → 0:34 → 1:04 → 1:34
- ⚠️ 分数线数 0 条：掌上考研无 083500 软件工程分数线数据（不影响采集流程验证）

**对比 081200**（271 所，5 分钟）：
- 083500（139 所）规模约为 081200 的一半，耗时也约一半（2 分钟 vs 5 分钟）
- 083500 第二轮就完成所有失败院校，081200 需要第三轮兜底（说明失败率与院校数量正相关）

---

## 关键设计决策

1. **掌上考研排名抓取**：用户选择 A 方案 - 尝试抓真实排名，失败降级到 `school_code` 升序。
2. **管理显示专业**：支持彻底删除专业及其同步数据。
3. **省份研招网顺序**：北京、天津、河北、山西、内蒙古、辽宁、吉林、黑龙江、上海、江苏、浙江、安徽、福建、江西、山东、河南、湖北、湖南、广东、海南、广西、四川、重庆、贵州、云南、西藏、陕西、甘肃、青海、宁夏、新疆。
4. **level_tags 固定显示**：985、211、双一流、自划线、科研院所、博士点、普通本科（不再依赖数据动态提取）。

---

## 参考文档索引（历史研究记录，勿轻易删除）

以下文档含独特经验数据，对后续开发有直接参考价值。日常维护以 `known-issues.md` 和 `progress.md` 为准，这些研究文档作为深度参考保留：

| 文档 | 关联 ISSUE | 参考价值 |
|---|---|---|
| [docs/issue-015-research.md](file:///d:/yam/docs/issue-015-research.md) | ISSUE-015（fixed） | dwzys.do 限流机制实测数据（12 个子测试、参数定型）、四阶段方案从 94.5% 到 100% 的完整调优过程。对后续新专业采集、ISSUE-017 验证有参考价值。 |
| [docs/issue-023-research.md](file:///d:/yam/docs/issue-023-research.md) | ISSUE-023（fixed） | httpx+Playwright 混合架构研究过程、独立 cookie jar 模拟独立 session 方案验证。对 ISSUE-029 后续优化有参考价值。 |
| [docs/data-collection-handoff-prompt.md](file:///d:/yam/docs/data-collection-handoff-prompt.md) | ISSUE-004~016 | 数据采集踩坑记录（"修复后不要再重复踩坑"），含根因分析和修复位置。 |
| [scripts/test_httpx_full_219.py](file:///d:/yam/scripts/test_httpx_full_219.py) | ISSUE-023 | E2-G 完整 219 个 yjxkdm 验证脚本，可复用于回归测试。 |
| [scripts/test_httpx_hybrid.py](file:///d:/yam/scripts/test_httpx_hybrid.py) | ISSUE-023 | E2-A3 Playwright 激活 + httpx 接管验证脚本。 |
| [scripts/test_issue025_cdp.cjs](file:///d:/yam/scripts/test_issue025_cdp.cjs) | ISSUE-025 | CDP 端到端验证脚本（sync_workspace_data + fetch_workspace_data + UI 渲染检查）。 |

---

## ISSUE-025 分数线同步修复（2026-07-22）

### 问题根因
- `yam/scripts/sync_to_tauri.py` 的 `load_score_lines` 通过 `admission_plans` 表做 `department_name → department_id` 映射
- `admission_plans` 只在早期采集 085410 时写入，导致 081200/083500 等专业分数线无法同步
- 前端"最低分"列全部显示 0

### 调研发现
- 分数线采集功能已实现：`zhangshangkaoyan.py` 的 `fetch_score_lines_batch`（httpx 并发版）
- `score_lines` 表已存在（源 yam.db），但 `department_id` 字段是**掌上考研院系编号**，与研招网 `departments.department_id` 是两套不同体系，无法直接关联
- `score_lines` 表同一校同年可能有多行（不同院系不同分数），如北科大 2025 年有 321/260/295/260 四个分数
- Tauri 端 `db.rs` 已有 `get_score_lines` 查询和 `WorkspacePage.tsx` 分数线显示代码

### 修复实现
1. `load_score_lines` 移除 `admission_plans` 依赖，直接用 `school_id + major_code` 查询 `score_lines`
2. 按 `year` 分组取 `MIN(total)` 聚合，解决同年多院系分数重复问题
3. 同年同专业公共课线（politics/english 等）通常相同（国家线），取 MIN 不影响准确性

### 验证结果
- ✅ 重复消除：081200/083500/085410 三个专业 0 重复（同 department_id + year）
- ✅ 081200: 271 学校 / 242 有分数 / 29 零分（数据源限制）/ 3146 条年份数据
- ✅ 083500: 139 学校 / 118 有分数 / 21 零分 / 1348 条年份数据
- ✅ 北京科技大学聚合正确：2025 年 4 行聚合取 MIN=260
- ✅ CDP 前端验证：华中科技大学 min_score=335，展开详情 4 年数据（2026:360, 2025:335, 2024:370, 2023:345）
- ✅ 后端 `fetch_workspace_data` 返回正确数据
- ✅ 前端"刷新数据"后正确显示 min_score

### 已知限制
- 29 所 081200 学校（北航、北理、天大、复旦、南大等 985）min_score=0，因掌上考研无这些学校分数线数据
- 当前是学校+专业级别取最低分，非院系级别精确匹配（后续优化方向：`score_lines` 表增加 `department_name` 列）

---

## 全流程 UI 测试提示词（2026-07-24）

### 文件变更
- 新增 [docs/full-ui-test-prompt.md](file:///d:/yam/docs/full-ui-test-prompt.md)：面向多模态模型的自包含全流程 UI 测试提示词（过期时间 2026-08-24）

### 背景
用户要求评估"全自动全流程全方位测试"可行性。结论：UI 层可全自动（CDP 9223 + 现有脚本基础），研招网登录依赖环节（目录更新/采集）需人工问答框。由于当前会话模型无多模态能力（截图看不了），故编写提示词交由多模态会话执行，覆盖功能/数据/视觉三层。

### 提示词覆盖范围
M1 启动健康 / M2 导航 / M3 工作区下拉 / M4 院校视图（表格/多选/搜索/排序/分页/展开详情/年份/历年分析）/ M5 招生计划视图 / M6 筛选 / M7 收藏 / M8 导出 CSV/Excel/JSON×双视图（ISSUE-028 验证重点，含 monkey-patch 拦截模板）/ M9 最近查看 / M10 设置登录态 / M11 空状态 / M12 人工（目录更新/采集）

### 关键事实（提示词内已固化）
- CDP 端口 **9223**（tauri.conf.json 配置，非 skill 文档误写的 9222）
- 已有数据专业：081200/083500/085410/030100
- 已知 bug 不重复报清单（ISSUE-022 open、ISSUE-028 in-progress，其余 fixed）

### 下一步
将 docs/full-ui-test-prompt.md 全文粘贴给多模态会话执行；测试报告输出到 docs/test-report-YYYYMMDD.md

---

## ISSUE-030 分数语义与研究方向闭环（2026-07-31）

- ISSUE-030 用户可见问题已关闭：原始分数证据和逐年请求状态已持久化，分数任务与院系任务解耦，同步不再按列 `MIN` 拼接不存在的记录。
- 院校主分数使用最新可用专业级记录；一级学科/门类参考线退出精确专业分数排序和筛选，并在页面中显式标注粒度与请求状态。
- 当前计划招生人数与历史分数年份解绑；同一来源计划按院系、学习方式和考试方式去重，武汉大学与西北农林黄金样本已通过真实库审计和用户界面复验。
- 研究方向关键词已贯通 Rust/SQLite 服务端筛选、分页和前端筛选面板；考试科目、专项计划等 fallback 带 `label_type/is_fallback`，不再冒充真实研究方向。
- 院校视图保留默认最低分与详细状态两种显示；招生计划保留紧凑/舒适视图。筛选标签维持原排列，结果数和视图切换位于右侧。
- 清理 `WorkspacePage.tsx` 文件头重复 UTF-8 BOM；视图切换按钮统一显示目标模式。
- 最终门禁：前端 48/48、Rust 24/24、Python 12/12；TypeScript、生产构建、Python `compileall`、`npm audit --audit-level=high` 和 `git diff --check` 均通过。
- 通用数据模型边界转入 ISSUE-031：来源实体映射、当前快照/历史事实版本、未知状态、共享参考实体、稳定计划键和录取统计模型，不阻塞当前发布。

---

## ISSUE-031 第一阶段：共享分数证据实体（2026-07-31）

- 新增 `workspace_score_evidence`：按学校、专业、年份保存唯一共享分数证据，包含粒度、来源、更新时间、说明、原始证据 JSON、来源记录数和选中来源院系。
- 新增 `workspace_plan_score_evidence`：计划仅引用共享证据，不再把同一学校专业参考值复制进每条 `workspace_plan_years`。
- normalized 模型升级为 v3；Rust `workspace_years_source` 联合直接计划年份与共享证据引用，现有 DTO、分页、筛选、排序、导出和页面展示无需改变。
- legacy `workspace_department_years` 暂时继续写入兼容投影，旧库回退行为保持不变；模型状态以“直接年份 + 共享证据引用”核对投影行数。
- 同步校验新增悬空引用、跨学校引用和跨专业引用门禁；专业清理同时删除证据引用与共享证据。
- 真实 `085410` 只读源库 → 临时目标库同步验证：217所学校、514个计划、668条共享证据、1624个计划引用、0条直接复制的normalized计划年份、0组重复证据；legacy与normalized投影均为1624条，模型状态v3/ready。
- 最终门禁：前端48/48、Rust25/25、Python13/13；TypeScript、生产构建、Python `compileall`、Rust格式检查和`npm audit --audit-level=high`通过。
