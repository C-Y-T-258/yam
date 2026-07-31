# ISSUE-030 研究记录：分数线语义、血缘与聚合问题如何系统定位

> 记录工作区“最低分”与掌上考研、学校官网不一致问题的完整调查过程。
> 本文档不以逐条修正异常数字为目标，而是通过“语义契约 → 黄金样本 → 原始证据 → 全库根因统计 → 修复决策”定位能够同时影响大量数据的系统性规则。
> 调查日期：2026-07-30。调查阶段先收敛根因，随后已完成第一轮兼容式代码修复和自动门禁；真实用户库尚未重新采集、同步和复核，因此 ISSUE 仍保持进行中。

---

## 一、问题与约束

### 1.1 用户报告的直接问题

`085410 人工智能` 出现两个可复现现象：

1. 西北农林科技大学已有 2026 年分数线 264，但院校视图显示 260。
2. 武汉大学已有 2026 年招生计划，但应用没有 2026 分数；2025 没有 `085410` 精确记录，却显示 285。

最初容易把问题理解成“几个数字采错了”，但进一步调查发现，这些现象分别涉及：

- 跨年份聚合；
- 分数年份与招生计划年份混用；
- 6 位专业、4 位一级学科、2 位门类的 fallback；
- 同校同年多院系记录压平；
- API 失败与真实空数据缺少状态；
- “分数线”与“录取最低分”的指标语义混淆。

### 1.2 调查原则

本次不采用“列出异常数字后逐条修正”的方式，而采用语义驱动审计：

1. 先定义字段究竟代表什么；
2. 保存并比较原始来源证据；
3. 用少量黄金样本覆盖所有规则分支；
4. 找到系统性根因；
5. 再用全库查询量化每个根因的影响范围；
6. 最后确定分阶段修复顺序。

核心判断：一万条问题数据可能由一条错误聚合规则产生。修正规则前逐条清洗数据，既不可持续，也无法防止下一次同步重新生成同样的问题。

### 1.3 本次使用的真实数据库

| 数据库 | 路径 | 作用 |
|---|---|---|
| Python 源库 | `%USERPROFILE%/.yam/data/yam.db` | 掌上考研分数原始记录、研招网院系、fetch_log |
| Tauri 桌面库 | `%USERPROFILE%/.yam/data/yam-desktop.db` | 同步后的工作区学校、计划和年份模型 |

源库调查规模：

| 对象 | 数量 |
|---|---:|
| 专业 | 4 |
| 学校记录 | 855 |
| 院系/方向记录 | 2,961 |
| 分数记录 | 3,855 |
| 招生计划记录 | 781 |
| fetch_log | 1,168 |

分数覆盖：

| 专业 | 有分数学校 | 源分数记录 |
|---|---:|---:|
| 081200 计算机科学与技术 | 267 | 1,130 |
| 083500 软件工程 | 136 | 518 |
| 085400 电子信息 | 190 | 1,302 |
| 085410 人工智能 | 215 | 905 |

---

## 二、当前链路

```text
掌上考研 /school/schoolScore
  ↓ 每校×年份请求
6位专业 > 4位一级学科 > 2位门类
  ↓ 每年只保留最高匹配级别
Python score_lines
  ↓ 同校+专业+年份分别 MIN(total/各单科)
sync_to_tauri.load_score_lines
  ↓ 同一校级聚合结果复制给该校每个研招网计划
workspace_department_years + workspace_plan_years
  ↓ 所有年份再取最小值
workspace_schools.min_score
  ↓
Rust 排序/筛选/分页
  ↓
前端“最低分”、趋势、比较、导出
```

关键代码：

- 6/4/2 位匹配：[zhangshangkaoyan.py](file:///d:/yam/yam/crawler/zhangshangkaoyan.py#L444-L484)
- 源分数保存：[db.py](file:///d:/yam/yam/storage/db.py#L264-L295)
- 按年按列 MIN：[sync_to_tauri.py](file:///d:/yam/yam/scripts/sync_to_tauri.py#L441-L476)
- 分数复制到每个计划：[sync_to_tauri.py](file:///d:/yam/yam/scripts/sync_to_tauri.py#L664-L683)
- 跨年份最小值写入学校：[sync_to_tauri.py](file:///d:/yam/yam/scripts/sync_to_tauri.py#L551-L608)
- Rust 计划最新分数：[db.rs](file:///d:/yam/yam-desktop/src-tauri/src/db.rs#L2204-L2265)
- 前端院校最低分：[WorkspacePage.tsx](file:///d:/yam/yam-desktop/src/pages/WorkspacePage.tsx#L1696-L1703)
- 前端计划分数：[WorkspacePage.tsx](file:///d:/yam/yam-desktop/src/pages/WorkspacePage.tsx#L2223-L2237)

---

## 三、语义契约

### 3.1 为什么现有 `min_score` 不足

当前 `min_score` 同时可能指：

- 专业复试线；
- 院系复试线；
- 一级学科参考线；
- 门类/国家线；
- 同校同年多个来源记录中的最低总分；
- 所有历史年份中的最低值；
- 用户理解的“录取最低分”。

这些含义不可互换。一个数值字段不能同时承担指标类型、匹配范围、来源可信度和年份回退状态。

### 3.2 双轴模型

每条分数证据至少需要两条独立语义轴：

```text
metric_type：这是什么指标
match_scope：这条证据适用于哪个粒度
```

#### `metric_type`

| 值 | 含义 |
|---|---|
| `admission_min` | 实际录取考生最低初试分，必须来自录取名单或明确的录取统计 |
| `retest_cutoff` | 进入复试的最低要求 |
| `unknown_cutoff` | 来源给了分数线，但无法确认具体线型 |

说明：`department_cutoff`、`major_cutoff` 不应放在 `metric_type`，因为“院系/专业”属于适用范围，而不是指标性质。

#### `match_scope`

| 值 | 含义 |
|---|---|
| `exact_direction` | 院校、专业、院系和方向均可确认 |
| `department` | 院系可确认，方向不可确认 |
| `major` | 6 位专业代码可确认，院系不可确认 |
| `first_level` | 4 位一级学科参考 |
| `category` | 2 位门类参考 |
| `school_major_aggregate` | 同校同专业同年多条记录聚合 |
| `unknown` | 适用范围无法确认 |

### 3.3 其他一等字段

建议的证据对象：

```text
ScoreEvidence =
  school + major + source_department + direction
  + requested_year + effective_year + fallback_year
  + metric_type + match_scope
  + total + subject_scores
  + fetch_status + confidence
  + source + source_endpoint + raw_evidence
  + retrieved_at + match_note
```

#### `fetch_status`

```text
not_requested
success_with_data
success_empty
partial
school_not_found
http_error
api_error
parse_error
write_error
```

请求失败、成功空数据和未请求必须是不同状态。

#### `confidence`

```text
high / medium / low / unusable
```

建议规则：

| 条件 | 可信度 |
|---|---|
| 来源明确线型，6 位精确，完整原始记录，无聚合 | high |
| 6 位代码匹配，但来源未明确线型 | medium |
| 4 位/2 位参考线 | medium 或 low |
| 校级多记录聚合后复制到计划 | low |
| 请求失败、空数据、无法解释 | unusable |

### 3.4 与现有字段的兼容

| 现有字段 | 当前问题 | 兼容策略 |
|---|---|---|
| `score_scope` | 混合了匹配范围与展示名称 | 保留兼容，改由 `match_scope` 映射生成 |
| `source` | 只说明提供方，不能定位原始记录 | 保留，增加 endpoint/record/raw evidence |
| `updated_at` | 实际多为本地采集时间 | 明确为 retrieved_at，不能当来源发布时间 |
| `match_note` | 当前靠中文字符串反向判断机器类型 | 保留人类说明，不再承担机器逻辑 |

现有映射：

```text
exact_direction       -> exact_direction
department            -> department
school_major          -> school_major_aggregate
first_level_reference -> first_level
category_reference    -> category
```

---

## 四、匹配与展示决策矩阵

| 原始证据 | 处理 | 能否作为方向主分数 | 能否参与专业主列表排序 |
|---|---|---:|---:|
| 6位代码 + 院系/方向可靠对应 | 精确计划候选 | 是 | 是 |
| 6位代码，院系无法对应 | 专业级分数候选 | 否 | 可，但必须标明指标 |
| 4位代码 | 一级学科参考线 | 否 | 默认否 |
| 2位代码 | 门类参考线 | 否 | 默认否 |
| 同校同年多个院系不同线 | 分别保留原始记录 | 仅可靠匹配后 | 不直接聚合 |
| 无法对应院系但业务需要汇总 | 建立显式 aggregate，保留被选记录 | 否 | 只能作为低可信参考 |
| 请求成功但空列表 | success_empty | 否 | 否 |
| API/网络/解析失败 | 对应失败状态 | 否 | 否 |
| 最新招生年份无分数 | 明示年份缺失 | 否 | 不得静默冒充最新年 |
| 使用上一可用年份 | 必须显式 effective_year/fallback_year | 视原 scope | 必须按数据年份展示 |

严禁规则：

1. 4 位、2 位参考线不得升级成 6 位专业精确线。
2. 校级聚合值不得复制后冒充方向分数线。
3. 不得分别取各列 MIN 后拼成一条新记录。
4. API 失败不得当成 success_empty。
5. success_empty 不得永久阻止以后按年份补采。
6. 最新招生年份与最新分数年份不得共用一个 `latest_year` 字段。

---

## 五、测试轮次与关键发现

### 轮次 1：复现用户样本

#### 西北农林科技大学 / 085410

桌面库年份值：

| 年份 | 分数 | 单科 | scope |
|---|---:|---|---|
| 2026 | 264 | 35/35/53/53 | school_major |
| 2025 | 260 | 34/34/51/51 | school_major |
| 2024 | 273 | 37/37/56/56 | school_major |
| 2023 | 273 | 38/38/57/57 | first_level_reference |

院校视图显示 260。原因不是最新年份选择错误，而是同步阶段把所有年份中的最小值写入 `workspace_schools.min_score`。

#### 武汉大学 / 085410

桌面库年份值：

| 年份 | 分数 | scope | 原始匹配 |
|---|---:|---|---|
| 2025 | 285 | first_level_reference | code=0854 |
| 2024 | 335 | school_major | code=085410 |
| 2023 | 360 | first_level_reference | code=0854 |

2026 招生计划存在，但掌上考研 `schoolScore` 对 `school_id=3, year=2026` 返回：

```text
专硕获取国家线数据异常
```

因此缺的是分数来源数据，不是研招网招生计划。当前模型没有保存“2026 API 失败”，页面只能看到最新可用分数年份 2025。

### 轮次 2：验证指标语义

西北农林官方 2025 录取统计显示：

```text
085410 人工智能 全日制
最高分 403 / 最低分 284 / 平均分 322
```

掌上考研 `schoolScore` 返回 260/34/34/51/51。两者不是同一指标：前者是录取统计，后者是分数线/进入复试要求。结论：当前 `min_score` 不能解释为录取最低分。

官方来源：

- https://yz.nwafu.edu.cn/xxgk/lnlqfsxhz/247c810e59844397b607074c979b6fd3.htm

### 轮次 3：验证按列 MIN 是否生成虚假记录

武汉大学 2025 的两条原始 `0854` 记录：

| 原始院系 | 总分 | 政治 | 英语 | 业务一 | 业务二 |
|---|---:|---:|---:|---:|---:|
| 11406 | 285 | 50 | 50 | 80 | 90 |
| 26829 | 350 | 50 | 50 | 100 | 85 |

当前 SQL 分别取各列 MIN，生成：

```text
285 / 50 / 50 / 80 / 85
```

这条组合在原始接口中不存在。它把总分和前三科取自第一条记录，把业务二取自第二条记录。

另一个清晰样本：北京师范大学 081200 / 2025：

| 原始院系 | 总分 | 政治 | 英语 | 业务一 | 业务二 |
|---|---:|---:|---:|---:|---:|
| 14100 | 305 | 49 | 49 | 90 | 90 |
| 14108 | 307 | 35 | 35 | 90 | 90 |

当前聚合生成不存在的 `305/35/35/90/90`。

### 轮次 4：验证同校同年多院系压平

中国石油大学（华东）085410 / 2026 同年有 3 条不同总分，范围 278–392。当前同步只保留最低值，再复制给该校所有研招网方向。该行为无法表达不同院系或不同计划线。

### 轮次 5：验证成功空数据

源库存在 32 个专业-学校组合的 `fetch_log(score_lines)=success`，但没有任何 `score_lines`：

| 专业 | 学校数 |
|---|---:|
| 083500 | 1 |
| 085400 | 29 |
| 085410 | 2 |

示例包括上海交通大学 085400。成功空列表可能是真实无数据，也可能包含响应结构或部分年份异常；当前模型无法区分。

### 轮次 6：检查增量补采逻辑

CLI 和 NiceGUI 两条路径均先计算：

```python
pending_schools = 未成功采集院系的学校
score_pending = pending_schools 中未成功采集分数的学校
```

见：

- [cli.py](file:///d:/yam/yam/cli.py#L179-L198)
- [fetcher.py](file:///d:/yam/yam/fetcher.py#L145-L168)

这意味着分数采集集合依赖院系采集集合。院系已经成功、但分数年份缺失或需要重试的学校，不会进入普通补采流程。

---

## 六、全库根因分类审计结果

### 6.1 6位/4位/2位匹配分布

| 专业 | 6位或无法再确认 | 一级学科记录/学校 | 门类记录/学校 |
|---|---:|---:|---:|
| 081200 | 1,012 | 4 / 2 | 114 / 25 |
| 083500 | 443 | 3 / 1 | 72 / 17 |
| 085400 | 1,302 | 0 | 0 |
| 085410 | 792 | 74 / 33 | 39 / 16 |

注意：旧表没有保存 `raw_code`。所谓“6位或无法再确认”只表示 note 中没有 4/2 位标记，不能在迁移后追溯证明每条都是 6 位精确记录。

同步后一级学科/门类参考线被复制为 934 条 `workspace_plan_years`：

| 专业 | 一级学科计划年份 | 门类计划年份 |
|---|---:|---:|
| 081200 | 12 | 409 |
| 083500 | 21 | 260 |
| 085410 | 177 | 55 |

### 6.2 同校同年多原始记录

| 专业 | 多记录组 | 涉及原始行 | 总分不同组 |
|---|---:|---:|---:|
| 081200 | 121 | 314 | 48 |
| 083500 | 23 | 50 | 9 |
| 085400 | 314 | 998 | 131 |
| 085410 | 149 | 386 | 66 |
| 合计 | 607 | 1,748 | 254 |

254 组同校同专业同年存在不同总分，证明“每年天然只有一条校级线”的假设不成立。

### 6.3 按列 MIN 生成不存在组合

| 专业 | 虚假组合组数 |
|---|---:|
| 081200 | 3 |
| 083500 | 1 |
| 085400 | 3 |
| 085410 | 4 |
| 合计 | 11 |

数量不大，但严重性高：这是确定性的事实错误，不是展示措辞问题。

### 6.4 历史最小值替代最新年份

| 专业 | 受影响学校 |
|---|---:|
| 081200 | 192 |
| 083500 | 92 |
| 085400 | 150 |
| 085410 | 160 |
| 合计 | 594 |

总计 808 个“专业-学校”有分数，594 个的历史最小值与最新可用年份值不同，影响比例约 73.5%。该规则同时影响院校视图显示、排序、分数区间筛选和导出。

### 6.5 最新可用分数年份

| 专业 | 最新为2026 | 2025 | 2024 | 2023 |
|---|---:|---:|---:|---:|
| 081200 | 249 | 10 | 7 | 1 |
| 083500 | 123 | 9 | 4 | 0 |
| 085400 | 180 | 7 | 3 | 0 |
| 085410 | 212 | 1 | 2 | 0 |

武汉大学 085410 属于“最新可用年份为 2025”的唯一学校之一。页面当前没有说明 2026 请求失败。

### 6.6 年份覆盖不足

院系采集成功，但分数年份少于 4 年：

| 专业 | 学校数 |
|---|---:|
| 083500 | 37 |
| 085400 | 110 |
| 085410 | 103 |
| 合计 | 250 |

`081200` 当前成功学校均达到 4 年，因此未出现在结果中。

### 6.7 学校年份复制到计划的放大倍数

| 专业 | 计划年份行 | 学校年份组 | 平均复制倍数 |
|---|---:|---:|---:|
| 081200 | 3,567 | 937 | 3.81× |
| 083500 | 1,629 | 491 | 3.32× |
| 085400 | 2,315 | 618 | 3.75× |
| 085410 | 1,624 | 668 | 2.43× |

一条校级聚合结果平均被复制到 2.43–3.81 个计划。复制本身不一定错误，但如果 DTO 和 UI 不明确这是共享参考线，就会形成大量“看起来像方向分数”的重复数据。

---

## 七、系统性根因

### 根因 1：原始证据在持久化前丢失

采集内存中有 `code`、原始院系名、匹配级别和 API 状态，但 `score_lines` 没有保存 `raw_code`、原始院系名、响应状态和原始记录证据。同步只能通过中文 note 猜测 4/2 位匹配，无法证明其他记录一定是 6 位。

### 根因 2：按列 MIN 而不是选择完整原始记录

`MIN(total)`、`MIN(politics)`、`MIN(english)`、`MIN(special_one)`、`MIN(special_two)` 可分别来自不同记录，生成不存在的组合；`MAX(note/source/updated_at)` 还可能来自另一个记录。

### 根因 3：把所有历史年份最小值写成院校主分数

`workspace_schools.min_score` 实际语义是“所有已采集年份和所有来源记录的全局最小值”，但产品把它展示成没有年份限定的“最低分”。

### 根因 4：校级聚合复制到每个计划

掌上考研院系 ID 与研招网院系 ID 没有稳定映射。同步在无法匹配时把校级聚合复制到全部计划，数据结构因此暗示每个方向都有同一条年份分数。

### 根因 5：采集状态粒度只有学校+任务，没有学校+年份

`score_lines success` 无法区分：

- 每个年份都成功；
- 部分年份成功；
- 全部年份成功但无数据；
- API 业务错误被跳过；
- 响应结构异常。

而增量逻辑只看学校级 success，不能按年份恢复。

### 根因 6：分数采集依赖院系待采集集合

院系已经成功的学校不会再次进入 `pending_schools`，从而也不会进入 `score_pending`。这使“只补分数年份”无法通过普通刷新完成。

### 根因 7：分数年份与招生计划年份没有分开

Rust 的 `latest_year` 是最新可用分数年份，计划来源则是当前研招网招生记录。页面把它们放在同一行，容易让用户理解为“当前招生年份的分数”。

### 根因 8：参考线标签没有约束业务计算

即使 4 位/2 位值已经标为参考线，它仍参与学校主分数、排序、筛选、趋势和导出。标签修复了部分展示问题，但没有修复业务语义。

---

## 八、分阶段修复方案

### 阶段 0：固定黄金样本和审计门禁

目标：防止后续模型改造失去可验证标准。

1. 将本文黄金样本转成自动测试夹具；
2. 保存必要的脱敏原始响应片段或结构化 fixture；
3. 为全库审计建立可重复入口；
4. 门禁至少检查：虚假 MIN 组合、跨年主分数、参考线进入主分数、成功空数据、年份缺失。

### 阶段 1：保全原始证据和逐年采集状态

源库增量字段建议：

```text
raw_code
raw_department_name
metric_type
match_scope
requested_year
effective_year
fetch_status
confidence
raw_evidence_json
retrieved_at
```

新增逐年请求状态表，业务键至少为：

```text
major_code + school_id + requested_year + source
```

必须先完成这一阶段，再重新采集；否则旧链路仍会继续丢失证据。

### 阶段 2：修正采集任务集合

分数任务独立计算：

```text
department_pending = 根据院系任务状态
score_pending_years = 根据每校每年分数任务状态
```

不得再从 `pending_schools` 派生 `score_pending`。API 错误、成功空数据和部分成功采用不同重试策略。

### 阶段 3：停止按列 MIN 和方向复制

1. 每条原始分数保持完整 tuple；
2. 如需汇总，必须选择一条明确原始记录，或建立显式 aggregate；
3. aggregate 保存被选记录 ID、输入数量和算法；
4. 无可靠院系映射时，只能挂在学校+专业参考层，不写成每个计划独立年份分数；
5. `exact_direction/department` 只有在有证据匹配时才能生成。

### 阶段 4：拆分最新分数与历史统计

建议 DTO 显式返回：

```text
latest_score_year
latest_score
latest_score_metric_type
latest_score_match_scope
latest_score_status
latest_plan_year
historical_min_score（仅分析用途）
```

院校主列表默认显示最新可用分数及年份，不显示历史全局最小值。4 位/2 位参考线默认不参与“精确专业分数”排序和筛选。

### 阶段 5：前端语义与导出

1. “最低分”改为来源真实含义；在 metric_type 未确认前使用“分数线”，不能称“录取最低分”；
2. 计划行明确区分“计划年份”和“分数年份”；
3. 最新年份缺失时显示“2026 分数线请求失败/暂无数据，当前最近可用为 2025”；
4. 参考线只在参考区域展示；
5. 排序、筛选、趋势、比较和导出使用相同语义规则。

### 阶段 6：单独接入录取统计

如果产品需要录取最低分、平均分和最高分，应建立独立 `admission_statistics` 模型：

```text
year + school + major + department + study_mode
+ admitted_min + admitted_avg + admitted_max + admitted_count
+ source + evidence
```

不得把录取统计写回当前 `score_lines.total`。

---

## 九、建议的实施优先级

| 优先级 | 项目 | 原因 |
|---|---|---|
| P0 | 停止按列 MIN 生成虚假组合 | 确定性事实错误 |
| P0 | `workspace_schools` 改为最新年份语义 | 当前影响 594 个专业-学校组合 |
| P0 | 逐年 fetch_status + 分数任务独立补采 | 否则缺失年份不可恢复 |
| P1 | 保存 raw_code/raw evidence | 否则无法可靠迁移和复核 |
| P1 | 校级参考层与计划年份解绑 | 防止参考线冒充方向线 |
| P1 | 参考线退出精确分数排序筛选 | 标签之外修复业务语义 |
| P2 | 接入官方录取统计 | 新指标，不能与本轮修复混做 |

不建议只做：

- 手工修正武汉大学或西北农林数字；
- 只改“最低分”文案；
- 只增加更多 `score_scope` 标签；
- 在旧聚合结果上继续推断方向精确线；
- 重新同步旧源库后宣称问题修复。

---

## 十、可重复审计查询

### 10.1 按列 MIN 是否生成不存在组合

```sql
WITH agg AS (
  SELECT major_code, school_id, year,
         MIN(total) total,
         MIN(politics) politics,
         MIN(english) english,
         MIN(special_one) special_one,
         MIN(special_two) special_two
  FROM score_lines
  GROUP BY major_code, school_id, year
)
SELECT a.*
FROM agg a
WHERE NOT EXISTS (
  SELECT 1 FROM score_lines s
  WHERE s.major_code = a.major_code
    AND s.school_id = a.school_id
    AND s.year = a.year
    AND COALESCE(s.total, -1) = COALESCE(a.total, -1)
    AND COALESCE(s.politics, -1) = COALESCE(a.politics, -1)
    AND COALESCE(s.english, -1) = COALESCE(a.english, -1)
    AND COALESCE(s.special_one, -1) = COALESCE(a.special_one, -1)
    AND COALESCE(s.special_two, -1) = COALESCE(a.special_two, -1)
);
```

### 10.2 历史最小值与最新年份值差异

```sql
WITH yearly AS (
  SELECT major_code, school_id, year, MIN(total) score
  FROM score_lines
  WHERE total IS NOT NULL
  GROUP BY major_code, school_id, year
), latest AS (
  SELECT major_code, school_id, MAX(year) latest_year
  FROM yearly
  GROUP BY major_code, school_id
)
SELECT y.major_code, y.school_id,
       MIN(y.score) all_year_min,
       MAX(CASE WHEN y.year = l.latest_year THEN y.score END) latest_score
FROM yearly y
JOIN latest l USING (major_code, school_id)
GROUP BY y.major_code, y.school_id
HAVING all_year_min <> latest_score;
```

### 10.3 success 但没有分数记录

```sql
SELECT f.major_code, f.school_id
FROM fetch_log f
WHERE f.task_type = 'score_lines'
  AND f.status = 'success'
  AND NOT EXISTS (
    SELECT 1 FROM score_lines s
    WHERE s.major_code = f.major_code
      AND s.school_id = f.school_id
  );
```

### 10.4 参考线进入计划年份

```sql
SELECT p.major_code, y.score_scope,
       COUNT(*) plan_year_rows,
       COUNT(DISTINCT p.school_id) schools
FROM workspace_plans p
JOIN workspace_plan_years y ON y.plan_key = p.plan_key
WHERE y.score_scope IN ('first_level_reference', 'category_reference')
GROUP BY p.major_code, y.score_scope;
```

---

## 十一、关键文件

| 文件 | 作用 |
|---|---|
| [zhangshangkaoyan.py](file:///d:/yam/yam/crawler/zhangshangkaoyan.py) | 掌上考研分数采集与 6/4/2 位匹配 |
| [db.py](file:///d:/yam/yam/storage/db.py) | Python 源库 schema 与分数保存 |
| [cli.py](file:///d:/yam/yam/cli.py) | 桌面后端采集任务集合和 fetch_log |
| [fetcher.py](file:///d:/yam/yam/fetcher.py) | NiceGUI 采集任务集合和状态 |
| [sync_to_tauri.py](file:///d:/yam/yam/scripts/sync_to_tauri.py) | 按列 MIN、跨年份最小、计划复制 |
| [db.rs](file:///d:/yam/yam-desktop/src-tauri/src/db.rs) | 工作区查询、排序、筛选、最新年份 |
| [workspace-utils.ts](file:///d:/yam/yam-desktop/src/lib/workspace-utils.ts) | 前端粒度标签和导出 |
| [WorkspacePage.tsx](file:///d:/yam/yam-desktop/src/pages/WorkspacePage.tsx) | 院校/计划视图展示 |

---

## 十二、最终结论

本问题不是“掌上考研某几个数字不准”，也不是只靠增加粒度标签能够解决。

系统性链路是：

```text
原始记录身份和请求状态未持久化
→ 同校同年按列 MIN
→ 校级结果复制到所有方向
→ 所有历史年份再取最小值作为学校主分数
→ 参考线继续参与主列表排序筛选
→ 页面无法解释最新招生年份为何没有对应分数
```

因此正确修复顺序必须是：

```text
证据与状态 → 采集任务 → 原始记录/聚合 → 年份语义 → 查询规则 → 展示与导出
```

先改 UI 或手工清洗数字，只会隐藏问题，无法阻止下一次采集和同步重新生成同类错误。

---

## 十三、由分数线问题反映出的通用架构风险

分数线问题说明当前系统虽然完成了 `Major → School → Department → Plan → YearScore` 结构规范化，但仍缺少四个通用层次：

1. **原始证据层**：原始响应身份、字段、请求状态和抓取时间必须可追溯。
2. **来源映射层**：掌上考研院系与研招网院系不能仅靠名称或复制隐式关联，映射必须有规则和置信度。
3. **时间版本层**：当前招生快照、历史计划、分数年份、录取年份和同步时间必须分开。
4. **不确定性层**：未知、未公布、请求失败、成功空数据、推断和 fallback 不能统一压成 `0`、空字符串或 `success`。

推荐的数据处理流程：

```text
Raw Evidence
→ Source Entity
→ Canonical Mapping
→ Year / Version
→ Derived Aggregate
→ Product Projection
```

每一步必须能回答：输入记录是什么、用了什么规则、输出是什么、时间属于哪一年、状态是什么、置信度多高。

同类风险后续还应审计：

- 当前招生人数是否被复制成历史人数；
- 当前考试科目是否被显示成历史科目；
- 研究方向 fallback 是否在收藏、搜索和导出中冒充真实方向；
- `plan_key` 是否把年度可变字段当成长期身份；
- 多条件筛选是否由不同年份分别满足；
- 导出是否丢失指标类型、年份、fallback 和共享参考线身份；
- normalized/legacy 一致性测试是否只证明“两边一致”，却没有验证事实不变量。

本轮实施边界：只闭环 ISSUE-030 分数证据、逐年状态、聚合、查询和展示；其他模块只记录风险，不顺手重构。

---

## 十四、可执行修复清单

### 14.1 Python 源库与采集

- [x] `score_lines` 保存 `raw_code/raw_department_name/metric_type/match_scope/confidence/raw_evidence_json`。
- [x] 新增按 `major_code + school_id + requested_year + source` 唯一的逐年采集状态。
- [x] `fetch_score_lines_batch` 返回每校每年状态，不再把单年 API 失败静默跳过。
- [x] 分数待采集集合独立于院系待采集集合。
- [x] `success_empty`、`api_error`、`school_not_found`、`success_with_data` 分开保存。

### 14.2 同步与聚合

- [x] 删除按列 `MIN`，保留完整原始 tuple。
- [x] 无可靠院系映射时只生成显式学校专业聚合证据，不冒充方向精确线。
- [x] `workspace_schools` 主分数改为最新可用年份，不再使用历史全局最小值。
- [ ] `0` 不再代表未知或失败；使用状态字段决定是否有值。
- [x] 分数年份与当前招生人数解绑，历史年份不再重复当前人数。

### 14.3 Rust、筛选与前端

- [x] DTO 拆分 `latest_score_year` 与 `latest_plan_year`；来源未提供可靠目录年份时另以 `plan_year_status=unknown` 表达，不从分数年份推断。
- [x] 参考线默认不参与精确专业分数排序和筛选。
- [x] 单科组合筛选必须由同一年度记录同时满足。
- [x] 页面明确显示分数数据年份、状态、指标、粒度和最近可用年份。
- [x] 方向 fallback 返回 `label_type/is_fallback`，考试科目和专项计划不能冒充真实方向。
- [ ] 导出保留指标、粒度、年份、状态、置信度和证据说明。

### 14.4 数据不变量测试

- [x] 同步后的分数 tuple 必须对应一条原始记录或显式 aggregate。
- [x] 4位/2位参考线不能成为方向精确线。
- [x] API 失败不能写成成功空数据。
- [x] 院校主分数必须等于最新可用年份的明确记录。
- [x] 当前招生人数不能自动复制成历史人数。
- [x] 同一组单科筛选条件必须由同一年满足。

---

## 十五、第一轮实施结果

已完成：

- Python源库兼容新增原始代码、来源院系、指标类型、匹配范围、可信度和原始证据字段。
- 新增逐学校、逐年份、逐来源请求状态；分数任务与院系任务解耦，失败和缺失年份可独立补采。
- 同步时每年选择一条完整原始记录，停止对总分和单科分别取`MIN`；武汉大学黄金样本已由自动测试锁定。
- 院校主分数改为最新可用专业级记录；4位/2位参考线退出主分数年份、排序和筛选。
- 当前招生人数不再复制到每个历史分数年份；单科组合筛选改为同一年度同时满足。
- 方向fallback增加`label_type/is_fallback`，前端和导出明确分数年份、来源与匹配说明。
- 自动门禁通过：Python 10/10、前端45/45、Rust24/24、TypeScript、生产构建、compileall、npm audit和IDE diagnostics均通过。

转入 ISSUE-031 的后续模型边界：

- 无可靠院系映射的学校专业参考记录仍会投影到计划年份表，但已明确标为`school_major`，尚未拆成独立共享参考实体。
- `0`与未知状态尚未在所有工作区表中完全解耦。
- 当前来源没有可靠计划年份时，`latest_plan_year`只能保持兼容/未知，不能推断为分数年份。
- 官方录取最低分、平均分和最高分仍应作为独立`admission_statistics`模型后续接入。

## 十六、真实库重采与界面复验（2026-07-30）

- 已备份真实源库和桌面库，备份文件保存在用户数据目录，未手工修改分数数字。
- 定向重采`085410`：217所学校、905条源分数记录；每条记录均保存`raw_code`和`raw_evidence_json`。
- 逐年状态确认：武汉大学2026为`api_error`，西北农林2026为`success_with_data`且总分264。
- 同步到桌面库：514个计划、1624条计划年份记录；所有投影分数组合均能对应源库完整记录，虚假组合数为0；历史分数年份招生人数非零数为0。
- 主分数不变量通过：201个有专业级主分数的学校全部匹配最新可用专业级记录；normalized模型状态为`ready`。
- 真实Rust查询确认：武汉大学主分数为2024/335，2025/285保留为`first_level_reference`；西北农林主分数为2026/264。
- CDP页面确认：计划行不再用最新参考线285覆盖335；无主分数院校显示“暂无”；招生人数0显示“未提供”。
- 本轮新增修复：计划展开默认选择最新专业级分数、0值展示语义修正、`--force`同时清理逐年状态。
- 用户复验进一步发现当前计划人数被错误读取为历史分数年份人数；现已让Rust DTO直接返回`workspace_plans.enrollment_count`，武汉大学各计划为37/31，西北农林全日制/非全日制为10/30。
- 历史分数表已移除招生人数列和招生人数趋势，避免把当前招生快照误解为历年人数；页面统一使用“当前计划招生人数”。
- 武汉大学2025的285明确来自掌上考研两条`code=0854`一级学科记录，不是`085410`人工智能专业线，仅保留为详情参考证据。
- 分数逐年请求状态已同步到桌面库；院校视图不再统一显示“暂无”，而是区分专业线、一级学科参考线、门类参考线、成功空数据和API获取失败。
- 武汉大学院校提示同时保留最近专业线335，并说明2026接口失败与2025一级学科参考线285；山东大学/中山大学显示2026一级学科参考线，西安交大显示2026门类参考线。
- 多专业院校卡片不再把不同专业分数压成一个值，改为“多个专业，展开查看”，展开后按专业分别解释。
- 院校招生人数按源院系ID、学习方式、考试方式和人数去重，避免方向复制导致重复相加；武汉大学由136修正为68，西北农林由90修正为40。
- ISSUE-030 的用户可见错误、真实数据闭环和自动验证已完成；共享参考实体、未知状态、可靠计划年份和录取统计模型转入 ISSUE-031，不再阻塞本 ISSUE 关闭。
- ISSUE-031 第二阶段已将当前招生目录保存为版本化快照；现有来源未提供目录年份时保持`NULL/unknown`，页面显示“未知”，历史分数年份继续独立展示。

---

## 十七、变更历史

| 日期 | 变更 |
|---|---|
| 2026-07-30 | 初始版本：完成语义契约、黄金样本、真实双库根因审计、影响量化和分阶段修复方案 |
| 2026-07-30 | 补充通用架构风险、数据处理分层与可执行修复清单，进入实施阶段 |
| 2026-07-30 | 完成第一轮兼容式修复、专项不变量测试和完整自动门禁；保留真实库重采集/同步审计及剩余模型边界 |
| 2026-07-31 | 完成真实库重采、同步、事实不变量审计、UI复验和展示收尾；关闭 ISSUE-030，通用模型边界转入 ISSUE-031 |
