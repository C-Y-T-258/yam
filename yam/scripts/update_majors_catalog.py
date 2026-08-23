"""更新整个专业目录（含 J/Z 自设交叉学科），写入 JSON 文件供桌面端读取.

用法：
    python -m yam.scripts.update_majors_catalog
    python -m yam.scripts.update_majors_catalog --login  # 首次需要登录时
    python -m yam.scripts.update_majors_catalog --resume  # 断点续传（基于已存在的 JSON）

输出协议（stdout）：
    YAM_MAJORS_UPDATE_PROGRESS <current> <total> <name>
    YAM_MAJORS_UPDATE_DONE <json>

完成后会在 d:/yam/data/majors_realtime.json 写入完整目录。
增量保存：每批保存一次 JSON，中断后可读已爬部分数据。

ISSUE-023 优化（httpx + Playwright 激活方案）：
- 单 Playwright browser + 多 context 激活 session
- 每个 yjxkdm 独立 context 拿 seed_major + cookies，然后用 httpx 接管枚举
- httpx 独立 cookie jar 模拟独立 session，避免 Playwright multi-page session 冲突
- CONCURRENCY=30 并发，实测 219 个 yjxkdm 约 5 分钟跑完
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import re
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

from yam.browser import BrowserMissingError, launch_browser
from yam.config import config

REPO_ROOT = config.project_dir
MAJORS_TS = REPO_ROOT / "yam-desktop" / "src" / "data" / "majors.ts"
OUTPUT_JSON = config.realtime_majors_file
PARTIAL_JSON = config.data_dir / "majors_realtime.partial.json"
INCREMENTAL_SAVE_INTERVAL = 5  # 每完成 5 个 yjxkdm 保存一次（保留用于单测/兜底）

# ISSUE-023：httpx + Playwright 激活并发方案参数
# CONCURRENCY=30 实测会触发 IP 级限流导致部分 yjxkdm 枚举失败（如 0270 单独跑 2 个，30 并发只拿到 1 个 fallback）。
# 安装版需要兼顾普通电脑和不稳定网络。每项都会创建独立浏览器 context，
# 过高并发会让首次导航同时超时并放大站点限流。
CONCURRENCY = 5  # 每 batch 并发数
ZYDM_SLEEP_MS = 400  # zys.do 调用间隔，避免触发"访问太频繁"限流

BASE_URL = "https://yz.chsi.com.cn"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

# total > 10 的 zydm 用 8 种 combo 拆分获取完整列表
_COMBOS_FOR_SPLIT = [
    {"jsggjh": "0"},
    {"jsggjh": "1"},
    {"tydxs": "0"},
    {"tydxs": "1"},
    {"jsggjh": "0", "tydxs": "0"},
    {"jsggjh": "0", "tydxs": "1"},
    {"jsggjh": "1", "tydxs": "0"},
    {"jsggjh": "1", "tydxs": "1"},
]


def parse_yjxkdm_list_from_majors_ts() -> list[tuple[str, str, str, str]]:
    """从 yam-desktop/src/data/majors.ts 解析所有 (yjxkdm, yjxkmc, mldm, mlmc) 列表.

    返回 [(yjxkdm, yjxkmc, mldm, mlmc), ...]，去重。

    按行扫描，跟踪当前 category（2 位代码），遇到 4 位代码的 discipline 就记录。
    """
    if not MAJORS_TS.exists():
        results: list[tuple[str, str, str, str]] = []
        seen: set[str] = set()
        for major in config.list_majors(enabled_only=False):
            code = str(major.get("code", ""))
            if len(code) < 4 or not code[:4].isdigit() or code[:4] in seen:
                continue
            yjxkdm = code[:4]
            seen.add(yjxkdm)
            discipline_name = next(
                (
                    str(item.get("name", yjxkdm))
                    for item in config.list_majors(enabled_only=False)
                    if str(item.get("code", "")) == yjxkdm + "00"
                ),
                str(major.get("name", yjxkdm)),
            )
            results.append(
                (
                    yjxkdm,
                    discipline_name,
                    str(major.get("category_code", "")),
                    str(major.get("category_name", "")),
                )
            )
        return results

    content = MAJORS_TS.read_text(encoding="utf-8")

    results: list[tuple[str, str, str, str]] = []
    seen: set[str] = set()

    current_mldm = ""
    current_mlmc = ""

    # 先匹配所有 category 块：code: 'XX', name: 'XXX', disciplines: [
    # 然后在该块内匹配所有 discipline：code: 'XXXX', name: 'XXX'
    # 由于 disciplines 数组嵌套 majors 数组，需要按层级跟踪
    # 简化：用正则匹配每个 category 块的整体范围（从 code: 'XX' 到下一个 code: 'XX' 或文件末尾）
    cat_pattern = re.compile(
        r"code:\s*'(\d{2})',\s*name:\s*'([^']+)',\s*disciplines:\s*\[",
    )
    disc_pattern = re.compile(r"code:\s*'(\d{4})',\s*name:\s*'([^']+)'")

    # 找到所有 category 的位置
    cat_matches = list(cat_pattern.finditer(content))
    for i, cat_m in enumerate(cat_matches):
        mldm = cat_m.group(1)
        mlmc = cat_m.group(2)
        # 该 category 块的范围：从当前匹配结束到下一个 category 匹配开始（或文件末尾）
        start = cat_m.end()
        end = cat_matches[i + 1].start() if i + 1 < len(cat_matches) else len(content)
        block = content[start:end]

        # 在该块内找所有 4 位代码的 discipline
        for d_m in disc_pattern.finditer(block):
            yjxkdm = d_m.group(1)
            yjxkmc = d_m.group(2)
            if yjxkdm in seen:
                continue
            seen.add(yjxkdm)
            results.append((yjxkdm, yjxkmc, mldm, mlmc))

    return results


def _build_catalog_output(
    catalog: dict[str, dict[str, Any]],
    failed: list[tuple[str, str]],
    total: int,
    completed_codes: list[str],
    is_partial: bool = False,
) -> dict[str, Any]:
    """根据 catalog 字典构建最终 JSON 输出结构（按学位类型拆分）."""
    from yam.crawler.dynamic import is_professional_degree

    academic_categories: list[dict[str, Any]] = []
    professional_categories: list[dict[str, Any]] = []

    for mldm in sorted(catalog.keys()):
        cat = catalog[mldm]
        academic_disciplines: list[dict[str, Any]] = []
        professional_disciplines: list[dict[str, Any]] = []

        for yjxkdm in sorted(cat["disciplines"].keys()):
            disc = cat["disciplines"][yjxkdm]
            # 按 (zydm, zymc) 去重
            seen: set[tuple[str, str]] = set()
            unique_majors: list[dict[str, str]] = []
            for m in disc["majors"]:
                key = (m["zydm"], m["zymc"])
                if key in seen:
                    continue
                seen.add(key)
                unique_majors.append({"code": m["zydm"], "name": m["zymc"]})
            unique_majors.sort(key=lambda x: x["code"])

            disc_obj = {
                "code": yjxkdm,
                "name": disc["yjxkmc"],
                "majors": unique_majors,
            }
            if is_professional_degree(yjxkdm + "00"):
                professional_disciplines.append(disc_obj)
            else:
                academic_disciplines.append(disc_obj)

        if academic_disciplines:
            academic_categories.append({
                "code": mldm,
                "name": cat["mlmc"],
                "disciplines": academic_disciplines,
            })
        if professional_disciplines:
            professional_categories.append({
                "code": mldm,
                "name": cat["mlmc"],
                "disciplines": professional_disciplines,
            })

    return {
        "academic_categories": academic_categories,
        "professional_categories": professional_categories,
        "failed": failed,
        "total_yjxkdm": total,
        "success_yjxkdm": len(completed_codes),
        "completed_yjxkdm": completed_codes,
        "is_partial": is_partial,
    }


def _atomic_write_json(path: Path, data: dict[str, Any]) -> None:
    """原子写入 JSON：先写临时文件，再 rename，避免中断时文件损坏."""
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    os.replace(tmp, path)


# === ISSUE-023: httpx + Playwright 激活并发方案 ===

async def _call_zys_do_httpx(
    client, zydm: str, yjxkdm: str, xwlx: str, mldm: str,
    jsggjh: str = "", tydxs: str = "",
) -> tuple[list[dict], int, str | None]:
    """httpx 调用 zys.do，返回 (list, totalCount, error_msg)."""
    import httpx

    api_url = f"{BASE_URL}/zsml/rs/zys.do"
    data = {
        "zydm": zydm, "zymc": "", "xwlx": xwlx, "mldm": mldm,
        "yjxkdm": yjxkdm, "xxfs": "", "tydxs": tydxs, "jsggjh": jsggjh,
        "start": "0", "curPage": "1", "pageSize": "10",
        "totalPage": "0", "totalCount": "0",
    }
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": f"{BASE_URL}/zsml/",
    }
    try:
        r = await client.post(api_url, content=urlencode(data), headers=headers, timeout=30.0)
    except Exception as e:
        return [], 0, f"httpx 异常: {e}"
    if r.status_code != 200:
        return [], 0, f"HTTP {r.status_code}"
    try:
        result = r.json()
    except Exception as e:
        return [], 0, f"JSON 解析失败: {e}"
    msg = result.get("msg", {})
    if isinstance(msg, str):
        return [], 0, msg
    if not isinstance(msg, dict):
        return [], 0, "msg 类型异常"
    return msg.get("list", []) or [], int(msg.get("totalCount", 0) or 0), None


async def _playwright_activate_session(
    browser, yjxkdm: str, xwlx: str, mldm: str, saved_cookies: list, yjxkmc: str = "",
) -> tuple[list[dict], int, dict[str, str], str | None]:
    """用 Playwright 独立 context 激活 session，拿 seed_major + cookies.

    返回 (first_list, total_count, cookies_dict, error_msg).

    first_list 为空时（如 0779 公共卫生与预防医学，zys.do 返回空但官网有交叉学科），
    访问详情页激活 session 后再尝试一次，仍为空则返回空让 httpx 枚举接管。
    """
    from urllib.parse import quote
    initial_zydm = yjxkdm + "00"
    context = await browser.new_context(user_agent=UA)
    try:
        if saved_cookies:
            await context.add_cookies(saved_cookies)

        page = await context.new_page()
        last_navigation_error: Exception | None = None
        for attempt in range(3):
            try:
                await page.goto(
                    f"{BASE_URL}/zsml/",
                    wait_until="domcontentloaded",
                    timeout=60000,
                )
                last_navigation_error = None
                break
            except Exception as error:
                last_navigation_error = error
                if attempt < 2:
                    await page.wait_for_timeout(1000 * (attempt + 1))
        if last_navigation_error is not None:
            raise last_navigation_error
        await page.wait_for_timeout(150)

        async def _call_zys_do_initial():
            params = {
                "zydm": initial_zydm, "zymc": "", "xwlx": xwlx, "mldm": mldm,
                "yjxkdm": yjxkdm, "xxfs": "", "tydxs": "", "jsggjh": "",
                "start": "0", "curPage": "1", "pageSize": "10",
                "totalPage": "0", "totalCount": "0",
            }
            result = await page.evaluate(
                """
                async (params) => {
                    const formData = new URLSearchParams();
                    for (const [k, v] of Object.entries(params)) {
                        formData.append(k, v);
                    }
                    const response = await fetch('https://yz.chsi.com.cn/zsml/rs/zys.do', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'Referer': 'https://yz.chsi.com.cn/zsml/'
                        },
                        body: formData.toString()
                    });
                    return await response.json();
                }
                """,
                params,
            )
            msg = result.get("msg", {}) if isinstance(result, dict) else {}
            if isinstance(msg, str):
                return [], 0, f"第 1 次失败: {msg}"
            first_list = msg.get("list", []) or []
            total = int(msg.get("totalCount", 0) or 0)
            return first_list, total, None

        first_list, total, err = await _call_zys_do_initial()
        if err:
            return [], 0, {}, err

        # 用 seed_major 访问详情页建立 session 上下文
        # first_list 为空时，用 yjxkdm+"00" 构造虚拟详情页 URL 激活 session，然后重试一次
        if first_list:
            seed = first_list[0]
            detail_url_with_sign = (
                f"{BASE_URL}/zsml/zydetail.do?"
                f"zydm={seed.get('zydm', '')}"
                f"&zymc={seed.get('zymc', '')}"
                f"&xwlx={seed.get('xwlx', '')}"
                f"&mldm={seed.get('mldm', '')}"
                f"&mlmc={seed.get('mlmc', '')}"
                f"&yjxkdm={seed.get('yjxkdm', '')}"
                f"&yjxkmc={seed.get('yjxkmc', '')}"
                f"&xxfs=&tydxs=&jsggjh="
                f"&sign={seed.get('sign', '')}"
                f"&sign2={seed.get('sign2', '')}"
            )
        else:
            # first_list 为空：用 yjxkdm+"00" 构造虚拟详情页 URL 激活 session
            # 这是为了让后续 httpx 枚举能拿到有效的 JSESSIONID
            detail_url_with_sign = (
                f"{BASE_URL}/zsml/zydetail.do?"
                f"zydm={initial_zydm}"
                f"&zymc={quote(yjxkmc)}"
                f"&xwlx={'zyxw' if xwlx == 'zy' else 'xsxw'}"
                f"&mldm={mldm}"
                f"&yjxkdm={yjxkdm}"
                f"&yjxkmc={quote(yjxkmc)}"
                f"&xxfs=1"
            )

        try:
            await page.goto(detail_url_with_sign, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(200)
            await page.goto(f"{BASE_URL}/zsml/", wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(150)
        except Exception:
            pass

        # first_list 为空时，访问详情页后重试一次（可能拿到 seed_major）
        if not first_list:
            first_list, total, _ = await _call_zys_do_initial()

        all_cookies = await context.cookies()
        cookies_dict = {
            c["name"]: c["value"]
            for c in all_cookies
            if "chsi.com.cn" in c.get("domain", "") and c.get("value")
        }
        return first_list, total, cookies_dict, None
    finally:
        await context.close()


async def _httpx_enumerate_yjxkdm(
    yjxkdm: str, xwlx: str, mldm: str,
    first_list: list[dict], cookies: dict[str, str],
) -> tuple[list[dict], int, int]:
    """单个 yjxkdm 的 httpx 枚举，返回 (majors, error_count, distinct_zydms).

    枚举逻辑：
    1. base XX00-XX09（连续 5 真正空响应 break）
    2. J 自设 XXJ0-XXJ9（连续 3 真正空响应 break）
    3. Z 交叉 XXZ0-XXZ9（连续 3 真正空响应 break）
    4. total > 10 的 zydm 用 8 种 combo 拆分
    5. 限流（"访问太频繁"）等待 2 秒重试 1 次
    """
    import httpx

    initial_zydm = yjxkdm + "00"
    all_majors: list[dict] = list(first_list)
    distinct_zydms: set[str] = {m.get("zydm", "") for m in first_list if m.get("zydm")}
    error_count = 0

    segments: list[tuple[list[str], int]] = [
        ([f"{yjxkdm}0{i}" for i in range(10)], 5),  # base XX00-XX09
        ([f"{yjxkdm}J{i}" for i in range(10)], 3),  # J 自设
        ([f"{yjxkdm}Z{i}" for i in range(10)], 3),  # Z 交叉
    ]
    sleep_s = ZYDM_SLEEP_MS / 1000.0

    async with httpx.AsyncClient(
        http2=False,
        follow_redirects=True,
        headers={"User-Agent": UA},
        cookies=cookies,
    ) as client:
        # first_list 为空时，httpx 是新 session 可以重新调 initial_zydm（不会"请登录"）
        skip_initial = bool(first_list)
        for candidates, empty_threshold in segments:
            consecutive_empty = 0
            consecutive_rate_limit = 0  # 连续限流计数，避免无谓重试
            for zydm in candidates:
                if zydm == initial_zydm and skip_initial:
                    continue  # 第 1 步已调过，同 session 再调返回"请登录"

                # 限流指数退避重试：最多 3 次（2s → 4s → 8s）
                lst, total, err = await _call_zys_do_httpx(
                    client, zydm, yjxkdm, xwlx, mldm
                )
                await asyncio.sleep(sleep_s)
                retry_count = 0
                while err and "访问太频繁" in (err or "") and retry_count < 3:
                    backoff = 2 * (2 ** retry_count)  # 2 → 4 → 8
                    await asyncio.sleep(backoff)
                    lst, total, err = await _call_zys_do_httpx(
                        client, zydm, yjxkdm, xwlx, mldm
                    )
                    await asyncio.sleep(sleep_s)
                    retry_count += 1
                if err:
                    error_count += 1
                    if "访问太频繁" in (err or ""):
                        consecutive_rate_limit += 1
                        if consecutive_rate_limit >= 3:
                            # 连续 3 次限流，放弃当前段，进入下一段
                            break
                    else:
                        consecutive_rate_limit = 0
                    continue
                consecutive_rate_limit = 0
                if not lst and total == 0:
                    consecutive_empty += 1
                    if consecutive_empty >= empty_threshold:
                        break
                    continue
                consecutive_empty = 0
                all_majors.extend(lst)
                distinct_zydms.update(m.get("zydm", "") for m in lst if m.get("zydm"))

                # total > 10 的 zydm 用 8 种 combo 拆分
                if total > 10:
                    target = total
                    for combo in _COMBOS_FOR_SPLIT:
                        current = sum(1 for m in all_majors if m.get("zydm") == zydm)
                        if current >= target:
                            break
                        lst2, _, _ = await _call_zys_do_httpx(
                            client, zydm, yjxkdm, xwlx, mldm, **combo
                        )
                        await asyncio.sleep(sleep_s)
                        all_majors.extend(lst2)
                        distinct_zydms.update(m.get("zydm", "") for m in lst2 if m.get("zydm"))

    return all_majors, error_count, len(distinct_zydms)


async def _process_one_yjxkdm(
    browser, yjxkdm: str, yjxkmc: str, mldm: str, mlmc: str, saved_cookies: list,
) -> dict[str, Any]:
    """单个 yjxkdm 的完整处理：Playwright 激活 + httpx 枚举.

    注意：first_list 为空时也走 httpx 枚举（如 0779 公共卫生与预防医学，
    zys.do 返回空但 0779Z1 流行病与卫生统计学等交叉学科可枚举到）。
    """
    from yam.crawler.dynamic import is_professional_degree

    xwlx = "zy" if is_professional_degree(yjxkdm + "00") else "xs"

    first_list, total, cookies, err = await _playwright_activate_session(
        browser, yjxkdm, xwlx, mldm, saved_cookies, yjxkmc=yjxkmc
    )
    if err:
        return {
            "yjxkdm": yjxkdm, "yjxkmc": yjxkmc, "mldm": mldm, "mlmc": mlmc,
            "majors": [], "error": err,
        }

    # 即使 first_list 为空，也走 httpx 枚举（可能拿到交叉学科 zydm）
    majors, err_cnt, _ = await _httpx_enumerate_yjxkdm(
        yjxkdm, xwlx, mldm, first_list, cookies
    )
    # 标准化 majors
    normalized = []
    for m in majors:
        normalized.append({
            "zydm": m.get("zydm", ""),
            "zymc": m.get("zymc", ""),
            "yjxkdm": yjxkdm,
            "yjxkmc": yjxkmc,
            "mldm": mldm,
            "mlmc": mlmc,
            "xwlx": m.get("xwlx", xwlx),
        })
    return {
        "yjxkdm": yjxkdm,
        "yjxkmc": yjxkmc,
        "mldm": mldm,
        "mlmc": mlmc,
        "majors": normalized,
        "error": None,
    }


async def update_all_majors(login: bool = False, resume: bool = False) -> dict[str, Any]:
    """遍历所有 yjxkdm，用 httpx + Playwright 激活方案拿完整专业列表.

    resume=True 时，加载 PARTIAL_JSON 中已完成的 yjxkdm，跳过这些不重跑。
    每批保存一次 PARTIAL_JSON，中断后可读已爬部分数据。
    """
    from yam.majors_searcher import MajorsSearcher
    from yam.crawler.dynamic import is_professional_degree

    yjxkdm_list = parse_yjxkdm_list_from_majors_ts()
    total = len(yjxkdm_list)

    # 断点续传：加载已存在的 partial JSON
    catalog: dict[str, dict[str, Any]] = {}
    failed: list[tuple[str, str]] = []
    completed_codes: set[str] = set()
    if resume and PARTIAL_JSON.exists():
        try:
            existing = json.loads(PARTIAL_JSON.read_text(encoding="utf-8"))
            completed_codes = set(existing.get("completed_yjxkdm", []))
            # 重建 catalog dict
            for cat in existing.get("academic_categories", []) + existing.get("professional_categories", []):
                mldm = cat["code"]
                mlmc = cat["name"]
                if mldm not in catalog:
                    catalog[mldm] = {"mlmc": mlmc, "disciplines": {}}
                for disc in cat["disciplines"]:
                    yjxkdm = disc["code"]
                    yjxkmc = disc["name"]
                    if yjxkdm not in catalog[mldm]["disciplines"]:
                        catalog[mldm]["disciplines"][yjxkdm] = {
                            "yjxkmc": yjxkmc,
                            "majors": [],
                        }
                    for m in disc["majors"]:
                        is_prof = is_professional_degree(yjxkdm + "00")
                        catalog[mldm]["disciplines"][yjxkdm]["majors"].append({
                            "zydm": m["code"],
                            "zymc": m["name"],
                            "yjxkdm": yjxkdm,
                            "yjxkmc": yjxkmc,
                            "mldm": mldm,
                            "mlmc": mlmc,
                            "xwlx": "zy" if is_prof else "xs",
                        })
            print(
                f"YAM_MAJORS_UPDATE_PROGRESS 0 {total} 恢复模式：已加载 {len(completed_codes)} 个已完成的 yjxkdm",
                flush=True,
            )
        except Exception as e:
            print(f"YAM_MAJORS_UPDATE_WARN resume 加载失败，重新开始: {e}", flush=True)
            catalog = {}
            failed = []
            completed_codes = set()
    else:
        print(f"YAM_MAJORS_UPDATE_PROGRESS 0 {total} 准备开始", flush=True)

    # 加载已保存的 cookies（登录后保存的）
    cookie_file = Path.home() / ".yam" / "cookies" / "yz.chsi.com.cn.json"
    saved_cookies = json.loads(cookie_file.read_text(encoding="utf-8")) if cookie_file.exists() else []

    # 检查登录态：cookies 中是否有 CASTGC
    has_login_cookie = any(
        c.get("name", "").upper() == "CASTGC" and c.get("value")
        for c in saved_cookies
    )

    if login or not has_login_cookie:
        # 首次需要登录：用 MajorsSearcher 打开可见浏览器让用户登录
        # 登录完成后 cookies 会保存到 ~/.yam/cookies/，后续可复用
        print(f"YAM_MAJORS_UPDATE_PROGRESS 0 {total} 等待登录", flush=True)
        searcher = MajorsSearcher(headless=False)
        await searcher._ensure_browser()
        logged_in = await searcher.interactive_login(
            major_code_for_login=yjxkdm_list[0][0] + "00"
        )
        await searcher.close()
        if not logged_in:
            print("YAM_MAJORS_UPDATE_ERROR 未检测到登录凭证", flush=True)
            return {"error": "未登录"}
        # 重新加载 cookies
        saved_cookies = json.loads(cookie_file.read_text(encoding="utf-8")) if cookie_file.exists() else []
        print(f"YAM_MAJORS_UPDATE_PROGRESS 0 {total} 登录成功", flush=True)
    else:
        print(f"YAM_MAJORS_UPDATE_PROGRESS 0 {total} 已检测到登录凭证", flush=True)

    # 过滤掉已完成的 yjxkdm
    pending = [
        (yjxkdm, yjxkmc, mldm, mlmc)
        for (yjxkdm, yjxkmc, mldm, mlmc) in yjxkdm_list
        if yjxkdm not in completed_codes
    ]
    total_pending = len(pending)
    already_done = total - total_pending
    if already_done > 0:
        print(
            f"YAM_MAJORS_UPDATE_PROGRESS {already_done} {total} 恢复模式：跳过 {already_done} 个已完成",
            flush=True,
        )

    total_batches = (total_pending + CONCURRENCY - 1) // CONCURRENCY

    # 启动 Playwright 单 browser，多 context 激活
    from playwright.async_api import async_playwright
    print(f"YAM_MAJORS_UPDATE_PROGRESS 0 {total} 启动浏览器", flush=True)
    async with async_playwright() as p:
        browser = await launch_browser(p.chromium, headless=True)
        try:
            print(f"YAM_MAJORS_UPDATE_PROGRESS 0 {total} 浏览器就绪", flush=True)

            sem = asyncio.Semaphore(CONCURRENCY)

            async def _run_with_sem(item):
                async with sem:
                    yjxkdm, yjxkmc, mldm, mlmc = item
                    # 通知前端：该 yjxkdm 开始处理
                    print(
                        f"YAM_MAJORS_UPDATE_BATCH_ITEM {yjxkdm} running {yjxkmc}",
                        flush=True,
                    )
                    try:
                        result = await _process_one_yjxkdm(
                            browser, yjxkdm, yjxkmc, mldm, mlmc, saved_cookies
                        )
                    except Exception as e:
                        print(
                            f"YAM_MAJORS_UPDATE_BATCH_ITEM {yjxkdm} failed {e}",
                            flush=True,
                        )
                        result = {
                            "yjxkdm": yjxkdm, "yjxkmc": yjxkmc,
                            "mldm": mldm, "mlmc": mlmc,
                            "majors": [], "error": str(e),
                        }

                    # 通知前端：完成
                    if result.get("error"):
                        print(
                            f"YAM_MAJORS_UPDATE_BATCH_ITEM {yjxkdm} failed {result['error']}",
                            flush=True,
                        )
                    else:
                        print(
                            f"YAM_MAJORS_UPDATE_BATCH_ITEM {yjxkdm} done 拿到 {len(result.get('majors', []))} 个专业",
                            flush=True,
                        )
                    return result

            processed = already_done
            need_login_break = False

            # 分批处理
            for batch_start in range(0, total_pending, CONCURRENCY):
                batch = pending[batch_start : batch_start + CONCURRENCY]
                batch_num = batch_start // CONCURRENCY + 1

                batch_info = json.dumps(
                    [{"yjxkdm": y, "yjxkmc": m} for y, m, _, _ in batch],
                    ensure_ascii=False,
                )
                print(
                    f"YAM_MAJORS_UPDATE_BATCH_START {batch_num} {total_batches} {batch_info}",
                    flush=True,
                )
                print(
                    f"YAM_MAJORS_UPDATE_PROGRESS {processed} {total} "
                    f"批次 {batch_num}/{total_batches} ({len(batch)} 个学科并发)",
                    flush=True,
                )

                # 并发执行批次
                tasks = [_run_with_sem(item) for item in batch]
                results = await asyncio.gather(*tasks)

                for r in results:
                    processed += 1
                    yjxkdm = r["yjxkdm"]
                    yjxkmc = r["yjxkmc"]
                    mldm = r["mldm"]
                    mlmc = r["mlmc"]

                    if r.get("error"):
                        # "请登录" 类错误中断整个流程
                        if "登录" in (r["error"] or ""):
                            print(
                                f"YAM_MAJORS_UPDATE_ERROR 需要登录才能继续查询（在 {yjxkdm} 处中断）",
                                flush=True,
                            )
                            need_login_break = True
                            break
                        print(
                            f"YAM_MAJORS_UPDATE_WARN {yjxkdm} 查询失败: {r['error']}",
                            flush=True,
                        )
                        failed.append((yjxkdm, r["error"]))
                        continue

                    majors = r.get("majors", [])
                    print(
                        f"  [debug] {yjxkdm} {yjxkmc} 拿到 {len(majors)} 个专业",
                        flush=True,
                    )
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

                    # 聚合到 catalog
                    if mldm not in catalog:
                        catalog[mldm] = {"mlmc": mlmc, "disciplines": {}}
                    if yjxkdm not in catalog[mldm]["disciplines"]:
                        catalog[mldm]["disciplines"][yjxkdm] = {
                            "yjxkmc": yjxkmc,
                            "majors": [],
                        }
                    catalog[mldm]["disciplines"][yjxkdm]["majors"].extend(majors)
                    completed_codes.add(yjxkdm)

                    print(
                        f"YAM_MAJORS_UPDATE_PROGRESS {processed} {total} {yjxkdm} {yjxkmc}",
                        flush=True,
                    )

                if need_login_break:
                    break

                # 批后增量保存
                partial_output = _build_catalog_output(
                    catalog,
                    failed,
                    total,
                    sorted(completed_codes),
                    is_partial=True,
                )
                _atomic_write_json(PARTIAL_JSON, partial_output)
                print(
                    f"YAM_MAJORS_UPDATE_PROGRESS {processed} {total} "
                    f"(批次 {batch_num} 完成，已保存 {len(completed_codes)} 个学科)",
                    flush=True,
                )
        finally:
            await browser.close()

    # 构建最终输出
    output = _build_catalog_output(
        catalog,
        failed,
        total,
        sorted(completed_codes),
        is_partial=False,
    )

    # 写入最终 JSON
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    _atomic_write_json(OUTPUT_JSON, output)
    # 清理 partial 文件
    if PARTIAL_JSON.exists():
        try:
            PARTIAL_JSON.unlink()
        except Exception:
            pass

    print(
        f"YAM_MAJORS_UPDATE_DONE {json.dumps(output, ensure_ascii=False)}",
        flush=True,
    )
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description="更新整个专业目录")
    parser.add_argument(
        "--login",
        action="store_true",
        help="首次需要登录时加上此参数",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="断点续传：加载 majors_realtime.partial.json 中已完成的 yjxkdm",
    )
    args = parser.parse_args()

    try:
        result = asyncio.run(update_all_majors(login=args.login, resume=args.resume))
    except BrowserMissingError as e:
        print(f"YAM_ERROR BROWSER_MISSING {e}", flush=True)
        sys.exit(1)
    except Exception as e:
        print(f"YAM_MAJORS_UPDATE_ERROR {e}", flush=True)
        sys.exit(1)

    if "error" in result:
        sys.exit(1)


if __name__ == "__main__":
    main()

