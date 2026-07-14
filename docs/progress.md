# 进度跟踪 - 2026-07-13

> 本文件用于上下文压缩后恢复进度。每完成一步立即更新。
> 当前任务：实现上个会话被回退的需求（地区研招网排序、院校层次标记、科研院所识别、掌上考研/研招网两种排序、学习方式与专项计划筛选、管理显示专业、刷新数据整合同步）。

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

## 关键设计决策

1. **掌上考研排名抓取**：用户选择 A 方案 - 尝试抓真实排名，失败降级到 `school_code` 升序。
2. **管理显示专业**：支持彻底删除专业及其同步数据。
3. **省份研招网顺序**：北京、天津、河北、山西、内蒙古、辽宁、吉林、黑龙江、上海、江苏、浙江、安徽、福建、江西、山东、河南、湖北、湖南、广东、海南、广西、四川、重庆、贵州、云南、西藏、陕西、甘肃、青海、宁夏、新疆。
4. **level_tags 固定显示**：985、211、双一流、自划线、科研院所、博士点、普通本科（不再依赖数据动态提取）。
