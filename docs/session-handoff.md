> 本文档是项目唯一的状态入口。旧目录 `d:\考研信息整理\yam` 中的历史计划已转移到本目录，原文件已删除。

# YAM 项目状态与下一步

## 当前状态

- S001–S012 前端流程已实现。
- Python 后端 `yam.db` 已完成 Phase 1 数据层扩展（`schools` 增加自划线/博士点/双一流，`departments` 增加学习方式/专项计划）。
- Tauri 桌面端 `workspace_*` 表仍由 `seed_data()` 填充模拟数据，未接入 `yam.db`。

## 下一步：综合筛选功能 Phase 2–5

### Phase 2：Tauri 数据同步（当前最高优先级）

让桌面端读取 Python 后端真实数据。

1. 扩展 Tauri DB schema
   - `workspace_schools` 增加 `self_scoring`、`doctoral_program`、`double_first_class`
   - `workspace_departments` 增加 `study_mode`、`exam_type`、`special_plans`
2. 创建 `yam/scripts/sync_to_tauri.py`
   - 读取 `yam.db` 的 `schools` / `departments` / `score_lines`
   - 聚合每个学校在当前专业下的 `min_score`、`enroll_count`
   - 写入 Tauri 桌面端 SQLite
3. Tauri 后端暴露同步命令或手动触发入口
4. 验证 Tauri 能读取真实数据（含 Phase 1 新增字段）

### Phase 3：Tauri 后端查询扩展

`get_workspace_schools` 与 `FilterOptions` 支持全部新条件：

- 地区：多选省份 + 「一区」「二区」快捷分组
- 学习方式：全日制 / 非全日制
- 考试方式：统考、单独考试、推免等
- 院校特性：自划线院校、博士点、双一流
- 专项计划：退役大学生士兵、少数民族高层次骨干计划等
- 科目分数区间：英语、数学、专业课
- 院系名称关键词

所有可选项必须根据当前专业真实数据动态生成。

### Phase 4：前端筛选面板重构

- 地区改为研招网式横向标签组：「全部」「一区」「二区」 + 省份复选框
- 学习方式 / 考试方式 / 专项计划用动态复选框组，无数据时隐藏
- 院校特性用开关/复选框
- 科目分数区间放入「更多筛选」面板
- 整体升级为多行折叠面板

### Phase 5：收藏页同步筛选

收藏页复用工作区筛选逻辑/组件，支持相同条件过滤。

## 关键文件

| 文件 | 说明 |
|------|------|
| `yam/storage/db.py` | Python 后端 schema |
| `yam/crawler/yanzhao.py` | 爬虫，已提取 Phase 1 字段 |
| `yam/scripts/sync_to_tauri.py` | Phase 2 待创建 |
| `yam-desktop/src-tauri/src/db.rs` | Tauri SQLite schema 与查询 |
| `yam-desktop/src-tauri/src/commands.rs` | Tauri 命令 |
| `yam-desktop/src/pages/WorkspacePage.tsx` | 工作区前端 |
| `yam-desktop/src/lib/db.ts` | 前端数据访问与类型 |

## 注意事项

- 浏览器环境仍使用 `src/data/mock-schools.ts` 做 fallback。
- 旧数据的新字段为 0/NULL，筛选面板跑通后需清空 `fetch_log` 重新抓取回填。
- Tailwind CSS v4 使用 `@theme` 定义自定义颜色。
