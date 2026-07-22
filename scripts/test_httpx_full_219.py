"""E2-G: 跑完整 219 个 yjxkdm，验证总时长和数据质量.

用 30 并发跑 Playwright 激活 + httpx 枚举，输出到 partial JSON 兼容格式。
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
from pathlib import Path
from urllib.parse import urlencode

import httpx

# 复用 update_majors_catalog 的 yjxkdm 列表解析
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from yam.scripts.update_majors_catalog import parse_yjxkdm_list_from_majors_ts  # noqa: E402
from yam.crawler.dynamic import is_professional_degree  # noqa: E402

BASE_URL = "https://yz.chsi.com.cn"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

CONCURRENCY = 30
ZYDM_SLEEP_MS = 500
OUTPUT_JSON = Path(__file__).resolve().parent.parent / "data" / "majors_realtime.json"

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


async def playwright_activate_with_browser(
    browser, yjxkdm: str, xwlx: str, mldm: str, saved_cookies: list
) -> tuple[list[dict], int, dict[str, str], str | None]:
    initial_zydm = yjxkdm + "00"

    context = await browser.new_context(user_agent=UA)
    try:
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
        await context.close()


async def httpx_enumerate_one(
    yjxkdm: str, xwlx: str, mldm: str,
    first_list: list[dict], cookies: dict[str, str],
) -> tuple[list[dict], int, int, int]:
    """单个 yjxkdm 的 httpx 枚举，返回 (majors, n_majors, n_zydms, error_count)."""
    initial_zydm = yjxkdm + "00"
    all_majors: list[dict] = list(first_list)
    distinct_zydms: set[str] = {m.get("zydm", "") for m in first_list if m.get("zydm")}
    error_count = 0

    segments: list[tuple[list[str], int]] = [
        ([f"{yjxkdm}0{i}" for i in range(10)], 5),
        ([f"{yjxkdm}J{i}" for i in range(10)], 3),
        ([f"{yjxkdm}Z{i}" for i in range(10)], 3),
    ]

    sleep_s = ZYDM_SLEEP_MS / 1000.0

    async with httpx.AsyncClient(
        http2=False,
        follow_redirects=True,
        headers={"User-Agent": UA},
        cookies=cookies,
    ) as client:
        for candidates, empty_threshold in segments:
            consecutive_empty = 0
            for zydm in candidates:
                if zydm == initial_zydm:
                    continue
                lst, total, err = await call_zys_do_httpx_combo(
                    client, zydm, yjxkdm, xwlx, mldm
                )
                await asyncio.sleep(sleep_s)
                if err:
                    error_count += 1
                    if "访问太频繁" in (err or ""):
                        await asyncio.sleep(2)
                        lst, total, err = await call_zys_do_httpx_combo(
                            client, zydm, yjxkdm, xwlx, mldm
                        )
                        await asyncio.sleep(sleep_s)
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
                        await asyncio.sleep(sleep_s)
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
    return unique, len(unique), len(distinct_zydms), error_count


async def run_one_full(
    browser, yjxkdm: str, yjxkmc: str, mldm: str, mlmc: str, saved_cookies: list,
) -> dict:
    """Playwright 激活 + httpx 枚举，返回标准化结果."""
    xwlx = "zy" if is_professional_degree(yjxkdm + "00") else "xs"
    first_list, total, cookies, err = await playwright_activate_with_browser(
        browser, yjxkdm, xwlx, mldm, saved_cookies
    )
    if err:
        return {
            "yjxkdm": yjxkdm, "yjxkmc": yjxkmc, "mldm": mldm, "mlmc": mlmc,
            "majors": [], "error": err,
        }
    majors, n_majors, n_zydms, err_cnt = await httpx_enumerate_one(
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
        "n_zydms": n_zydms,
        "err_count": err_cnt,
    }


async def main() -> None:
    print("=== E2-G: 完整 219 个 yjxkdm 验证 ===")
    print(f"参数: CONCURRENCY={CONCURRENCY}, ZYDM_SLEEP_MS={ZYDM_SLEEP_MS}")
    print()

    yjxkdm_list = parse_yjxkdm_list_from_majors_ts()
    total = len(yjxkdm_list)
    print(f"从 majors.ts 解析到 {total} 个 yjxkdm")

    # 加载已保存的 cookies
    cookie_file = Path.home() / ".yam" / "cookies" / "yz.chsi.com.cn.json"
    saved_cookies = json.loads(cookie_file.read_text(encoding="utf-8")) if cookie_file.exists() else []

    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            sem = asyncio.Semaphore(CONCURRENCY)

            async def run_with_sem(item):
                async with sem:
                    return await run_one_full(browser, *item, saved_cookies)

            t0 = time.time()
            print(f"[{0:.1f}s] 开始并发处理 {total} 个 yjxkdm...")

            # 分批处理，每批 CONCURRENCY 个，避免内存爆炸
            results: list[dict] = []
            batch_size = CONCURRENCY
            processed = 0
            for batch_start in range(0, total, batch_size):
                batch = yjxkdm_list[batch_start : batch_start + batch_size]
                batch_results = await asyncio.gather(*[run_with_sem(item) for item in batch])
                results.extend(batch_results)
                processed += len(batch)
                elapsed = time.time() - t0
                print(
                    f"[{elapsed:.1f}s] 已完成 {processed}/{total} ({processed*100//total}%)，"
                    f"累计 {sum(len(r.get('majors', [])) for r in results)} majors",
                    flush=True,
                )

            t1 = time.time()
        finally:
            await browser.close()

    total_majors = sum(len(r.get("majors", [])) for r in results)
    total_errors = sum(r.get("err_count", 0) for r in results)
    failed = sum(1 for r in results if r.get("error"))

    print()
    print(f"=== 完成 ===")
    print(f"总耗时: {t1-t0:.1f}s ({(t1-t0)/60:.1f} 分钟)")
    print(f"总 majors: {total_majors}")
    print(f"总 errors: {total_errors}")
    print(f"失败 yjxkdm: {failed}")
    print(f"平均每个 yjxkdm: {(t1-t0)/total:.2f}s, {total_majors/total:.1f} majors")

    # 数据质量统计
    print("\n=== 数据质量分布 ===")
    n_0 = sum(1 for r in results if len(r.get("majors", [])) == 0)
    n_1_5 = sum(1 for r in results if 1 <= len(r.get("majors", [])) <= 5)
    n_6_20 = sum(1 for r in results if 6 <= len(r.get("majors", [])) <= 20)
    n_21_50 = sum(1 for r in results if 21 <= len(r.get("majors", [])) <= 50)
    n_51_100 = sum(1 for r in results if 51 <= len(r.get("majors", [])) <= 100)
    n_100_plus = sum(1 for r in results if len(r.get("majors", [])) > 100)
    print(f"  0 majors: {n_0}")
    print(f"  1-5 majors: {n_1_5}")
    print(f"  6-20 majors: {n_6_20}")
    print(f"  21-50 majors: {n_21_50}")
    print(f"  51-100 majors: {n_51_100}")
    print(f"  >100 majors: {n_100_plus}")

    # 输出最大/最小的 5 个
    sorted_results = sorted(results, key=lambda x: len(x.get("majors", [])), reverse=True)
    print("\n=== Top 5 (majors 最多) ===")
    for r in sorted_results[:5]:
        print(f"  {r['yjxkdm']} {r['yjxkmc']}: {len(r.get('majors', []))} majors")
    print("\n=== Bottom 5 (majors 最少) ===")
    for r in sorted_results[-5:]:
        print(f"  {r['yjxkdm']} {r['yjxkmc']}: {len(r.get('majors', []))} majors")

    # 写入 JSON
    print(f"\n写入 {OUTPUT_JSON}...")
    catalog = build_catalog(results, yjxkdm_list)
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSON.write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"完成，文件大小: {OUTPUT_JSON.stat().st_size / 1024:.1f} KB")


def build_catalog(results: list[dict], yjxkdm_list: list) -> dict:
    """根据 results 构建最终 JSON 输出结构（按学位类型拆分）."""
    from yam.crawler.dynamic import is_professional_degree

    catalog: dict[str, dict] = {}
    for r in results:
        mldm = r["mldm"]
        mlmc = r["mlmc"]
        yjxkdm = r["yjxkdm"]
        yjxkmc = r["yjxkmc"]
        if mldm not in catalog:
            catalog[mldm] = {"mlmc": mlmc, "disciplines": {}}
        catalog[mldm]["disciplines"][yjxkdm] = {
            "yjxkmc": yjxkmc,
            "majors": r.get("majors", []),
        }

    academic_categories: list[dict] = []
    professional_categories: list[dict] = []

    for mldm in sorted(catalog.keys()):
        cat = catalog[mldm]
        academic_disciplines: list[dict] = []
        professional_disciplines: list[dict] = []

        for yjxkdm in sorted(cat["disciplines"].keys()):
            disc = cat["disciplines"][yjxkdm]
            seen: set[tuple[str, str]] = set()
            unique_majors: list[dict] = []
            for m in disc["majors"]:
                key = (m.get("zydm", ""), m.get("zymc", ""))
                if key in seen:
                    continue
                seen.add(key)
                unique_majors.append({"code": m["zydm"], "name": m["zymc"]})
            unique_majors.sort(key=lambda x: x["code"])

            # 兜底：研招网对专业学位（0854 等）按一级学科招生，
            # zys.do 返回 totalCount=0 + 空 list 是真实情况，注入 yjxkdm+"00" 作为 fallback。
            # 这与 update_majors_catalog.py 行为一致。
            if not unique_majors:
                unique_majors = [{
                    "code": yjxkdm + "00",
                    "name": disc["yjxkmc"],
                }]

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

    completed_codes = [r["yjxkdm"] for r in results if not r.get("error")]
    return {
        "academic_categories": academic_categories,
        "professional_categories": professional_categories,
        "failed": [(r["yjxkdm"], r.get("error", "")) for r in results if r.get("error")],
        "total_yjxkdm": len(yjxkdm_list),
        "success_yjxkdm": len(completed_codes),
        "completed_yjxkdm": completed_codes,
        "is_partial": False,
    }


if __name__ == "__main__":
    asyncio.run(main())
