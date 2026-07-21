"""E2-D2: 用正确的 zydm 格式重测 httpx.

关键修正：
- base: {yjxkdm}0{i} for i in 0..9 (XX00-XX09, 共 10 个)
- J:    {yjxkdm}J{i} for i in 0..9 (XXJ0-XXJ9, 共 10 个)
- Z:    {yjxkdm}Z{i} for i in 0..9 (XXZ0-XXZ9, 共 10 个)

流程：
1. 用 Playwright 拿 seed_major（含 sign）+ 激活完整 session
2. 提取 cookies 给 httpx
3. httpx 用正确 zydm 格式枚举
4. 对比 Playwright 自己跑完整流程的结果
"""

from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path
from urllib.parse import urlencode

import httpx

BASE_URL = "https://yz.chsi.com.cn"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)


async def call_zys_do_httpx(
    client: httpx.AsyncClient, zydm: str, yjxkdm: str, xwlx: str, mldm: str
) -> tuple[list[dict], int, str | None]:
    """用 httpx 调一次 zys.do."""
    api_url = f"{BASE_URL}/zsml/rs/zys.do"
    data = {
        "zydm": zydm, "zymc": "", "xwlx": xwlx, "mldm": mldm,
        "yjxkdm": yjxkdm, "xxfs": "", "tydxs": "", "jsggjh": "",
        "start": "0", "curPage": "1", "pageSize": "10",
        "totalPage": "0", "totalCount": "0",
    }
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": f"{BASE_URL}/zsml/",
    }
    r = await client.post(api_url, content=urlencode(data), headers=headers, timeout=30.0)
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


async def playwright_activate_and_get_seed(
    yjxkdm: str, xwlx: str, mldm: str
) -> tuple[list[dict], int, dict[str, str], str | None]:
    """用 Playwright 激活 session + 拿 seed_major（含 sign）.

    返回 (first_list, total, cookies_dict, error).
    """
    from playwright.async_api import async_playwright

    cookie_file = Path.home() / ".yam" / "cookies" / "yz.chsi.com.cn.json"
    saved_cookies = json.loads(cookie_file.read_text(encoding="utf-8")) if cookie_file.exists() else []

    initial_zydm = yjxkdm + "00"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            context = await browser.new_context(user_agent=UA)
            if saved_cookies:
                await context.add_cookies(saved_cookies)

            page = await context.new_page()
            # 1. 访问 zsml 首页
            await page.goto(f"{BASE_URL}/zsml/", wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(150)

            # 2. 第 1 次调 zys.do 拿 seed_major
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
            msg = result.get("msg", {})
            if isinstance(msg, str):
                return [], 0, {}, f"第 1 次失败: {msg}"
            first_list = msg.get("list", []) or []
            total = int(msg.get("totalCount", 0) or 0)

            # 3. 如果有 seed_major，用其 sign 构造 detail_url 并访问（关键！）
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
                    f"&xxfs="
                    f"&tydxs="
                    f"&jsggjh="
                    f"&sign={seed.get('sign', '')}"
                    f"&sign2={seed.get('sign2', '')}"
                )
                await page.goto(detail_url_with_sign, wait_until="domcontentloaded", timeout=30000)
                await page.wait_for_timeout(200)
                await page.goto(f"{BASE_URL}/zsml/", wait_until="domcontentloaded", timeout=30000)
                await page.wait_for_timeout(150)

            # 4. 提取 cookies
            all_cookies = await context.cookies()
            cookies_dict = {
                c["name"]: c["value"]
                for c in all_cookies
                if "chsi.com.cn" in c.get("domain", "") and c.get("value")
            }
            return first_list, total, cookies_dict, None
        finally:
            await browser.close()


async def call_zys_do_httpx_combo(
    client: httpx.AsyncClient, zydm: str, yjxkdm: str, xwlx: str, mldm: str,
    jsggjh: str = "", tydxs: str = "",
) -> tuple[list[dict], int, str | None]:
    """用 httpx 调一次 zys.do（支持 combo 拆分）."""
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
    r = await client.post(api_url, content=urlencode(data), headers=headers, timeout=30.0)
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


# totalCount>10 的 zydm 用 8 种 combo 拆分（和 Playwright 一致）
COMBOS_FOR_SPLIT = [
    {"jsggjh": "0"},
    {"jsggjh": "1"},
    {"tydxs": "0"},
    {"tydxs": "1"},
    {"jsggjh": "0", "tydxs": "0"},
    {"jsggjh": "0", "tydxs": "1"},
    {"jsggjh": "1", "tydxs": "0"},
    {"jsggjh": "1", "tydxs": "1"},
]


async def httpx_enumerate(
    cookies: dict[str, str], yjxkdm: str, xwlx: str, mldm: str,
    first_list: list[dict],
) -> tuple[int, int]:
    """用 httpx 复用 cookies 枚举所有 zydm（含 combo 拆分）.

    返回 (majors_count, distinct_zydms).
    """
    initial_zydm = yjxkdm + "00"
    all_majors: list[dict] = list(first_list)
    distinct_zydms: set[str] = {m.get("zydm", "") for m in first_list if m.get("zydm")}
    zydm_details: list[tuple[str, int, int]] = [(initial_zydm, len(first_list), 0)]  # (zydm, list_n, total)

    # 正确的 zydm 格式（和 Playwright 一致）
    segments: list[tuple[list[str], int]] = [
        ([f"{yjxkdm}0{i}" for i in range(10)], 5),  # base XX00-XX09
        ([f"{yjxkdm}J{i}" for i in range(10)], 3),  # J 自设
        ([f"{yjxkdm}Z{i}" for i in range(10)], 3),  # Z 交叉
    ]

    async with httpx.AsyncClient(
        http2=False,
        follow_redirects=True,
        headers={"User-Agent": UA},
        cookies=cookies,
    ) as client:
        for seg_idx, (candidates, empty_threshold) in enumerate(segments):
            consecutive_empty = 0
            for zydm in candidates:
                if zydm == initial_zydm:
                    continue
                lst, total, err = await call_zys_do_httpx_combo(
                    client, zydm, yjxkdm, xwlx, mldm
                )
                # ISSUE-023: 限流保护——httpx 请求间隔短，连续 ~10 个会触发"访问太频繁"
                # 等待 500ms 让服务器限流恢复（Playwright 浏览器自动有 ~300ms 延迟）
                await asyncio.sleep(0.5)
                if err:
                    # 限流时多等一会
                    if "访问太频繁" in (err or ""):
                        await asyncio.sleep(2)
                        # 重试一次
                        lst, total, err = await call_zys_do_httpx_combo(
                            client, zydm, yjxkdm, xwlx, mldm
                        )
                        await asyncio.sleep(0.5)
                    if err:
                        print(f"    [seg{seg_idx}] {zydm}: err={err}")
                        continue
                if not lst and total == 0:
                    consecutive_empty += 1
                    if consecutive_empty >= empty_threshold:
                        print(f"    [seg{seg_idx}] {zydm}: 空 (break)")
                        break
                    print(f"    [seg{seg_idx}] {zydm}: 空")
                    continue
                consecutive_empty = 0
                all_majors.extend(lst)
                distinct_zydms.update(m.get("zydm", "") for m in lst if m.get("zydm"))
                zydm_details.append((zydm, len(lst), total))
                print(f"    [seg{seg_idx}] {zydm}: list={len(lst)} total={total}")

                # 如果 total > 10，用 8 种 combo 拆分
                if total > 10:
                    target = total
                    for combo in COMBOS_FOR_SPLIT:
                        current = sum(1 for m in all_majors if m.get("zydm") == zydm)
                        if current >= target:
                            break
                        lst2, _, _ = await call_zys_do_httpx_combo(
                            client, zydm, yjxkdm, xwlx, mldm, **combo
                        )
                        await asyncio.sleep(0.5)
                        all_majors.extend(lst2)
                        distinct_zydms.update(m.get("zydm", "") for m in lst2 if m.get("zydm"))
                        print(f"      combo {combo}: +{len(lst2)}")

    # 打印详情
    print(f"  httpx 枚举的 zydms: {[(z, n) for z, n, _ in zydm_details]}")

    # 去重
    seen: set[tuple[str, str]] = set()
    unique: list[dict] = []
    for m in all_majors:
        key = (m.get("zydm", ""), m.get("zymc", ""))
        if key in seen:
            continue
        seen.add(key)
        unique.append(m)
    return len(unique), len(distinct_zydms)


async def main() -> None:
    for yjxkdm, name, xwlx, mldm, pw_expected in [
        ("0101", "哲学", "xs", "01", 11),
        ("0202", "应用经济学", "xs", "02", 71),
    ]:
        print(f"\n=== {yjxkdm} {name}（Playwright 期望 {pw_expected} majors） ===")
        t0 = time.time()
        # 1. Playwright 激活 + 拿 seed
        first_list, total, cookies, err = await playwright_activate_and_get_seed(
            yjxkdm, xwlx, mldm
        )
        if err:
            print(f"  ❌ Playwright 激活失败: {err}")
            continue
        t1 = time.time()
        print(f"  Playwright 激活: first_list={len(first_list)} total={total} cookies={len(cookies)} 耗时={t1-t0:.2f}s")

        # 2. httpx 接管枚举
        n_majors, n_zydms = await httpx_enumerate(cookies, yjxkdm, xwlx, mldm, first_list)
        t2 = time.time()
        print(f"  httpx 枚举: majors={n_majors} distinct_zydms={n_zydms} 耗时={t2-t1:.2f}s")
        print(f"  对比 Playwright: {pw_expected} majors")
        pct = n_majors / pw_expected * 100 if pw_expected else 0
        print(f"  数据完整度: {pct:.1f}%")


if __name__ == "__main__":
    asyncio.run(main())
