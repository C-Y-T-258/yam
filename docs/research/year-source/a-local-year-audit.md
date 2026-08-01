# A：本地年份事实审计

## 审计范围与复现

- 基线提交：`5c8c23ffa465402f46ec096e87d15062caab2274`
- 审计日期：2026-08-01（Asia/Shanghai）
- 源库：`%USERPROFILE%/.yam/data/yam.db`
- 桌面库：`%USERPROFILE%/.yam/data/yam-desktop.db`
- 机器证据：[`evidence/local-audit.json`](evidence/local-audit.json)
- 复现命令：`python -m yam.scripts.audit_year_sources --pretty --output docs/research/year-source/evidence/local-audit.json`

脚本使用 SQLite URI `mode=ro`，连接后设置 `PRAGMA query_only=ON`，并比较执行前后数据库 SHA-256。机器证据记录了数据库绝对路径、大小、前后哈希、每条查询的 SQL、列名和聚合结果。本次两个数据库的前后哈希分别一致，`query_only=1`。

## 确定事实

### 当前目录不是年度目录

源库 `departments` 有 2961 行，覆盖 4 个专业、461 个来源学校 ID、855 个学校-专业组合、1217 个学校-专业-来源院系组合。表中既没有 `catalog_year`，也没有通用 `year` 字段（证据 `source.current_entities`、`source.department_year_fields`）。

这些行的 `updated_at` 范围是 `2026-07-18T00:06:07` 至 `2026-07-30T05:05:13`。它只说明采集/更新发生的时间，不说明目录属于 2026 届。`yjfxs.do` 的当前实现请求体只有专业、学校、学习方式、专项筛选和分页参数，没有年份参数（`yam/crawler/yanzhao.py` 的 `fetch_departments` 与 `fetch_departments_batch`）。

桌面库 2961 个 `workspace_plan_snapshots` 全是 `catalog_year=NULL`、`catalog_year_status=unknown`；观察时间范围与源库目录更新时间相同（证据 `desktop.catalog_year_status`）。因此当前产品对 2023-2026 任一届的**年度目录确定覆盖均为 0**。这不等于四届均不招生，而是 2961 个当前计划都无法由本地证据映射到具体届次。

### 当前分数数据只证明分数年份

源库 `score_lines` 共 3855 行：

| `score_lines.year` | 行数 | 学校-专业组合 | 来源学校 ID |
|---:|---:|---:|---:|
| 2023 | 802 | 564 | 323 |
| 2024 | 979 | 656 | 360 |
| 2025 | 1015 | 730 | 410 |
| 2026 | 1059 | 764 | 421 |

证据：`source.score_by_year`。这里的 `year` 来自掌上考研 `schoolScore` 请求参数，只能记作 `source_year_kind=score_line_year`。它不能证明同一实体在该年招生，也不能作为目录年或录取年。

粒度也不统一：2950 个旧行没有 `metric_type/match_scope`；其余为 792 个专业码匹配、74 个一级学科匹配和 39 个门类匹配（证据 `source.score_type_scope`）。本地表名为 `score_lines`，但没有 `national/school/department/major/direction` 的完整严格分型，不能据此声称已区分国家线、校线、院线和专业/方向复试线。

`score_request_status.requested_year` 只表示对某年发起请求。2023-2026 共记录 868 个请求状态，其中有 198 个 `success_empty` 和 2 个 `api_error`（证据 `source.score_request_status`）。`success_empty` 只能证明该次查询没有匹配结果，不能证明没有分数线，更不能证明不招生。

### 旧招生计划不能支撑产品年度目录

源库 `admission_plans` 共 781 行，全部是专业 `085410`：2024 年 206 行、2025 年 256 行、2026 年 319 行，2023 年 0 行（证据 `source.admission_plan_by_year_major`）。代码显示其 `year` 同时作为掌上考研 `planListV2` 的请求参数并原样写入结果，可暂记为 `source_year_kind=plan_request_year`；在验证接口响应的年份语义前，不能直接映射为 `admission_cycle`。

该表的采集时间全部在 2026-07-07，证明它是一次历史接口采集，不是对应年度的发布日期。它使用掌上考研 `school_id/depart_id/plan_id/spe_id`，而当前目录使用研招网学校和院系 ID。桌面库现有 361 个掌上考研分数院系实体全部对 `school_major` 标为 `unmapped`（证据 `desktop.source_mapping_status`）。因此 781 行不能直接关联到 2961 个当前方向级计划；2023 年零行也只能表示本地未获得数据。

### 桌面年度行是分数投影，不是年度详情

桌面库实体计数为 4 个专业、855 个学校-专业组合、1217 个院系实体、2961 个计划（证据 `desktop.current_entities`）。年度相关表的事实是：

- `workspace_score_evidence`：2714 行，是去重后的学校-专业/一级学科/门类分数证据。
- `workspace_plan_score_evidence`：9135 行，是当前计划与共享分数证据的关联。
- `workspace_department_years`：9135 行，是旧兼容投影。
- `workspace_plan_years`：0 行，没有计划自身的年度事实。

所以页面切换 2023-2026 只是在当前计划上切换共享分数证据。招生人数、方向、学习方式、考试方式、考试科目和专项计划仍来自当前目录快照；9135 行不能计作历史计划覆盖。

## 年份字段语义清单

| 位置 | 字段 | `source_year_kind` | 能否直接映射 `admission_cycle` | 原因 |
|---|---|---|---|---|
| 源 `score_lines` | `year` | `score_line_year` | 否 | 仅标识分数线请求/记录年，粒度混合 |
| 源 `admission_plans` | `year` | `plan_request_year` | 暂不能 | 第三方接口请求年；需逐条验证响应语义和实体映射 |
| 源/桌面请求状态 | `requested_year` | `request_year` | 否 | 只记录请求意图和结果状态 |
| 桌面分数证据/投影 | `year` | `score_line_year` | 否 | 从源分数行投影，不是目录或录取年 |
| 桌面计划快照 | `catalog_year` | `catalog_year` | 是，但当前全 NULL | 专门字段；只有来源提供正整数时才可映射 |
| 各表 | `updated_at/retrieved_at/fetched_at` | `collected_at` | 否 | 采集或更新时刻 |
| 计划快照/来源实体 | `observed_at` | `observed_at` | 否 | 观察时刻，不是源声明年份 |
| 用户行为 | `created_at/viewed_at` | `user_event_at` | 否 | 与招生届次无关 |
| 模型状态 | `old_year_count/new_year_count` | 非年份字段 | 否 | 名称含 year，但值是行数计数 |
| 主键 | `year_id/plan_year_id` | 非年份字段 | 否 | 行标识，不是年份 |

完整字段发现结果见证据 `source.temporal_columns` 和 `desktop.temporal_columns`。字段发现有意包含名称带 `year` 的计数和主键，随后在上表中显式排除，避免按列名猜测语义。

## 对统一届次的阶段 A 判定

| 数据类型 | 2023 | 2024 | 2025 | 2026 | 阶段 A 结论 |
|---|---|---|---|---|---|
| 当前产品年度目录 | 0 确定 | 0 确定 | 0 确定 | 0 确定 | 本地无可映射目录年；全部为 unknown |
| 分数线记录 | 有 | 有 | 有 | 有 | 只能进入相应 `score_line_year` 切片，且需严格重分型 |
| 第三方招生计划 | 无 | 仅 085410 | 仅 085410 | 仅 085410 | 不能映射当前方向级计划；2023 为 unknown |
| 录取统计 | 无 | 无 | 无 | 无 | 本地 schema 和数据均未接入，不能从分数线推导 |

这里“0 确定”指**确定映射到该届的目录事实数量为零**，不是“确定不招生”的数量。只有拿到当年完整官方目录并确认某实体缺席，才允许形成 `not_offered`；查询为空、表中无行和当前快照无法映射都保持 `unknown`。

## 后续研究输入

阶段 B 必须验证：官方目录是否显式标注届次；研招网页面/接口是否存在可追溯的年度版本；掌上考研每条历史记录的原始响应、年份语义和 ID 映射能力；官方复试线与拟录取名单能达到学校、专业、院系、方向、具体计划中的哪一层。阶段 C 的产品分母固定为当前 2961 个计划乘四届，但分子只能计入来源年份和实体映射同时确定的事实。
