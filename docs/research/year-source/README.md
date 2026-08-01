# 年度数据来源专项研究

本目录研究统一招生录取届次 `admission_cycle`（例如 `2026` 表示 2026 级招生录取周期）能否由现有数据和公开来源可靠建立。研究基线为 `5c8c23f`，范围为 2023-2026 四届。

## 阶段产物

- [A：本地年份事实审计](a-local-year-audit.md)
- [B：来源深度样本与证据分级](b-source-depth-samples.md)
- [C：全量覆盖测算](c-full-coverage-measurement.md)
- [D：最终报告与采集设计](d-final-report-and-collection-design.md)
- [本地审计机器证据](evidence/local-audit.json)
- [机器可读来源清单](evidence/source-inventory.json)
- [机器可读覆盖统计](evidence/coverage-statistics.json)
- [admission_cycle 机器规则](evidence/admission-cycle-contract.json)

## 不可突破的语义边界

`source_year` 必须与 `source_year_kind` 一起保存。目录年份、分数年份、录取年份、请求年份、发布日期和采集时间是不同事实；只有来源语义及实体映射同时确定时，才允许写入 `admission_cycle`。查询为空默认是 `unknown`，不能证明不招生。
