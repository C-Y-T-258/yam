"""E2-A: 用 httpx 试调 zys.do 验证反爬是否拦住.

流程：
1. 从 ~/.yam/cookies/yz.chsi.com.cn.json 加载登录 cookies
2. 创建独立 httpx.AsyncClient（独立 cookie jar，模拟独立 session）
3. 访问 https://yz.chsi.com.cn/zsml/ 拿 JSESSIONID
4. 访问详情页建立专业 session
5. POST https://yz.chsi.com.cn/zsml/rs/zys.do 拉数据

如果成功，继续 E2-B 测并发。
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
    """从本地 cookie 文件加载登录态 cookies（CASTGC 等）."""
    if not COOKIE_FILE.exists():
        print(f"❌ cookie 文件不存在: {COOKIE_FILE}", file=sys.stderr)
        sys.exit(1)
    raw = json.loads(COOKIE_FILE.read_text(encoding="utf-8"))
    # 只取 chsi.com.cn 域下的，转换为 {name: value}
    return {
        c["name"]: c["value"]
        for c in raw
        if "chsi.com.cn" in c.get("domain", "") and c.get("value")
    }


async def call_zys_do_once(
    client: httpx.AsyncClient,
    zydm: str,
    yjxkdm: str,
    xwlx: str,
    mldm: str,
) -> tuple[list[dict], int, str | None]:
    """单次调用 zys.do，返回 (list, totalCount, error_msg)."""
    detail_url = (
        f"{BASE_URL}/zsml/zydetail.do?"
        f"zydm={zydm}&zymc=&xwlx={xwlx}&mldm={mldm}&mlmc="
        f"&yjxkdm={yjxkdm}&yjxkmc=&xxfs=1"
    )
    # 1. 访问 zsml 首页拿 JSESSIONID
    r = await client.get(f"{BASE_URL}/zsml/", timeout=30.0)
    if r.status_code != 200:
        return [], 0, f"zsml 首页 HTTP {r.status_code}"
    # 2. 访问详情页建立专业 session
    r = await client.get(detail_url, timeout=30.0)
    if r.status_code != 200:
        return [], 0, f"详情页 HTTP {r.status_code}"
    # 3. POST zys.do
    api_url = f"{BASE_URL}/zsml/rs/zys.do"
    data = {
        "zydm": zydm,
        "zymc": "",
        "xwlx": xwlx,
        "mldm": mldm,
        "yjxkdm": yjxkdm,
        "xxfs": "",
        "tydxs": "",
        "jsggjh": "",
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
        "Referer": detail_url,
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


async def test_single() -> None:
    """单次调用测试：跑一个 yjxkdm 看是否成功."""
    login_cookies = load_login_cookies()
    print(f"加载 {len(login_cookies)} 个 cookies, CASTGC={'有' if 'CASTGC' in login_cookies else '❌无'}")

    # 每个 yjxkdm 用独立 client（独立 cookie jar）
    async with httpx.AsyncClient(
        http2=False,
        follow_redirects=True,
        headers={"User-Agent": UA},
        cookies=login_cookies,  # 复用登录 cookies，但每个 client 的 cookie jar 独立
    ) as client:
        t0 = time.time()
        # 试 0101 哲学（应该有 8+ majors）
        yjxkdm = "0101"
        zydm = yjxkdm + "00"
        mldm = yjxkdm[:2]
        xwlx = "xs"
        lst, total, err = await call_zys_do_once(client, zydm, yjxkdm, xwlx, mldm)
        t1 = time.time()
        print(f"[单次] {yjxkdm}: list={len(lst)} totalCount={total} err={err} 耗时={t1-t0:.2f}s")
        if lst:
            print(f"  样例: {lst[0].get('zydm')} {lst[0].get('zymc')}")


async def test_concurrent() -> None:
    """并发测试：3 个 yjxkdm 同时跑."""
    login_cookies = load_login_cookies()
    targets = [
        ("0101", "哲学", "xs"),
        ("0201", "理论经济学", "xs"),
        ("0202", "应用经济学", "xs"),
    ]
    t0 = time.time()

    async def run_one(yjxkdm: str, name: str, xwlx: str) -> tuple[str, int, int, str | None]:
        # 每个 yjxkdm 独立 client
        async with httpx.AsyncClient(
            http2=False,
            follow_redirects=True,
            headers={"User-Agent": UA},
            cookies=login_cookies,
        ) as client:
            zydm = yjxkdm + "00"
            mldm = yjxkdm[:2]
            lst, total, err = await call_zys_do_once(client, zydm, yjxkdm, xwlx, mldm)
            return yjxkdm, len(lst), total, err

    results = await asyncio.gather(*[run_one(y, n, x) for y, n, x in targets])
    t1 = time.time()
    print(f"\n[并发 3] 总耗时={t1-t0:.2f}s")
    for yjxkdm, lst_n, total, err in results:
        print(f"  {yjxkdm}: list={lst_n} totalCount={total} err={err}")


async def main() -> None:
    print("=== E2-A: httpx 单次调用测试 ===")
    await test_single()
    print("\n=== E2-B: httpx 并发 3 调用测试 ===")
    await test_concurrent()


if __name__ == "__main__":
    asyncio.run(main())
