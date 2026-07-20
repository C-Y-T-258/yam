"""按专业名称批量搜索研招网，累积所有自设二级学科代码.

策略：
1. 从 MOE PDF 提取的 3072 个不同名称
2. 用 aiohttp 并发搜索研招网 zys.do（并发 5 + 间隔 0.3s）
3. 累积所有 (code, name, yjxkdm) 组合
4. 输出到 data/moe_majors_with_codes.json

注意：
- zys.do 接口未登录时第 1 页能返回，第 2 页"请登录"
- 但按名称搜索时，如果 totalCount ≤ 10，第 1 页就能拿全
- 对于 totalCount > 10 的名称（如"人工智能"），只拿前 10 个，后续用 mldm 限定补全
"""

import asyncio
import aiohttp
import json
import re
from pathlib import Path

ZYS_URL = "https://yz.chsi.com.cn/zsml/rs/zys.do"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Content-Type": "application/x-www-form-urlencoded",
    "Referer": "https://yz.chsi.com.cn/zsml/",
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "application/json, text/plain, */*",
}

CONCURRENCY = 5
REQUEST_INTERVAL = 0.3


async def search_one(session: aiohttp.ClientSession, zymc: str, mldm: str = "") -> dict:
    """按名称搜索一次."""
    data = {
        "zydm": "",
        "zymc": zymc,
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
        async with session.post(ZYS_URL, data=data, headers=HEADERS,
                                timeout=aiohttp.ClientTimeout(total=15)) as resp:
            result = await resp.json(content_type=None)
            return result
    except Exception as e:
        return {"error": str(e)}


async def search_all(names: list[str]) -> dict:
    """并发搜索所有名称."""
    sem = asyncio.Semaphore(CONCURRENCY)
    results: dict[str, dict] = {}

    async def worker(name: str):
        async with sem:
            result = await search_one(session, name, "")
            msg = result.get("msg", {})
            if isinstance(msg, dict):
                total = msg.get("totalCount", 0)
                majors = msg.get("list", [])
                results[name] = {
                    "totalCount": total,
                    "majors": [
                        {
                            "code": m.get("zydm", ""),
                            "name": m.get("zymc", ""),
                            "yjxkdm": m.get("yjxkdm", ""),
                            "mldm": m.get("mldm", ""),
                        }
                        for m in majors
                    ],
                }
            else:
                results[name] = {"error": str(msg), "totalCount": 0, "majors": []}
            await asyncio.sleep(REQUEST_INTERVAL)

    async with aiohttp.ClientSession() as session:
        # 先访问主页建立 session
        async with session.get("https://yz.chsi.com.cn/zsml/", headers=HEADERS,
                                timeout=aiohttp.ClientTimeout(total=15)) as r:
            print(f"建立 session: {r.status}")

        # 分批处理，每批 100 个
        batch_size = 100
        for i in range(0, len(names), batch_size):
            batch = names[i:i + batch_size]
            print(f"处理 {i+1}-{i+len(batch)}/{len(names)}...")
            await asyncio.gather(*[worker(n) for n in batch])

    return results


async def main():
    # 加载名称
    data = json.loads(Path("data/moe_self_set_names.json").read_text(encoding="utf-8"))
    all_names = data["all_names"]
    print(f"共 {len(all_names)} 个不同名称需要搜索")

    # 搜索
    results = await search_all(all_names)

    # 统计
    all_codes: set[str] = set()
    code_to_info: dict[str, dict] = {}
    need_refine = []  # totalCount > 10 的名称
    for name, info in results.items():
        if info.get("totalCount", 0) > 10:
            need_refine.append((name, info["totalCount"], len(info["majors"])))
        for m in info.get("majors", []):
            code = m["code"]
            if code:
                all_codes.add(code)
                code_to_info[code] = m

    print(f"\n=== 完成 ===")
    print(f"搜索名称数: {len(all_names)}")
    print(f"获取到代码数: {len(all_codes)}")
    print(f"需要 mldm 补全的名称（totalCount > 10）: {len(need_refine)}")
    if need_refine:
        print("前 10 个：")
        for name, total, got in sorted(need_refine, key=lambda x: -x[1])[:10]:
            print(f"  {name}: {got}/{total}")

    # 输出
    out = Path("data/moe_majors_with_codes.json")
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n结果已保存到 {out}")

    # 按一级学科分组
    by_discipline: dict[str, list[dict]] = {}
    for code, info in code_to_info.items():
        yjxkdm = info.get("yjxkdm", "")
        if yjxkdm:
            by_discipline.setdefault(yjxkdm, []).append({
                "code": code,
                "name": info.get("name", ""),
            })

    grouped_out = Path("data/moe_majors_by_discipline.json")
    grouped_out.write_text(json.dumps(by_discipline, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"按学科分组结果已保存到 {grouped_out}")
    print(f"\n各学科专业数（前 20 个）:")
    for code in sorted(by_discipline.keys())[:20]:
        print(f"  {code}: {len(by_discipline[code])} 个")


if __name__ == "__main__":
    asyncio.run(main())
