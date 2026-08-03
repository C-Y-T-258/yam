# 录取统计独立模型设计

## 目标与边界

录取最低分、平均分和最高分属于录取结果统计，不是复试分数线。后续接入必须使用独立的 `workspace_admission_statistics`，不得写入或覆盖：

- `score_lines.total`
- `workspace_score_evidence.min_score`
- `workspace_schools.min_score`
- `WorkspacePlanRow.latest_min_score`

本设计只固定模型、接口和测试契约；官方来源采集、同步和 UI 接入转入 ISSUE-032。

## 最小数据模型

`workspace_admission_statistics` 每行是一条来源可回溯的年度录取统计：

| 字段 | 类型 | 规则 |
|---|---|---|
| `statistic_key` | TEXT PK | 来源、实体、年份和口径的稳定哈希 |
| `school_id` | TEXT NOT NULL | 规范院校 ID |
| `major_code` | TEXT NOT NULL | 六位专业代码 |
| `department_key` | TEXT NULL | 只有可靠映射时填写 |
| `plan_key` | TEXT NULL | 只有来源能定位具体计划时填写 |
| `admission_year` | INTEGER NOT NULL | 录取年份，必须为正整数 |
| `study_mode` | TEXT NULL | 全日制/非全日制；来源未区分时为空 |
| `score_basis` | TEXT NOT NULL | `initial_exam`、`total_score` 或 `unknown` |
| `admitted_min` | REAL NULL | 未公布时为 NULL，禁止写 0 哨兵 |
| `admitted_avg` | REAL NULL | 未公布时为 NULL |
| `admitted_max` | REAL NULL | 未公布时为 NULL |
| `admitted_count` | INTEGER NULL | 未公布时为 NULL；来源明确给 0 才保留 0 |
| `match_scope` | TEXT NOT NULL | `school_major`、`department` 或 `direction` |
| `source` | TEXT NOT NULL | 来源标识 |
| `source_url` | TEXT NULL | 官方页面或文件地址 |
| `updated_at` | TEXT NOT NULL | 来源更新时间或采集时间 |
| `raw_evidence_json` | TEXT NOT NULL | 原始证据，禁止只保留聚合值 |

约束：

- 至少一个 `admitted_min/avg/max/count` 非 NULL。
- 同时存在的分值满足 `admitted_min <= admitted_avg <= admitted_max`。
- `plan_key` 非空时 `department_key` 也必须非空。
- 学校专业层统计只保存一次，不按计划复制；计划通过查询关联共享统计。

## 查询接口

Rust/TypeScript DTO 使用同一字段名，新增独立查询：

```text
fetch_admission_statistics(
  major_codes,
  school_id?,
  admission_year?,
  study_mode?
) -> AdmissionStatistic[]
```

现有工作区查询和“分数线”列保持不变。未来 UI 必须使用“录取最低分/平均分/最高分”标题，并同时显示录取年份、分数口径、匹配粒度和来源；不得将录取统计混入分数线排序，除非新增独立排序选项。

## 测试契约

1. 插入录取统计后，现有 `score_lines` 与分数线投影行数和值完全不变。
2. 缺失统计使用 NULL；来源明确的录取人数 0 可保留，未知不得写 0。
3. 非法分值顺序、无任何指标、未知 `score_basis/match_scope` 值必须被拒绝。
4. 学校专业层统计关联多个计划时物理只保存一条，下游聚合不得重复计数。
5. 院系/方向映射不可靠时必须降级为 `school_major`，不得猜测 `plan_key`。
6. 相同 `statistic_key` 重采执行幂等 upsert；不同年份或口径不得互相覆盖。
7. CSV/Excel/JSON 导出使用独立列名，并保留来源、口径、粒度和原始证据引用。
8. UI 无录取统计时显示“暂无录取统计”，不能回退显示复试线。

## 后续实施顺序

ISSUE-032 按“官方来源样本确认 → 原始证据采集 → 临时库 schema/同步 → 查询 DTO → 独立 UI/导出 → 真实样本验收”执行。没有官方证据样本前不创建生产表。
