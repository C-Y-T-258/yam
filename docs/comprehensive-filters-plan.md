# 研招网级综合筛选功能实现计划

## 背景

当前 Tauri 桌面端 Workspace 仅支持地区、院校层次、排序和简单的「更多筛选」（最低分/招生人数/院系关键词）。用户希望达到研招网官方筛选能力，并补充官方不支持的特性（如一区/二区、多地区选择、按科目分数筛选等），且所有可选项必须随当前专业数据动态变化。

## 目标

在 Tauri 桌面端实现与研招网对齐、并有所增强的筛选面板，覆盖：

1. **地区**：多选省份 + 「一区」「二区」快捷分组
2. **学习方式**：全日制 / 非全日制
3. **考试方式**：统考、单独考试、推免等（跟随 API 实际取值）
4. **院校特性**：自划线院校、博士点、双一流建设高校
5. **专项计划**：退役大学生士兵专项计划、少数民族高层次骨干计划
6. **科目分数区间**：英语、数学、专业课（政治除外）
7. **院系名称关键词**：保留并增强
8. **收藏页同步**：上述筛选同样适用于收藏页

## 约束

- 必须有真实数据，不使用模拟值填充新字段。
- 需要同时改造 Python 爬虫/存储层和 Tauri 桌面端。
- 可选项必须根据当前选择专业在数据库中实际包含的数据动态生成。

## 现状梳理

### Python 后端（数据源头）

- `yam/storage/db.py`：
  - `schools` 表有 `province`、`level`，无自划线/博士点/双一流字段。
  - `departments` 表有 `exam_type`（已存在但未传到 Tauri），无 `study_mode`、`special_plans`。
- `yam/crawler/yanzhao.py`：
  - 学校种子 JSON 中已有 `zhx`（自划线）、`bs`（博士点）、`syl`（双一流）、`b985`、`mtydxs`（退役士兵）、`mjsggjh`（少数民族骨干）等字段，但爬虫未提取保存。
  - 院系 API 请求参数包含 `xxfs`（学习方式）、`tydxs`（退役士兵）、`jsggjh`（少数民族骨干），目前传空串；返回条目里可能包含学习方式和专项计划信息，需实际验证。

### Tauri 桌面端

- `src-tauri/src/db.rs`：使用独立的 `workspace_schools`、`workspace_departments`、`workspace_department_years` 表，字段简化。
- `src-tauri/src/main.rs`：打开当前目录下的 `yam.db`，与 Python 后端使用的 `~/.yam/data/yam.db` 不是同一个文件。
- `src/lib/db.ts` / `src/pages/WorkspacePage.tsx`：已有基础筛选框架，可扩展。

## 方案概述

整体拆成 4 个阶段，建议按顺序执行：

1. **Python 数据层扩展**：补全新字段、修正爬虫提取逻辑。
2. **Tauri 数据同步/导入**：建立从 Python DB 到 Tauri workspace 表的同步机制，确保 Tauri 拿到真实数据。
3. **Tauri 后端查询扩展**：支持全部新筛选条件，动态返回可选项。
4. **前端筛选面板重构**：研招网式交互，地区多选 + 一区/二区，其余按真实数据动态渲染。

## Phase 1：Python 数据层扩展

### 1.1 更新 SQLite Schema

文件：`yam/storage/db.py`

- `schools` 表新增：
  - `self_scoring INTEGER`（是否自划线院校）
  - `doctoral_program INTEGER`（是否博士点）
  - `double_first_class INTEGER`（是否双一流）
  - 如需要，保留 `level` 用于展示层次，但逻辑上拆分为独立布尔字段。
- `departments` 表新增：
  - `study_mode TEXT`（学习方式，如 "全日制" / "非全日制" / "全日制,非全日制"）
  - `special_plans TEXT`（JSON 数组字符串，如 `["退役大学生士兵", "少数民族高层次骨干计划"]`）

### 1.2 更新爬虫提取

文件：`yam/crawler/yanzhao.py`

- `fetch_schools`：从学校种子 JSON 中提取 `zhx`、`bs`、`syl`、`b985`、`mtydxs`、`mjsggjh`。
- `_infer_level`：修正逻辑，建议根据 `b985`、`bs`、`syl` 组合生成展示文本，而不是把 `bs` 当成 211。
- `_parse_department_item`：
  - 提取 `xxfs` 相关字段作为 `study_mode`。
  - 提取 `tydxs`、`jsggjh` 相关字段作为 `special_plans`。
  - **风险点**：需实际调用一次 API 或查看返回样例，确认字段名。

### 1.3 更新存储方法

文件：`yam/storage/db.py`

- `save_school`：写入新增学校特性字段。
- `save_department`：写入 `study_mode`、`special_plans`。
- 如有必要，提供迁移脚本把旧数据按种子 JSON 重新刷一遍新字段。

## Phase 2：Tauri 数据同步/导入

Tauri 目前独立维护 `yam.db`。为了把 Python 后端的真实数据喂给 Tauri，推荐两种方案，建议选方案 A：

### 方案 A：Python 同步脚本（推荐）

新增 `yam/scripts/sync_to_tauri.py`：

- 读取 Python DB（`~/.yam/data/yam.db`）的 `schools`、`departments`、`score_lines`。
- 聚合计算每个学校在当前专业下的 `min_score`、`enroll_count`。
- 写入 Tauri 的 `yam.db`（`yam-desktop/src-tauri/` 运行目录下），使用 Tauri 的 `workspace_*` 表结构。
- 保留学校特性字段、院系的学习方式/考试方式/专项计划字段。

优点：Tauri 侧改动最小，继续沿用现有查询模式。

### 方案 B：Tauri 直接读 Python DB

让 Tauri 打开 `~/.yam/data/yam.db`，并把查询改写成直接查询 Python 原始表。

优点：无同步延迟。
缺点：Tauri 需要大量查询重构，且要处理跨表聚合。

**本计划采用方案 A。**

## Phase 3：Tauri 后端查询扩展

### 3.1 Schema 扩展

文件：`yam-desktop/src-tauri/src/db.rs`

- `workspace_schools` 新增：
  - `self_scoring INTEGER`
  - `doctoral_program INTEGER`
  - `double_first_class INTEGER`
- `workspace_departments` 新增：
  - `study_mode TEXT`
  - `exam_type TEXT`
  - `special_plans TEXT`
- `WorkspaceSchool` / `WorkspaceDepartment` Rust 结构体同步扩展。

### 3.2 查询扩展

文件：`yam-desktop/src-tauri/src/db.rs`

- `get_workspace_schools` 增加参数：
  - `provinces: Option<Vec<&str>>`（多地区）
  - `region_group: Option<&str>`（"一区" / "二区"）
  - `study_modes: Option<Vec<&str>>`
  - `exam_types: Option<Vec<&str>>`
  - `self_scoring: Option<bool>`
  - `doctoral_program: Option<bool>`
  - `double_first_class: Option<bool>`
  - `special_plans: Option<Vec<&str>>`
  - `english_min/max`, `math_min/max`, `specialized_min/max`
- 由于需要按院系/年份字段过滤学校列表，继续使用 `JOIN workspace_departments` 和必要时 `JOIN workspace_department_years`。
- SQL 用参数化动态拼接，防止注入。

### 3.3 FilterOptions 动态化

文件：`yam-desktop/src-tauri/src/db.rs`

扩展 `FilterOptions`：

```rust
pub struct FilterOptions {
    pub provinces: Vec<String>,
    pub region_groups: Vec<String>,  // ["一区", "二区"]
    pub levels: Vec<String>,
    pub study_modes: Vec<String>,
    pub exam_types: Vec<String>,
    pub special_plans: Vec<String>,
    pub has_self_scoring: bool,     // 当前专业是否有自划线院校
    pub has_doctoral: bool,
    pub has_double_first_class: bool,
}
```

所有列表都从当前 `major_code` 的实际数据中 `SELECT DISTINCT` 生成。

### 3.4 Commands 扩展

文件：`yam-desktop/src-tauri/src/commands.rs`

- `fetch_workspace_data` 透传全部新参数。
- `fetch_workspace_filter_options` 透传新 `FilterOptions`。

## Phase 4：前端筛选面板重构

### 4.1 数据层

文件：`yam-desktop/src/lib/db.ts`

- 扩展 `WorkspaceFilters`：
  - `provinces?: string[]`
  - `regionGroup?: '一区' | '二区'`
  - `studyModes?: string[]`
  - `examTypes?: string[]`
  - `selfScoring?: boolean`
  - `doctoralProgram?: boolean`
  - `doubleFirstClass?: boolean`
  - `specialPlans?: string[]`
  - `englishMin/Max`, `mathMin/Max`, `specializedMin/Max`
- 扩展 `FilterOptions` TypeScript 类型。
- `fetchWorkspaceData` 透传参数。

### 4.2 地区筛选

改为研招网式横向标签组：

- 顶部一行：「全部」「一区」「二区」快捷按钮。
- 下面按一区/二区分组展示省份复选框。
- 点击「一区」自动勾选所有一区省份；点击省份则取消/选中单个。
- 同时保留现有省份下拉作为紧凑备选（可选）。

一区/二区映射硬编码在前端常量中，与研招网一致：

- 一区：北京、天津、河北、山西、辽宁、吉林、黑龙江、上海、江苏、浙江、安徽、福建、江西、山东、河南、湖北、湖南、广东、重庆、四川、陕西
- 二区：内蒙古、广西、海南、贵州、云南、西藏、甘肃、青海、宁夏、新疆

### 4.3 学习方式 / 考试方式 / 专项计划

用动态生成的复选框组：

- 如果 `FilterOptions.study_modes` 为空，隐藏该筛选块。
- 同理处理 `exam_types`、`special_plans`。

### 4.4 院校特性

用开关/复选框：

- 自划线院校
- 博士点
- 双一流建设高校

只有当 `FilterOptions` 中对应 `has_*` 为 true 时才显示（即当前专业数据中存在）。

### 4.5 科目分数区间

在「更多筛选」面板中增加：

- 英语：最低 / 最高
- 数学：最低 / 最高
- 专业课：最低 / 最高

由于科目分数在 `workspace_department_years` 中，过滤学校时需要保证该校至少有一个院系/年份满足条件。

### 4.4 UI 布局

建议把现有顶部筛选栏升级为研招网风格的多行折叠面板：

```
[搜索框] [地区：多选标签组] [学习方式] [考试方式]
[院校特性：自划线 博士点 双一流] [专项计划] [更多筛选 ▼]
```

默认展开常用筛选，点击「更多筛选」展开分数区间、院系关键词等高级条件。

## Phase 5：收藏页同步

文件：`yam-desktop/src/pages/Modals.tsx`

- 收藏页当前只有地区、层次、搜索。
- 复用 WorkspacePage 的筛选逻辑/组件（建议抽离为共享组件），让收藏页支持相同条件。
- 由于收藏数据量小，也可以纯前端过滤，无需新增后端命令。

## 关键风险与待确认事项

1. **学习方式/专项计划字段名**：需要实际调用 `yjfxs.do` 或查看返回样例，确认 `xxfs`、`tydxs`、`jsggjh` 在返回条目里的字段名。
2. **数据同步时机**：方案 A 要求用户在 Tauri 启动前或运行时执行同步脚本。是否需要做成 Tauri 内置命令（点击「刷新数据」时触发同步）？
3. **`bs` 字段语义**：当前 `_infer_level` 把 `bs` 当 211 用，但 `bs` 更可能是「博士点」。需要修正，并确认 211 信息是否另有字段（如 `sign2` 解码）。
4. **性能**：多条件 + 多表 JOIN 可能变慢。学校数量大时需在 `(school_id, major_code)` 和年份表上加索引。

## 建议的实施顺序

按阶段推进，每阶段可独立验证：

1. Phase 1：Python 层补字段 + 修正爬虫 + 跑一次 `yam fetch -m 085410` 验证新字段已写入。
2. Phase 2：写同步脚本，把 Python DB 同步到 Tauri DB，Tauri 能读到真实数据。
3. Phase 3：Tauri 后端扩展查询和动态 FilterOptions，用 Rust 单元测试或临时命令验证 SQL。
4. Phase 4：前端重构筛选面板，浏览器/桌面端逐条验证。
5. Phase 5：收藏页复用筛选组件。

## 验收标准

- [ ] Python DB 中 `schools` 包含 `self_scoring`、`doctoral_program`、`double_first_class`。
- [ ] Python DB 中 `departments` 包含 `study_mode`、`special_plans`，`exam_type` 已保存。
- [ ] Tauri DB 的 `workspace_*` 表包含上述字段的真实数据。
- [ ] Workspace 地区筛选支持多选 + 一区/二区快捷选择。
- [ ] 学习方式、考试方式、专项计划、院校特性、科目分数筛选均可用，且选项来自当前专业真实数据。
- [ ] 收藏页支持同样筛选。
- [ ] 前端构建、Rust 编译均通过。
