"""E2-A2: 用 httpx 完整枚举 0101 哲学的所有 zydm，对比 Playwright 结果.

预期：能拿到 8+ majors（与 Playwright 一致）。
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
from pathlib import Path
from urllib.parse import urlencode

import httpx

BASE_URL = "https://yz.chsi.com.cn"
COOKIE_FILE = Path.home() / ".yam" / "cookies" / "yz.chsi.com.cn.json"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)


def load_login_cookies() -> dict[str, str]:
    raw = json.loads(COOKIE_FILE.read_text(encoding="utf-8"))
    return {
        c["name"]: c["value"]
        for c in raw
        if "chsi.com.cn" in c.get("domain", "") and c.get("value")
    }


async def call_zys_do(
    client: httpx.AsyncClient,
    zydm: str,
    yjxkdm: str,
    xwlx: str,
    mldm: str,
    jsggjh: str = "",
    detail_url: str = "",
) -> tuple[list[dict], int, str | None]:
    """调一次 zys.do，可选先访问详情页（第一次调用时需要）."""
    if detail_url:
        r = await client.get(detail_url, timeout=30.0)
        if r.status_code != 200:
            return [], 0, f"详情页 HTTP {r.status_code}"
        await asyncio.sleep(0.15)  # 模拟 wait_for_timeout
    api_url = f"{BASE_URL}/zsml/rs/zys.do"
    data = {
        "zydm": zydm,
        "zymc": "",
        "xwlx": xwlx,
        "mldm": mldm,
        "yjxkdm": yjxkdm,
        "xxfs": "",
        "tydxs": "",
        "jsggjh": jsggjh,
        "start": "0",
        "curPage": "1",
        "pageSize": "10",
        "totalPage": "0",
        "totalCount": "0",
    }
    headers = {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json, text/plain, */*",
        "Referer": detail_url or f"{BASE_URL}/zsml/",
        "Origin": BASE_URL,
    }
    r = await client.post(api_url, content=urlencode(data), headers=headers, timeout=30.0)
    if r.status_code != 200:
        return [], 0, f"zys.do HTTP {r.status_code}"
    try:
        result = r.json()
    except Exception as e:
        return [], 0, f"zys.do JSON 解析失败: {e}"
    msg = result.get("msg", {})
    if isinstance(msg, str):
        return [], 0, msg
    if not isinstance(msg, dict):
        return [], 0, "msg 类型异常"
    return msg.get("list", []) or [], int(msg.get("totalCount", 0) or 0), None


async def search_yjxkdm_full(yjxkdm: str, xwlx: str, mldm: str) -> tuple[int, int, str | None]:
    """完整枚举一个 yjxkdm 的所有 zydm，返回 (majors_count, distinct_zydms, err)."""
    login_cookies = load_login_cookies()
    async with httpx.AsyncClient(
        http2=False,
        follow_redirects=True,
        headers={"User-Agent": UA},
        cookies=login_cookies,
    ) as client:
        # 1. 访问 zsml 首页拿 JSESSIONID
        r = await client.get(f"{BASE_URL}/zsml/", timeout=30.0)
        if r.status_code != 200:
            return 0, 0, f"zsml 首页 HTTP {r.status_code}"

        # 2. 第 1 次调用：zydm=yjxkdm+"00" 拿 seed_major
        initial_zydm = yjxkdm + "00"
        detail_url = (
            f"{BASE_URL}/zsml/zydetail.do?"
            f"zydm={initial_zydm}&zymc=&xwlx={xwlx}&mldm={mldm}&mlmc="
            f"&yjxkdm={yjxkdm}&yjxkmc=&xxfs=1"
        )
        first_list, total, err = await call_zys_do(
            client, initial_zydm, yjxkdm, xwlx, mldm, detail_url=detail_url
        )
        if err:
            return 0, 0, f"第 1 次调用失败: {err}"

        all_majors: list[dict] = list(first_list)
        distinct_zydms: set[str] = {m.get("zydm", "") for m in first_list if m.get("zydm")}

        # 3. 如果 total <=1，尝试不依赖 sign 的详情页建立 session，重试
        if total <= 1:
            # goto 详情页（不依赖 sign）建立 session
            r = await client.get(detail_url, timeout=30.0)
            await asyncio.sleep(0.3)
            # 重试 zys.do（不传 detail_url 避免再次 goto）
            retry_list, retry_total, retry_err = await call_zys_do(
                client, initial_zydm, yjxkdm, xwlx, mldm
            )
            if retry_err is None and (retry_total > total or len(retry_list) > len(first_list)):
                all_majors = list(retry_list)
                distinct_zydms = {m.get("zydm", "") for m in retry_list if m.get("zydm")}
                total = retry_total

        # 4. 枚举其他 zydm（XX01-XX99 + J/Z 自设）
        for i in range(1, 100):
            zydm = f"{yjxkdm}{i:02d}"
            if zydm == initial_zydm:
                continue
            lst, _, _ = await call_zys_do(
                client, zydm, yjxkdm, xwlx, mldm
            )
            if lst:
                all_majors.extend(lst)
                distinct_zydms.update(m.get("zydm", "") for m in lst if m.get("zydm"))

        # 5. 枚举 J/Z 自设交叉学科
        for prefix in ["J", "Z"]:
            for i in range(0, 100):
                zydm = f"{prefix}{yjxkdm}{i:02d}"
                lst, _, _ = await call_zys_do(
                    client, zydm, yjxkdm, xwlx, mldm
                )
                if lst:
                    all_majors.extend(lst)
                    distinct_zydms.update(m.get("zydm", "") for m in lst if m.get("zydm"))

        # 去重
        seen: set[tuple[str, str]] = set()
        unique: list[dict] = []
        for m in all_majors:
            key = (m.get("zydm", ""), m.get("zymc", ""))
            if key in seen:
                continue
            seen.add(key)
            unique.append(m)

        return len(unique), len(distinct_zydms), None


async def main() -> None:
    print("=== E2-A2: httpx 完整枚举 0101 哲学 ===")
    t0 = time.time()
    n_majors, n_zydms, err = await search_yjxkdm_full("0101", "xs", "01")
    t1 = time.time()
    print(f"  0101 哲学: majors={n_majors} distinct_zydms={n_zydms} err={err} 耗时={t1-t0:.2f}s")
    print(f"  对比 Playwright CONCURRENCY=2+retry: 11 majors, 10 distinct zydms")

    print("\n=== E2-A3: httpx 完整枚举 0202 应用经济学 ===")
    t0 = time.time()
    n_majors, n_zydms, err = await search_yjxkdm_full("0202", "xs", "02")
    t1 = time.time()
    print(f"  0202 应用经济学: majors={n_majors} distinct_zydms={n_zydms} err={err} 耗时={t1-t0:.2f}s")
    print(f"  对比 Playwright CONCURRENCY=2+retry: 71 majors, 21 distinct zydms")


if __name__ == "__main__":
    asyncio.run(main())
