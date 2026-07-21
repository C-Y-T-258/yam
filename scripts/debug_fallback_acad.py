"""调试 50 个学术学位 fallback 的问题：单独跑几个看看日志.

直接调用 _process_one_yjxkdm 跑 0270、0307、0770 等，看 first_list 和枚举日志.
"""
from __future__ import annotations

import asyncio
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from playwright.async_api import async_playwright  # noqa: E402
from yam.scripts.update_majors_catalog import (  # noqa: E402
    _process_one_yjxkdm,
    _playwright_activate_session,
    _httpx_enumerate_yjxkdm,
)
from yam.crawler.dynamic import is_professional_degree  # noqa: E402


# 异常 fallback 的学术学位
TEST_CODES = [
    ("0270", "统计学", "02", "经济学"),
    ("0307", "中共党史党建学", "03", "法学"),
    ("0770", "集成电路科学与工程", "07", "理学"),
    ("0779", "公共卫生与预防医学", "07", "理学"),
    ("0860", "生物与医药", "08", "工学"),
    ("0302", "政治学", "03", "法学"),  # 之前 37，桌面端跑只 14
]


async def main():
    cookie_file = Path.home() / ".yam" / "cookies" / "yz.chsi.com.cn.json"
    saved_cookies = json.loads(cookie_file.read_text(encoding="utf-8")) if cookie_file.exists() else []
    print(f"loaded {len(saved_cookies)} cookies")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            # 顺序跑（不并发），看每个 yjxkdm 的真实数据
            for yjxkdm, yjxkmc, mldm, mlmc in TEST_CODES:
                print(f"\n=== {yjxkdm} {yjxkmc} ===")
                xwlx = "zy" if is_professional_degree(yjxkdm + "00") else "xs"
                print(f"xwlx={xwlx}, is_prof={is_professional_degree(yjxkdm + '00')}")

                t0 = time.time()
                first_list, total, cookies, err = await _playwright_activate_session(
                    browser, yjxkdm, xwlx, mldm, saved_cookies, yjxkmc=yjxkmc
                )
                t1 = time.time()
                print(f"激活耗时: {t1-t0:.1f}s")
                print(f"first_list: {len(first_list)} 个, total_count={total}, err={err}")
                print(f"cookies 拿到: {len(cookies)} 个")
                if first_list:
                    print(f"  第 1 个: zydm={first_list[0].get('zydm')}, zymc={first_list[0].get('zymc')}")

                # 即使 first_list 为空也走枚举
                t2 = time.time()
                majors, err_cnt, n_zydms = await _httpx_enumerate_yjxkdm(
                    yjxkdm, xwlx, mldm, first_list, cookies
                )
                t3 = time.time()
                print(f"枚举耗时: {t3-t2:.1f}s")
                print(f"枚举结果: {len(majors)} 个 majors, {n_zydms} 个 distinct zydms, {err_cnt} 个 errors")
                if majors:
                    seen = set()
                    unique = []
                    for m in majors:
                        key = (m.get("zydm", ""), m.get("zymc", ""))
                        if key in seen:
                            continue
                        seen.add(key)
                        unique.append(m)
                    print(f"去重后: {len(unique)} 个")
                    for m in unique[:5]:
                        print(f"  {m.get('zydm')} {m.get('zymc')}")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
