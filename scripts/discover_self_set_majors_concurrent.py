"""探测研招网自设二级学科（Z/J 类）的有效代码 — 并发版本。

用 aiohttp 并发请求 zys.do，遍历所有一级学科 × Z1-Z9 × J1-J9，
检查哪些代码有招生数据。对于有效代码，记录研招网返回的专业名称（zymc）。

用法：
    python -m scripts.discover_self_set_majors_concurrent           # 全量探测
    python -m scripts.discover_self_set_majors_concurrent --prefix 0812  # 只探测 0812 下
"""
import argparse
import asyncio
import json
import re
from pathlib import Path

import aiohttp

BASE_URL = "https://yz.chsi.com.cn"
ZYS_URL = f"{BASE_URL}/zsml/rs/zys.do"

HEADERS = {
    "Content-Type": "application/x-www-form-urlencoded",
    "Referer": f"{BASE_URL}/zsml/",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
}

# 学科间并发数（每个学科内的 18 个请求串行，避免被研招网限流）
DISCIPLINE_CONCURRENCY = 5
# 学科内每个请求间隔（秒）
REQUEST_INTERVAL = 0.3


async def fetch_major_meta(session: aiohttp.ClientSession, major_code: str) -> dict | None:
    """调用 zys.do 查询某个专业代码，返回第一条匹配的元数据或 None。"""
    mldm = major_code[:2]
    data = {
        "zydm": major_code,
        "zymc": "",
        "xwlx": "xs",
        "mldm": mldm,
        "yjxkdm": "",
        "xxfs": "",
        "tydxs": "",
        "jsggjh": "",
        "start": "0",
        "curPage": "1",
        "pageSize": "10",
        "totalPage": "0",
        "totalCount": "0",
    }
    try:
        async with session.post(ZYS_URL, data=data, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=15)) as resp:
            result = await resp.json(content_type=None)
    except Exception:
        return None
    msg = result.get("msg", {}) if isinstance(result, dict) else {}
    if isinstance(msg, str) or not isinstance(msg, dict):
        return None
    lst = msg.get("list", [])
    if not lst:
        return None
    for item in lst:
        if item.get("zydm") == major_code:
            return item
    return lst[0]


def load_first_level_codes(ts_path: Path) -> list[str]:
    """从 majors.ts 提取所有 4 位一级学科代码（学术学位）。"""
    content = ts_path.read_text(encoding="utf-8")
    matches = re.findall(r"code:\s*'(\d{4})',\s*\n\s*name:", content)
    codes = []
    for code in matches:
        prefix = int(code[:2])
        if prefix < 50 or code.startswith("14"):
            codes.append(code)
    return sorted(set(codes))


async def probe_discipline(session: aiohttp.ClientSession, prefix: str, suffixes: list[str]) -> list[dict]:
    """串行探测单个一级学科下的所有自设二级学科（避免限流）。"""
    results = []
    for suffix in suffixes:
        code = f"{prefix}{suffix}"
        meta = await fetch_major_meta(session, code)
        if meta:
            name = meta.get("zymc", "")
            results.append({"code": code, "name": name})
            print(f"  [OK] {code} {name}")
        await asyncio.sleep(REQUEST_INTERVAL)
    return results


async def probe_all(first_level_codes: list[str], suffixes: list[str]) -> dict[str, list[dict]]:
    """按一级学科分组并发探测：学科间并发，学科内串行。"""
    print(f"共 {len(first_level_codes)} 个一级学科 × {len(suffixes)} 个后缀 = {len(first_level_codes) * len(suffixes)} 个代码")
    print(f"学科间并发数 {DISCIPLINE_CONCURRENCY}, 学科内请求间隔 {REQUEST_INTERVAL}s")

    sem = asyncio.Semaphore(DISCIPLINE_CONCURRENCY)
    done = [0]

    async def check_discipline(session: aiohttp.ClientSession, prefix: str) -> tuple[str, list[dict]]:
        async with sem:
            results = await probe_discipline(session, prefix, suffixes)
            done[0] += 1
            if done[0] % 20 == 0:
                print(f"  [{done[0]}/{len(first_level_codes)}] 已完成 {done[0]} 个一级学科...")
            return prefix, results

    async with aiohttp.ClientSession() as session:
        all_results = await asyncio.gather(
            *[check_discipline(session, p) for p in first_level_codes]
        )

    return {prefix: results for prefix, results in all_results if results}


def main():
    parser = argparse.ArgumentParser(description="探测研招网自设二级学科（并发版）")
    parser.add_argument("--prefix", default="", help="只探测指定一级学科（如 0812）")
    parser.add_argument("--output", default="data/self_set_majors.json", help="输出文件路径")
    args = parser.parse_args()

    ts_path = Path("d:/yam/yam-desktop/src/data/majors.ts")
    all_codes = load_first_level_codes(ts_path)
    print(f"共 {len(all_codes)} 个学术学位一级学科")

    if args.prefix:
        all_codes = [c for c in all_codes if c == args.prefix]
        print(f"过滤后: {all_codes}")

    suffixes_z = [f"Z{i}" for i in range(1, 10)]
    suffixes_j = [f"J{i}" for i in range(1, 10)]
    all_suffixes = suffixes_z + suffixes_j

    results = asyncio.run(probe_all(all_codes, all_suffixes))

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")

    total = sum(len(v) for v in results.values())
    print(f"\n完成！共发现 {total} 个自设二级学科，涉及 {len(results)} 个一级学科")
    print(f"结果已保存到 {output_path}")


if __name__ == "__main__":
    main()
