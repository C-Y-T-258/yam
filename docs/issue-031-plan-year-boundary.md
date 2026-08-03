# ISSUE-031 计划年份边界结论

## 结论

当前工作区的“目录年未知”是来源事实，不是同步漏字段：

- 真实源库 `departments` 共 2961 条，表结构没有 `catalog_year` 列。
- 同步层在源列缺失时显式读取 `NULL`，写入快照为 `catalog_year=NULL`、`catalog_year_status=unknown`。
- 当前桌面库 2961 个 `workspace_plan_snapshots` 全部为 `unknown`，正数目录年为 0。
- 页面和导出不得用最新分数年份、采集时间或当前年份推断目录年份。

## 兼容规则

- 来源提供正整数目录年时，快照保存该值并标记 `provided`。
- 来源未提供、值为空或值为 0 时，快照保存 `NULL/unknown`。
- Rust DTO 的兼容数值字段仍可用 `0` 表示未知，但 UI 显示“未知”，导出数值列留空并保留状态列。

## 验证

- `yam/scripts/audit_issue031_unknowns.py` 对真实源库和桌面库提供可重复只读审计。
- Python 专项测试同时覆盖 `2027/provided` 与 `NULL/unknown` 两条同步分支。
- 计划年份与分数年份继续独立，不允许互相 fallback。
