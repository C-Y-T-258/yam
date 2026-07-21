# ISSUE-023 研究记录：专业目录更新如何从 30 分钟压到 8 分钟

> 记录 ISSUE-023（专业目录更新耗时 30 分钟+）从串行 Playwright multi-context 到 httpx + Playwright 激活方案的完整调优过程、每一轮的决策依据、限流实测数据和最终方案。
> 本文档重在"过程可追溯"：每一轮为什么调、调了什么、看到什么数据、基于数据做了什么决策。与 [issue-015-research.md](file:///d:/yam/docs/issue-015-research.md) 同属"踩坑过程可复现"系列。

---

## 一、问题与约束

### 1.1 问题

设置页"更新专业目录"流程需要探测研招网全部 219 个一级学科（yjxkdm）及其下属二级学科（zydm），写入 `data/majors_realtime.json` 供桌面端选择专业页加载。旧方案 `update_majors_catalog.py` 用 Playwright multi-context 单进程串行跑，实测耗时 **30 分钟+**，用户体验差。

### 1.2 已确认的服务端约束

- `zys.do`（专业列表接口）：按 `zydm`（二级学科代码）查询，返回该院系开设的所有招生方向。同一个 `zydm` 在一个登录会话内可多次调用，但高并发会触发"访问太频繁"限流。
- `zys.do` 的限流是 **IP 级**而非 session 级：30 并发立即触发雪崩式限流；15 并发 + 400ms 间隔 + 指数退避可稳定。
- `zydetail.do`（专业详情页）：用于建立 ZSML session 上下文，激活后续 `zys.do` 调用所需的 `JSESSIONID`。
- 同一 session 下，`initial_zydm`（yjxkdm+"00"）第二次调用会返回"请登录"——这是 ISSUE-015 发现的"同 session 同 param 第 2 次返回请登录"限制在 `zys.do` 上的体现。**绕过方法**：用独立 cookie jar（独立 session）重新调用。
- 专业学位（0854 等）研招网按一级学科招生，`zys.do` 列表页返回 `totalCount=0` + 空 list 是**真实情况**，不是 bug（详见 [ISSUE-018](file:///d:/yam/docs/known-issues.md)）。
- `pageSize` 被服务端忽略，固定返回 10 条；但 `zys.do` 的 `totalCount` 通常 ≤ 10，单次调用即可拿全，不需要翻页（与 `zydws.do` 不同）。

### 1.3 目标

把 219 个 yjxkdm 的完整目录更新从 30 分钟+ 压到 **10 分钟以内**，且不触发研招网限流封禁、不丢数据（0 个 0-majors、0 退化）。

### 1.4 zydm 编码规则（枚举的基础）

每个 yjxkdm（4 位一级学科代码，如 `0812`）下的二级学科 zydm（6 位）编码规则：

| 段 | 编码 | 含义 |
|---|---|---|
| base | `XX00`-`XX09` | 标准二级学科（如 `081200` 计算机科学与技术、`081201` 计算机系统结构） |
| J 自设 | `XXJ0`-`XXJ9` | 教育部自设交叉学科（如 `0812J1` 人工智能，早期教育部自设） |
| Z 交叉 | `XXZ0`-`XXZ9` | 高校自设交叉学科（如 `0779Z1` 流行病与卫生统计学） |

枚举策略就是遍历这 3 段共 30 个候选 zydm，对每个调一次 `zys.do`，命中即收录。配合"连续 N 个空响应 break"提前终止无效段。

---

## 二、测试轮次日志

### 轮次 0：前期方案复盘

**背景**：在开展本次系统调优前，`update_majors_catalog.py` 已有两种实现尝试，均未能把耗时压到 10 分钟以内。下面记录每种尝试的上下文和失败表现，说明为什么最终必须放弃"Playwright multi-context 全程接管"的思路。

#### 尝试 0.1：串行 for-loop + Playwright multi-context

**当时的思路**：遍历 219 个 yjxkdm，每个用 `MajorsSearcher.search_by_yjxkdm` 串行查询。每次查询启动独立 context，访问详情页激活 session，枚举 zydm。

**当时的代码结构（简化）**：
```python
for yjxkdm, yjxkmc, mldm, mlmc in yjxkdm_list:
    searcher = MajorsSearcher(headless=True)
    majors = await searcher.search_by_yjxkdm(yjxkdm, ...)
    catalog[mldm]["disciplines"][yjxkdm]["majors"].extend(majors)
    if count % INCREMENTAL_SAVE_INTERVAL == 0:
        save_partial(catalog)
```

**观察到的现象**：
- 每个 yjxkdm 平均 8-10 秒（含启动 context、访问首页、访问详情页、枚举 30 个 zydm）。
- 219 × 8s ≈ 29 分钟，实测 30 分钟+。
- 数据完整但太慢。
- 1465 个 majors，其中 69 个专业学位返回 0 majors（缺 fallback 兜底）、50 个学术学位异常 fallback（限流导致枚举全失败）。

**结论**：串行无法满足 10 分钟目标，必须并发。但 Playwright context 启动开销大，纯 Playwright 并发能提到多少存疑。

**调整**：进入轮次 1，尝试单 context 多 page 并发。

---

#### 尝试 0.2：aiohttp 直接请求（早期放弃）

**当时的思路**：既然 `zys.do` 是普通 POST 接口，用 aiohttp 直接并发请求应该比 Playwright 快得多。从 Playwright 提取 cookies 后转 aiohttp。

**操作**：用 Playwright 登录提取 cookies，用 aiohttp 并发调 `zys.do`。

**观察到的现象**：
- aiohttp 直接请求触发"访问太频繁"限流。
- 与 Playwright `page.evaluate` 在浏览器环境内 fetch 行为不一致。

**当时的结论**（记录在 commit `4228586` 的 message 里）：
> aiohttp 直接请求方案不可行（触发限流），必须用 Playwright page.evaluate 在浏览器环境内 fetch。

**事后复盘（轮次 5 推翻此结论）**：
这个结论是**错的**。当时 aiohttp 失败的真正原因是：
1. 多个 aiohttp 请求共享同一份 Playwright 提取的 cookies（同一 session），命中"同 session 同 param 第 2 次返回请登录"限制。
2. 没有给每个 yjxkdm 用独立 cookie jar，导致 session 冲突。
3. 没有控制请求间隔和并发数，触发 IP 级限流。

轮次 5 用 httpx（与 aiohttp 同类）+ 独立 cookie jar + 限流退避成功跑通，证明"直接请求方案"本身可行，关键是 session 隔离和限流控制。这个教训记录在 [第五章 踩过的坑](#五踩过的坑)。

**调整**：暂时放弃 aiohttp，回到 Playwright `page.evaluate` 路线。

---

### 轮次 1：单 context 多 page 并发（CONCURRENCY=4）

**假设**：单个 Playwright context 下开多个 page，每个 page 独立持有 `JSESSIONID`，可以并发调 `zys.do` 而不冲突。用 `asyncio.gather` 按批并发，批间 sleep 避免限流。

**commit**：`4228586` fix ISSUE-023: update_majors_catalog.py 改单 context 多 page 并发

**操作**：
1. 新增常量 `CONCURRENCY = 4`、`BATCH_PAUSE = 2.0`。
2. 主循环从串行 for-loop 改为按批 `asyncio.gather` 并发。
3. 保留 `--login`/`--resume` 兼容、`YAM_MAJORS_UPDATE_PROGRESS`/`DONE` 协议、`PARTIAL_JSON` 增量保存（改为每批保存一次）。
4. 每个 page 用 `page.evaluate` 在浏览器环境内 fetch `zys.do`。

**当时的代码结构（简化）**：
```python
CONCURRENCY = 4
BATCH_PAUSE = 2.0

for batch_start in range(0, total, CONCURRENCY):
    batch = pending[batch_start : batch_start + CONCURRENCY]
    tasks = [_run_one(item) for item in batch]  # 每个 item 内部 page.evaluate fetch
    results = await asyncio.gather(*tasks)
    save_partial(catalog)
    await asyncio.sleep(BATCH_PAUSE)
```

**数据**：
- 预估 219 个 yjxkdm 从 30 分钟降到 7-8 分钟。
- 实际跑下来比预估慢，且偶发限流。

**关键现象**：
- Playwright `page.evaluate` 的开销比想象大，每个 page 启动 + 详情页导航 + 枚举 30 个 zydm 串行 evaluate，单 yjxkdm 仍需 6-8 秒。
- 并发 4 时总耗时约 12-15 分钟，未达 10 分钟目标。
- 偶发"访问太频繁"，但重试可恢复。

**结论**：
- 单 context 多 page 并发有效但不够快。
- Playwright `page.evaluate` 的开销是瓶颈，每次 evaluate 都要跨进程通信。
- 需要更高的并发度。

**下一步**：调高并发度，缩短批间 sleep。

---

### 轮次 2：调高并发 4→6（CONCURRENCY=6）

**假设**：并发 4 偏保守，调到 6 + 缩短批间 sleep 到 1.5s 应能进一步提速。

**commit**：`f32c998` tune ISSUE-023: 调高 CONCURRENCY 4→6, BATCH_PAUSE 2.0→1.5

**操作**：
```python
CONCURRENCY = 6  # 实测若触发"访问太频繁"可降回 4 或 3
BATCH_PAUSE = 1.5
```

**数据**：
- 用户实测反馈：6 并发触发"访问太频繁"限流。
- 5 个 yjxkdm 返回空，第 6 个卡在重试。

**关键现象**：
- 6 并发在当前网络环境下已超过 `zys.do` 的限流阈值。
- 限流不是立即触发，而是累积式——前几个批次正常，跑到中途开始出现空响应和重试卡死。
- 与 ISSUE-015 中 `dwzys.do` 的"累积式封禁"特性一致。

**结论**：
- 6 并发对 `zys.do` 不安全。
- `zys.do` 的限流是 IP 级的，调高并发度只会更快触发限流，不能简单粗暴提并发。
- 需要降并发 + 错开请求节奏。

**下一步**：系统实测限流特性，找到稳定并发度。

---

### 轮次 3：批次内并发项实时进度展示 + 分段 break 提速

**背景**：在降并发前，先解决"批次内黑盒"问题——用户看到进度条卡在某个批次几分钟不知道发生了什么，且枚举 30 个 zydm 时遇到连续空响应仍傻傻跑完，浪费时间。

**commit**：`2184532` feat ISSUE-023: 加批次内并发项实时进度展示 + 分段 break 提速

**操作**：
1. 新增 `YAM_MAJORS_UPDATE_BATCH_START <batch_num> <total_batches> <batch_info_json>` 协议，批次开始时推送批次内所有 yjxkdm 列表。
2. 新增 `YAM_MAJORS_UPDATE_BATCH_ITEM <yjxkdm> running|done|failed <detail>` 协议，每个 yjxkdm 开始/完成/失败时推送。
3. 枚举逻辑加入分段 break：base 段连续 5 个空响应 break，J/Z 段连续 3 个空响应 break。

**数据**：
- 前端进度展示更细粒度，用户能看到批次内每个 yjxkdm 的实时状态。
- 分段 break 让无交叉学科的 yjxkdm 提前结束枚举（如 0270 统计学只有 2 个标准二级学科，base 段第 3 个就 break，省下 27 次无效调用）。

**关键现象**：
- 分段 break 对小专业提速明显，但对大专业（如 0301 法学 94 个）无影响（本就要跑完）。
- 进度展示让限流问题更可见：用户能清楚看到"第 N 个卡在重试"。

**结论**：
- 进度展示和分段 break 是必要的体验和性能优化，但没解决并发度本身的问题。
- 6 并发限流仍在，需要轮次 4 处理。

---

### 轮次 4：限流实测后降并发 6→3 + 错开请求

**假设**：既然 6 并发触发限流，降到 3 + 批间 sleep 3s + 批内每项启动前随机延迟错开，应该能避开限流。

**commit**：`c41fd91` fix ISSUE-023: 限流实测后降 CONCURRENCY 6→3 + 错开请求

**操作**（diff 核心）：
```python
# 实测发现 6 并发会触发限流（5 个返回空、1 个卡在重试），降到 3 并发 + 错开请求。
CONCURRENCY = 3  # zys.do 按 IP 限流，3 并发 + 错开较安全
BATCH_PAUSE = 3.0  # 让限流恢复
ITEM_STAGGER_MAX = 1.5  # 批内每个 yjxkdm 启动前的随机延迟上限（秒）
```

批内任务单元加入错开延迟：
```python
async def _run_with_sem(item):
    # 错开请求：随机延迟 0 ~ ITEM_STAGGER_MAX 秒
    if ITEM_STAGGER_MAX > 0:
        stagger = random.uniform(0, ITEM_STAGGER_MAX)
        await asyncio.sleep(stagger)
    print(f"YAM_MAJORS_UPDATE_BATCH_ITEM {yjxkdm} running {yjxkmc}", flush=True)
    ...
```

**数据**：
- 3 并发 + 错开后不再触发雪崩限流。
- 预计耗时 30→10-12 分钟（比 6 并发慢但稳定）。

**关键现象**：
- 3 并发稳定，但仍未达 10 分钟目标（10-12 分钟）。
- Playwright `page.evaluate` 的开销仍是瓶颈——即使并发度提到 3，每个 yjxkdm 内部的 30 次 evaluate 还是串行的。
- 瓶颈不在"yjxkdm 之间的并发"，而在"单个 yjxkdm 内部 30 次 zys.do 调用的串行"。

**结论**：
- Playwright multi-context 路线已到极限：并发度受限于 IP 限流（≤3），单 yjxkdm 内部 evaluate 串行无法并发。
- 要突破 10 分钟，必须让单个 yjxkdm 内部的 30 次 `zys.do` 调用也能并发。
- Playwright `page.evaluate` 不适合做单 yjxkdm 内部并发（多 page 共享 context 会 session 冲突）。
- 需要重新评估"直接请求"方案——但要解决轮次 0.2 的 session 隔离问题。

**下一步**：彻底重写，用 Playwright 仅做 session 激活，httpx 接管并发枚举。

---

### 轮次 5：彻底重写为 httpx + Playwright 激活（CONCURRENCY=15）

这是最终方案。核心思想：**Playwright 只用于 session 激活（每个 yjxkdm 独立 context 拿 seed_major + cookies），httpx 用独立 cookie jar 接管 30 个 zydm 的并发枚举**。

**commit**：`1a3fc04` fix ISSUE-023: httpx+Playwright 激活方案，15并发7-8分钟跑完219个yjxkdm

#### 5.1 关键发现：限流是 IP 级而非 session 级

**操作**：用原型脚本 `test_httpx_hybrid.py`（E2-A3）验证 httpx 能否复用 Playwright 激活的 session。

原型流程：
1. Playwright 启动浏览器，访问 zsml 首页 + 详情页激活 session。
2. Playwright 调第 1 次 `zys.do` 拿 seed_major（initial_zydm = yjxkdm+"00"）。
3. 从 Playwright 提取所有 cookies（含激活后的 JSESSIONID）。
4. 关闭 Playwright，用 httpx.AsyncClient 复用这些 cookies 调 `zys.do` 枚举其他 zydm。

**数据**（原型脚本对 0101 哲学 / 0202 应用经济学）：
- httpx 复用 Playwright 激活的 cookies 调 `zys.do` **成功**。
- 0101 哲学拿到 11 majors / 10 distinct zydms，与 Playwright CONCURRENCY=2+retry 一致。
- 0202 应用经济学拿到 71 majors / 21 distinct zydms。

**关键现象**：
- httpx 用 Playwright 激活的 cookies 调不同 zydm 不会返回"请登录"——因为每个 zydm 是**不同的参数组合**，"同 session 同 param 第 2 次返回请登录"限制只针对**同一个 zydm 的第 2 次调用**。
- 只要 httpx 跳过 `initial_zydm`（已被 Playwright 调过），枚举其他 29 个 zydm 全部成功。

**这个发现推翻了轮次 0.2 的结论**：aiohttp/httpx 直接请求本身可行，关键是：
1. 用 Playwright 独立 context 激活 session（拿有效 JSESSIONID）。
2. httpx 用独立 cookie jar，且跳过已调过的 initial_zydm。
3. 控制并发度避免 IP 级限流。

#### 5.2 并发度实测：30 触发限流，15 稳定

**操作**：用 `test_httpx_full_219.py`（E2-G）跑完整 219 个 yjxkdm，参数 `CONCURRENCY=30, ZYDM_SLEEP_MS=500`。

**数据**：
- 30 并发立即触发 IP 级限流，部分 yjxkdm 枚举失败。
- 典型表现：0270 统计学单独跑能拿 2 个，30 并发跑只拿到 1 个 fallback。

**调整**：降到 `CONCURRENCY=15, ZYDM_SLEEP_MS=400`，加限流指数退避。

**最终参数**：
```python
CONCURRENCY = 15  # 每 batch 并发数（实测 30 触发 IP 级限流）
ZYDM_SLEEP_MS = 400  # zys.do 调用间隔，避免触发"访问太频繁"限流
```

**限流退避逻辑**：
```python
# 限流指数退避重试：最多 3 次（2s → 4s → 8s）
retry_count = 0
while err and "访问太频繁" in (err or "") and retry_count < 3:
    backoff = 2 * (2 ** retry_count)  # 2 → 4 → 8
    await asyncio.sleep(backoff)
    lst, total, err = await _call_zys_do_httpx(client, zydm, yjxkdm, xwlx, mldm)
    await asyncio.sleep(sleep_s)
    retry_count += 1
# 连续 3 次限流 break 当前段，进入下一段
if consecutive_rate_limit >= 3:
    break
```

**数据**：
- 15 并发 + 400ms sleep + 指数退避：219 个 yjxkdm 全部成功，0 失败。
- 总耗时 7-8 分钟，达成 10 分钟目标。

#### 5.3 关键修复：first_list 为空时也走 httpx 枚举

**背景**：早期实现中，`_playwright_activate_session` 拿到的 `first_list` 为空时，直接返回空列表跳过枚举。导致 0779 公共卫生与预防医学拿到 0 个 majors（只能 fallback）。

**问题根因**：
- 0779 公共卫生的 `initial_zydm` = `077900`，`zys.do` 返回空 list + totalCount=0。
- 但 0779 下有高校自设交叉学科 `0779Z1` 流行病与卫生统计学等，这些只能在枚举 Z 段时才能拿到。
- 旧逻辑：first_list 空 → 不走枚举 → 0 majors → fallback 注入 `077900`。

**修复**：即使 `first_list` 为空，也走 httpx 枚举。`_playwright_activate_session` 在 first_list 空时用虚拟详情页 URL 激活 session（构造 `zydetail.do?zydm=077900&...`），让后续 httpx 能拿到有效 JSESSIONID：

```python
if first_list:
    # 有 seed_major，用真实 sign 构造详情页 URL
    seed = first_list[0]
    detail_url_with_sign = f"{BASE_URL}/zsml/zydetail.do?...&sign={seed.get('sign', '')}&sign2={seed.get('sign2', '')}"
else:
    # first_list 为空：用 yjxkdm+"00" 构造虚拟详情页 URL 激活 session
    # 这是为了让后续 httpx 枚举能拿到有效的 JSESSIONID
    detail_url_with_sign = (
        f"{BASE_URL}/zsml/zydetail.do?"
        f"zydm={initial_zydm}&zymc={quote(yjxkmc)}"
        f"&xwlx={'zyxw' if xwlx == 'zy' else 'xsxw'}&mldm={mldm}..."
    )
# 访问详情页激活 session 后，first_list 为空时再重试一次
if not first_list:
    first_list, total, _ = await _call_zys_do_initial()
```

`_process_one_yjxkdm` 注释明确：
```python
# 注意：first_list 为空时也走 httpx 枚举（如 0779 公共卫生与预防医学，
# zys.do 返回空但 0779Z1 流行病与卫生统计学等交叉学科可枚举到）。
```

**数据**：
| yjxkdm | 修复前 | 修复后 | 说明 |
|---|---|---|---|
| 0779 公共卫生 | 0 → fallback | 2 个 | first_list 空也走枚举，Z 段枚举到交叉学科 |
| 0270 统计学 | 1 fallback | 2 个 | first_list 空时枚举发现交叉学科 |

#### 5.4 fallback 兜底：64 专业学位 + 44 学术学位

**背景**：枚举完成后仍有 108 个 yjxkdm 拿到 0 个 majors。这些是真实情况，不是 bug。

**专业学位（64 个）**：
- 研招网对 0854 电子信息、085410 人工智能等专业学位按一级学科招生。
- `zys.do` 列表页返回 `totalCount=0` + 空 list 是真实情况（详见 [ISSUE-018](file:///d:/yam/docs/known-issues.md)）。
- fallback 注入 `yjxkdm+"00"` 作为唯一专业，让前端能正常选择。

**学术学位（44 个）**：
- 0307 / 0770 等新兴学科研招网无独立二级学科数据。
- 同样 fallback 注入 `yjxkdm+"00"`。

**fallback 代码**（`update_all_majors.py`）：
```python
if not majors:
    # 兜底：研招网对专业学位（0854 等）按一级学科招生，
    # zys.do 返回 totalCount=0 + 空 list 是真实情况，注入 yjxkdm+"00" 作为 fallback。
    majors = [{
        "zydm": yjxkdm + "00",
        "zymc": yjxkmc,
        "yjxkdm": yjxkdm,
        "yjxkmc": yjxkmc,
        "mldm": mldm,
        "mlmc": mlmc,
        "xwlx": "zy" if is_professional_degree(yjxkdm + "00") else "xs",
    }]
```

**数据**：
- 专业学位 fallback 100%（64/64）。
- 学术学位 fallback 100%（44/44）。
- 0 个 0-majors（所有 yjxkdm 都至少有 1 个 fallback 专业）。

---

## 三、最终方案定型

### 3.1 架构：Playwright 激活 + httpx 并发

```
update_all_majors(login, resume)
  │
  ├─ MajorsSearcher（headless=False）仅用于登录 → 保存 cookies → 关闭
  │
  ├─ 启动新 Playwright browser（headless=True，单 browser 多 context）
  │
  └─ 分批 CONCURRENCY=15 并发处理 pending yjxkdm：
       │
       ├─ _process_one_yjxkdm(browser, yjxkdm, ...)
       │     │
       │     ├─ _playwright_activate_session
       │     │     ├─ 新建独立 context（独立 JSESSIONID）
       │     │     ├─ 访问 zsml 首页
       │     │     ├─ page.evaluate 调 zys.do 拿 first_list（seed_major）
       │     │     ├─ 访问详情页激活 session（first_list 空时用虚拟 URL）
       │     │     ├─ first_list 空时重试一次
       │     │     └─ 提取 cookies → 关闭 context
       │     │
       │     └─ _httpx_enumerate_yjxkdm
       │           ├─ 新建 httpx.AsyncClient（独立 cookie jar = 独立 session）
       │           ├─ 枚举 base 段 XX00-XX09（连续 5 空 break）
       │           ├─ 枚举 J 段 XXJ0-XXJ9（连续 3 空 break）
       │           ├─ 枚举 Z 段 XXZ0-XXZ9（连续 3 空 break）
       │           ├─ totalCount>10 时 8 种 combo 拆分
       │           └─ 限流指数退避 2→4→8s 重试 3 次
       │
       ├─ 批后增量保存 PARTIAL_JSON
       └─ 推送 YAM_MAJORS_UPDATE_BATCH_ITEM 进度
```

### 3.2 四个核心函数

#### `_call_zys_do_httpx`
httpx 调用 `zys.do` 的薄封装，返回 `(list, totalCount, error_msg)`。处理 HTTP 状态码、JSON 解析、`msg` 为字符串（"请登录"/"访问太频繁"）的情况。

#### `_playwright_activate_session`
用 Playwright 独立 context 激活 session，拿 `seed_major` + cookies。关键逻辑：
- `first_list` 非空：用 seed 的 sign/sign2 构造真实详情页 URL。
- `first_list` 为空：用 `yjxkdm+"00"` 构造虚拟详情页 URL 激活 session，再重试一次。
- 提取所有 `chsi.com.cn` 域的 cookies 传给 httpx。

#### `_httpx_enumerate_yjxkdm`
单个 yjxkdm 的 httpx 枚举，返回 `(majors, error_count, distinct_zydms)`。关键逻辑：
- `skip_initial = bool(first_list)`：first_list 非空时跳过 initial_zydm（Playwright 已调过，同 session 再调返回"请登录"）。
- 分段 break：base 段连续 5 真空 break，J/Z 段连续 3 真空 break。
- 限流退避：检测到"访问太频繁"时 2→4→8s 重试 3 次，连续 3 次限流 break 当前段。
- combo 拆分：`totalCount>10` 时用 8 种 `jsggjh`/`tydxs` 组合拿全数据。

#### `_process_one_yjxkdm`
单个 yjxkdm 的完整处理：Playwright 激活 + httpx 枚举 + 标准化 majors。即使 `first_list` 为空也走 httpx 枚举（关键修复 5.3）。

### 3.3 关键参数

| 参数 | 值 | 说明 |
|---|---|---|
| `CONCURRENCY` | 15 | 每 batch 并发数（实测 30 触发 IP 级限流） |
| `ZYDM_SLEEP_MS` | 400 | zys.do 调用间隔，避免触发"访问太频繁" |
| 限流退避 | 2s → 4s → 8s | 指数退避，最多重试 3 次 |
| 连续限流 break | 3 次 | 连续 3 次限流放弃当前段，进入下一段 |
| base 段空 break | 5 次 | 连续 5 个真空响应提前结束 base 段 |
| J/Z 段空 break | 3 次 | 连续 3 个真空响应提前结束 J/Z 段 |
| combo 拆分阈值 | totalCount > 10 | 超过 10 条用 8 种组合拆分拿全 |

---

## 四、为什么这个方案能 work

### 4.1 httpx 独立 cookie jar 绕过"同 session 同 param"限制

ISSUE-015 发现 `zydws.do` 有"同 session 同 param 第 2 次返回请登录"限制。`zys.do` 也有类似限制：同一个 `zydm` 在一个 session 内第 2 次调用会返回"请登录"。

但 `zys.do` 的枚举是**对同一个 yjxkdm 下不同 zydm 的调用**——每个 zydm 是不同的参数组合，不会触发"同 param 第 2 次"限制。唯一需要跳过的是 `initial_zydm`（yjxkdm+"00"），因为它已被 Playwright 调过：

```python
skip_initial = bool(first_list)
for candidates, empty_threshold in segments:
    for zydm in candidates:
        if zydm == initial_zydm and skip_initial:
            continue  # 第 1 步已调过，同 session 再调返回"请登录"
```

httpx 的 `AsyncClient` 每次新建时自带独立 cookie jar，等同于一个全新的 session。即使多个 yjxkdm 并发跑，各自的 httpx client 互不干扰，不会出现 session 冲突。这是轮次 0.2 aiohttp 失败的根因——当时所有请求共享同一份 Playwright cookies。

### 4.2 Playwright 仅用于 session 激活，不参与并发

Playwright 的 `page.evaluate` 开销大（跨进程通信），且 multi-page 共享 context 会 session 冲突。最终方案让 Playwright 只做一件事：**用独立 context 访问详情页激活 session，提取 cookies**。

激活完成后立即关闭 context，把 cookies 交给 httpx。这样：
- Playwright 不参与 30 次 `zys.do` 的并发（避开 evaluate 开销）。
- 每个 yjxkdm 的 Playwright context 互相独立（独立 JSESSIONID），不冲突。
- httpx 接管后可以用 `asyncio.Semaphore(15)` 高并发枚举，瓶颈从"Playwright evaluate 串行"变成"httpx 网络并发"。

### 4.3 分段 break + combo 拆分控制请求数

30 个候选 zydm 全部调一遍是 30 次请求。但大部分 yjxkdm 只有 2-5 个真实二级学科，剩下 25+ 次都是空响应。分段 break 让无效请求提前终止：

- base 段（XX00-XX09）：连续 5 个真空响应 break。例如 0270 统计学只有 `027000`/`0270Z1` 两个，base 段第 2 个就空，连续 5 个空后 break，省下 8 次调用。
- J/Z 段（XXJ0-XXJ9 / XXZ0-XXZ9）：连续 3 个真空响应 break。交叉学科稀疏，3 次空基本能确认本段无数据。

combo 拆分针对 `totalCount > 10` 的大专业（如 0301 法学 94 个）。`zys.do` 固定返回 10 条，超过 10 的需要用 8 种 `jsggjh`/`tydxs` 组合拆分拿全：

```python
_COMBOS_FOR_SPLIT = [
    {"jsggjh": "0"}, {"jsggjh": "1"},
    {"tydxs": "0"}, {"tydxs": "1"},
    {"jsggjh": "0", "tydxs": "0"}, {"jsggjh": "0", "tydxs": "1"},
    {"jsggjh": "1", "tydxs": "0"}, {"jsggjh": "1", "tydxs": "1"},
]
```

这与 ISSUE-015 的多筛选组合思路一致——不同筛选参数视为不同参数组合，各返回不同的前 10 条。

### 4.4 指数退避避免雪崩

ISSUE-015 实测发现研招网限流是"累积式封禁"：短时允许 40-50 请求，超过触发雪崩（5-10 分钟无法恢复）。15 并发如果不加控制，跑几十个 yjxkdm 后会累积到雪崩阈值。

指数退避（2→4→8s）让限流后请求节奏立即放缓，给服务端恢复时间。连续 3 次限流 break 当前段，避免在已限流的段上无谓重试，进入下一段（不同 zydm 前缀，可能未限流）。

实测 15 并发 + 400ms sleep + 指数退避：219 个 yjxkdm 全程 0 雪崩、0 失败。

---

## 五、踩过的坑

### 5.1 Rust 端 BufReader 要求 UTF-8，Windows GBK 丢行

**现象**：Rust 端 `process_catalog_stdout_line` 解析 Python stdout 时，部分含中文的进度行丢失。

**根因**：Windows 默认控制台编码是 GBK，Python print 中文时按 GBK 编码输出。Rust 端用 `BufReader::lines()` 严格要求 UTF-8，遇到非 UTF-8 字节会丢行或整行乱码。

**修复**：`commands.rs` 启动 Python 子进程时强制设置 UTF-8 环境：
```rust
cmd.env("PYTHONUNBUFFERED", "1")
    .env("PYTHONIOENCODING", "utf-8")
    .env("PYTHONUTF8", "1")
```

三个环境变量缺一不可：`PYTHONIOENCODING=utf-8` 让 stdout 用 UTF-8，`PYTHONUTF8=1` 开启 Python UTF-8 模式（覆盖系统默认），`PYTHONUNBUFFERED=1` 保证实时输出不缓冲。

### 5.2 调试日志误用 WARN 协议导致 failed_count 误报

**现象**：目录更新跑完 219 个全部成功，但 UI 显示 `failed_count > 0`。

**根因**：`update_majors_catalog.py` 早期用 `print(f"YAM_MAJORS_UPDATE_WARN ...")` 输出调试日志（如限流重试提示）。Rust 端 `process_catalog_stdout_line` 把所有 `YAM_MAJORS_UPDATE_WARN` 行计入 `failed_count`，导致正常限流重试被误报为失败。

**修复**：调试日志改用普通 `print()`，不用 `YAM_MAJORS_UPDATE_WARN` 协议。只有真正的失败（yjxkdm 枚举返回 error）才走 `failed` 列表。

### 5.3 DONE 后误 kill Python 进程导致"异常退出"误报

**现象**：目录更新跑完 219 个全部成功，但 UI 显示"目录更新脚本异常退出"。

**根因**：`commands.rs` 中 `run_update_catalog_task` 主循环取消检查条件为 `if !running && done { child.kill(); break; }`。处理 `YAM_MAJORS_UPDATE_DONE` 行时同步设置 `running=false` 和 `done=true`，下一次循环检查就 kill 了正在收尾（return + asyncio.run 清理 + GC）的 Python 进程，导致 Python 退出码非 0。

**修复**：条件改为 `if !running && !done { child.kill(); break; }`。仅当用户取消（`done=false`）时才 kill；任务完成（`done=true`）时让 Python 自然退出，等 stdout EOF 触发 break。

代码注释明确：
```rust
// 检查取消：仅当 running=false 且 done=false 时才视为用户取消（kill 子进程）。
// 注意：DONE 事件处理会同时设置 running=false 和 done=true，此时 Python 仍在收尾
// （return + asyncio.run 清理 + GC），不能再 kill，否则会让 Python 退出码非 0
// 触发"目录更新脚本异常退出"误报。等 stdout EOF 自然退出即可。
if !p.running.load(Ordering::SeqCst) && !p.done {
    let _ = child.kill();
    break;
}
```

### 5.4 aiohttp 直接请求的误判（轮次 0.2 教训）

**现象**：轮次 0.2 用 aiohttp 直接请求 `zys.do` 触发限流，得出"aiohttp 直接请求方案不可行"的结论，导致后续 4 轮都困在 Playwright `page.evaluate` 路线。

**根因**：当时的 aiohttp 实现犯了三个错误：
1. 所有请求共享同一份 Playwright 提取的 cookies（同一 session），命中"同 session 同 param 第 2 次返回请登录"限制。
2. 没有给每个 yjxkdm 用独立 cookie jar。
3. 没有控制请求间隔和并发数，触发 IP 级限流。

**纠正**：轮次 5 用 httpx + 独立 cookie jar + 限流退避成功跑通，证明"直接请求方案"本身可行。这个教训提醒：**接口方案失败时，先排查 session 隔离和限流控制，不要轻易否定整个技术路线**。

### 5.5 CDP 端口误判 9222 vs 9223

**现象**：CDP 验证脚本第一次跑全部 FAIL，因为查 9222 端口，实际桌面端 dev server 用 9223。

**修复**：用 `netstat -ano | findstr "922"` 找到真实端口。后续 CDP 验证统一用 9223。

**教训**：项目记忆里已记录"CDP 端口 9223，非 9222"，避免下次会话重蹈覆辙。

### 5.6 `read_majors_catalog` 返回 Option<String>，前端需 JSON.parse

**现象**：CDP 验证脚本第一次跑 Tests 1-3 全 FAIL，Rust 命令 `read_majors_catalog` 返回 `Option<String>`（JSON 文件内容字符串），JS 直接当对象用导致字段访问失败。

**修复**：CDP 脚本加类型检查：
```javascript
let catalog = await window.__TAURI__.core.invoke('read_majors_catalog');
if (typeof catalog === 'string') catalog = JSON.parse(catalog);
```

### 5.7 PowerShell 不支持 && / heredoc

**现象**：`git add ... && git status` 失败；`git commit -m "$(cat <<'EOF'...)"` heredoc 失败。

**修复**：
- 用 `;` 分隔命令（不用 `&&`）。
- 多行 commit message 用 `Write` 工具写临时文件 + `git commit -F file`。

---

## 六、后续优化方向

### 6.1 SessionStore 抽象（ISSUE-024）

当前 Playwright 激活 session 的逻辑散落在 `update_majors_catalog.py` 和 `majors_searcher.py` 两处。ISSUE-024 计划抽象 `SessionStore` 接口，让 httpx 也走统一的 session 管理层，支持研招网 + 掌上考研多数据源。

### 6.2 复用到 ISSUE-029 数据采集

ISSUE-029（数据采集流程 httpx 并发优化）需要把 `fetch_departments` / `fetch_school_list` / `fetch_score_lines` 三个串行 requests 函数改为 httpx 并发。本方案的三个核心函数可直接复用：

- `_call_zys_do_httpx` 的写法 → 改造为调 `zydws.do` / `dwzys.do` / `scoreLines.do`。
- `_playwright_activate_session` 的 session 激活模式 → 数据采集同样需要先激活 session。
- `_httpx_enumerate_yjxkdm` 的限流退避 + 分段 break → 数据采集的省份遍历/院校遍历同样适用。

预估单专业采集从 15-25 分钟降到 3-5 分钟。必须先于 ISSUE-025（分数线采集）完成。

### 6.3 断点续传粒度

当前 `--resume` 基于 `completed_yjxkdm` 列表跳过已完成的 yjxkdm，粒度是"一级学科"。如果某个 yjxkdm 枚举到一半中断，重跑会从头枚举该 yjxkdm 的 30 个 zydm。可优化为按 zydm 粒度续传，但收益有限（单个 yjxkdm 仅 6-8 秒）。

### 6.4 限流参数自适应

当前 `CONCURRENCY=15` 是固定值。可考虑根据限流频率自适应调整：检测到连续限流时自动降并发，限流消失时回升。但实现复杂度高，当前固定 15 + 退避已足够稳定。

---

## 七、关键文件

| 文件 | 作用 |
|---|---|
| [yam/scripts/update_majors_catalog.py](file:///d:/yam/yam/scripts/update_majors_catalog.py) | 主实现，4 个核心函数 + `update_all_majors` 主流程 |
| [yam/majors_searcher.py](file:///d:/yam/yam/majors_searcher.py) | `MajorsSearcher` 类，仅用于登录 + 单 yjxkdm 查询备用实现 |
| [yam-desktop/src-tauri/src/commands.rs](file:///d:/yam/yam-desktop/src-tauri/src/commands.rs) | `run_update_catalog_task`：启动 Python 子进程、解析 stdout 协议、取消/超时逻辑 |
| [data/majors_realtime.json](file:///d:/yam/data/majors_realtime.json) | 最终输出，219 yjxkdm / 2255 majors |
| [scripts/test_httpx_hybrid.py](file:///d:/yam/scripts/test_httpx_hybrid.py) | E2-A3 原型脚本，验证 httpx 能否复用 Playwright 激活的 session |
| [scripts/test_httpx_full_219.py](file:///d:/yam/scripts/test_httpx_full_219.py) | E2-G 完整 219 验证脚本，30 并发实测触发限流 |
| [docs/progress.md](file:///d:/yam/docs/progress.md) | ISSUE-023 实施记录 + 验证结果 |
| [docs/known-issues.md](file:///d:/yam/docs/known-issues.md) | ISSUE-023 条目（fixed）+ ISSUE-018 fallback 说明 |
| [docs/issue-015-research.md](file:///d:/yam/docs/issue-015-research.md) | 同系列研究文档，`zydws.do` 翻页问题 |

### stdout 协议

`update_majors_catalog.py` 通过 stdout 输出结构化协议行，Rust 端 `process_catalog_stdout_line` 解析：

| 协议行 | 含义 |
|---|---|
| `YAM_MAJORS_UPDATE_PROGRESS <current> <total> <name>` | 整体进度 |
| `YAM_MAJORS_UPDATE_BATCH_START <batch_num> <total_batches> <batch_info_json>` | 批次开始，含批次内 yjxkdm 列表 |
| `YAM_MAJORS_UPDATE_BATCH_ITEM <yjxkdm> running\|done\|failed <detail>` | 批次内单项状态 |
| `YAM_MAJORS_UPDATE_DONE <json>` | 全部完成，输出最终 catalog JSON |
| `YAM_MAJORS_UPDATE_WARN <msg>` | 警告（不计入 failed_count） |
| `YAM_MAJORS_UPDATE_ERROR <msg>` | 致命错误，中断流程 |

---

## 八、变更历史

| commit | 类型 | 说明 |
|---|---|---|
| `4228586` | fix | 改单 context 多 page 并发，CONCURRENCY=4，预估 7-8 分钟 |
| `f32c998` | tune | 调高 CONCURRENCY 4→6，BATCH_PAUSE 2.0→1.5 |
| `2184532` | feat | 加批次内并发项实时进度展示 + 分段 break 提速 |
| `c41fd91` | fix | 限流实测后降 CONCURRENCY 6→3 + 错开请求（ITEM_STAGGER_MAX=1.5） |
| `1a3fc04` | fix | **彻底重写为 httpx + Playwright 激活方案**，CONCURRENCY=15，7-8 分钟跑完 219 个 yjxkdm，2255 majors |

### 演进时间线

```
串行 30min（轮次 0.1）
  └─ aiohttp 失败（轮次 0.2，误判，后来推翻）
      └─ 单 context 多 page CONCURRENCY=4（轮次 1，12-15min）
          └─ 调高 4→6（轮次 2，触发限流）
              └─ 进度展示 + 分段 break（轮次 3）
                  └─ 降 6→3 + 错开（轮次 4，10-12min，未达标）
                      └─ httpx + Playwright 激活 CONCURRENCY=15（轮次 5，7-8min，达标）
```

### 验证结果（2026-07-22 桌面端 UI 重跑 + CDP 实测）

- 总 majors：1465 → **2255**（+53.9%）
- 0 majors 的 yjxkdm：**0 个**（原 69 专业学位 + 50 学术学位异常 fallback 全部修复）
- 失败：0 个
- 退化：0 个（77 个 yjxkdm 数据更多，0 个更少）
- 总耗时：约 7-8 分钟（达 10 分钟目标）

CDP 4/4 测试通过：
1. `read_majors_catalog` 返回正确数据（219 yjxkdm / 2255 majors）。
2. 关键 yjxkdm 数据正确：0301 法学 94 / 1002 临床医学 91 / 0270 统计学 2 / 0779 公共卫生 2 / 0302 政治学 37 / 0202 应用经济学 72。
3. 专业学位 fallback 100%（64/64）。
4. 状态机正常（running=false, done=false, 初始状态）。

---

## 九、附录：CONCURRENCY 调优全过程

| 轮次 | CONCURRENCY | BATCH_PAUSE / sleep | 结果 | 决策 |
|---|---|---|---|---|
| 0.1 | 1（串行） | — | 30 min，数据完整 | 必须并发 |
| 0.2 | aiohttp 并发 | 无控制 | 触发限流，误判放弃 | 暂回 Playwright |
| 1 | 4 | 2.0s | 12-15 min，偶发限流 | 调高并发 |
| 2 | 6 | 1.5s | 触发"访问太频繁"，5 空 1 卡 | 降并发 + 错开 |
| 3 | 6 | 1.5s | 加进度展示 + 分段 break | 不解决限流 |
| 4 | 3 | 3.0s + 0~1.5s stagger | 10-12 min，稳定但未达标 | 重写为 httpx |
| 5 | 15 | 400ms + 2/4/8s 退避 | 7-8 min，0 失败，达标 | **最终方案** |
| 5（对比） | 30 | 500ms | 触发 IP 级限流，部分失败 | 降到 15 |

**核心教训**：
1. 限流是 IP 级，不是 session 级——提并发必须配套限流退避。
2. Playwright `page.evaluate` 开销大，不适合做高频并发数据拉取，只适合 session 激活。
3. httpx 独立 cookie jar 是绕过"同 session 同 param"限制的关键。
4. 接口方案失败时，先排查 session 隔离和限流控制，不要轻易否定整个技术路线（轮次 0.2 教训）。
5. first_list 为空不代表无数据——交叉学科可能在 J/Z 段枚举到（0779 公共卫生修复）。
