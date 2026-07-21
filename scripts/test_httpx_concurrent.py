"""E2-E: 测并发 httpx 枚举（3 个 yjxkdm 同时跑）.

验证：5 个 yjxkdm 并发，每个内部串行（500ms 间隔），整体是否触发限流。
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


async def call_zys_do_httpx_combo(
    client: httpx.AsyncClient, zydm: str, yjxkdm: str, xwlx: str, mldm: str,
    jsggjh: str = "", tydxs: str = "",
) -> tuple[list[dict], int, str | None]:
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


async def playwright_activate(
    yjxkdm: str, xwlx: str, mldm: str
) -> tuple[list[dict], int, dict[str, str], str | None]:
    """用 Playwright 激活 session（独立 context）."""
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
            await page.goto(f"{BASE_URL}/zsml/", wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(150)

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
                await page.goto(detail_url_with_sign, wait_until="domcontentloaded", timeout=30000)
                await page.wait_for_timeout(200)
                await page.goto(f"{BASE_URL}/zsml/", wait_until="domcontentloaded", timeout=30000)
                await page.wait_for_timeout(150)

            all_cookies = await context.cookies()
            cookies_dict = {
                c["name"]: c["value"]
                for c in all_cookies
                if "chsi.com.cn" in c.get("domain", "") and c.get("value")
            }
            return first_list, total, cookies_dict, None
        finally:
            await browser.close()


async def httpx_enumerate_one(
    yjxkdm: str, xwlx: str, mldm: str,
    first_list: list[dict], cookies: dict[str, str],
) -> tuple[str, int, int, float]:
    """单个 yjxkdm 的 httpx 枚举，返回 (yjxkdm, majors_n, zydms_n, elapsed)."""
    t0 = time.time()
    initial_zydm = yjxkdm + "00"
    all_majors: list[dict] = list(first_list)
    distinct_zydms: set[str] = {m.get("zydm", "") for m in first_list if m.get("zydm")}

    segments: list[tuple[list[str], int]] = [
        ([f"{yjxkdm}0{i}" for i in range(10)], 5),
        ([f"{yjxkdm}J{i}" for i in range(10)], 3),
        ([f"{yjxkdm}Z{i}" for i in range(10)], 3),
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
                await asyncio.sleep(0.5)
                if err:
                    if "访问太频繁" in (err or ""):
                        await asyncio.sleep(2)
                        lst, total, err = await call_zys_do_httpx_combo(
                            client, zydm, yjxkdm, xwlx, mldm
                        )
                        await asyncio.sleep(0.5)
                    if err:
                        continue
                if not lst and total == 0:
                    consecutive_empty += 1
                    if consecutive_empty >= empty_threshold:
                        break
                    continue
                consecutive_empty = 0
                all_majors.extend(lst)
                distinct_zydms.update(m.get("zydm", "") for m in lst if m.get("zydm"))

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

    seen: set[tuple[str, str]] = set()
    unique: list[dict] = []
    for m in all_majors:
        key = (m.get("zydm", ""), m.get("zymc", ""))
        if key in seen:
            continue
        seen.add(key)
        unique.append(m)
    return yjxkdm, len(unique), len(distinct_zydms), time.time() - t0


async def run_one_full(yjxkdm: str, xwlx: str, mldm: str) -> tuple[str, int, int, float]:
    """Playwright 激活 + httpx 枚举."""
    t0 = time.time()
    first_list, total, cookies, err = await playwright_activate(yjxkdm, xwlx, mldm)
    if err:
        return yjxkdm, 0, 0, 0
    _, n_majors, n_zydms, elapsed = await httpx_enumerate_one(
        yjxkdm, xwlx, mldm, first_list, cookies
    )
    return yjxkdm, n_majors, n_zydms, time.time() - t0


async def main() -> None:
    import sys
    concurrency = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    # 10 个不同 yjxkdm（覆盖小/中/大数据量）
    all_targets = [
        ("0101", "xs", "01", 11),     # 小
        ("0201", "xs", "02", 25),     # 中
        ("0202", "xs", "02", 71),     # 大
        ("0301", "xs", "03", 84),     # 大
        ("0302", "xs", "03", 14),     # 小
        ("0303", "xs", "03", 0),      # 社会学，未知
        ("0401", "xs", "04", 0),      # 教育学，未知
        ("0402", "xs", "04", 0),      # 心理学，未知
        ("0501", "xs", "05", 0),      # 中国语言文学，未知
        ("0502", "xs", "05", 0),      # 外国语言文学，未知
        ("0602", "xs", "06", 0),      # 中国史，未知
        ("0701", "xs", "07", 0),      # 数学，未知
        ("0702", "xs", "07", 0),      # 物理学，未知
        ("0801", "xs", "08", 0),      # 力学，未知
        ("0802", "xs", "08", 0),      # 机械工程，未知
    ]
    targets = all_targets[:concurrency]
    print(f"=== E2-E: 并发 {len(targets)} 个 yjxkdm 测试 ===")
    sem = asyncio.Semaphore(concurrency)

    async def run_with_sem(yjxkdm: str, xwlx: str, mldm: str) -> tuple[str, int, int, float]:
        async with sem:
            return await run_one_full(yjxkdm, xwlx, mldm)

    t0 = time.time()
    results = await asyncio.gather(*[run_with_sem(y, x, m) for y, x, m, _ in targets])
    t1 = time.time()
    total_majors = sum(n for _, n, _, _ in results)
    print(f"\n总耗时: {t1-t0:.2f}s (并发 {len(targets)}, 平均 {(t1-t0)/len(targets):.1f}s/yjxkdm)")
    print(f"总 majors: {total_majors}")
    print()
    for yjxkdm, n_majors, n_zydms, elapsed in sorted(results, key=lambda x: x[1], reverse=True):
        expected = next((e for y, _, _, e in targets if y == yjxkdm), 0)
        if expected > 0:
            pct = n_majors / expected * 100
            print(f"  {yjxkdm}: majors={n_majors} (expected {expected}, {pct:.0f}%) zydms={n_zydms} 耗时={elapsed:.1f}s")
        else:
            print(f"  {yjxkdm}: majors={n_majors} zydms={n_zydms} 耗时={elapsed:.1f}s")


if __name__ == "__main__":
    asyncio.run(main())
