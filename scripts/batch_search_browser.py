"""用 Playwright 浏览器环境批量搜索所有自设学科名称，拿代码.

策略：
- 串行搜索（避免限流），0.8s 间隔
- 支持断点续传（保存中间结果）
- 预计 3072 * 0.8s = 41 分钟

输出：
- data/moe_majors_with_codes.json（所有搜索结果）
- data/moe_majors_by_discipline.json（按一级学科分组）
"""

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from yam.crawler.dynamic import DynamicReader, BASE_URL

INTERVAL_MS = 800
CHECKPOINT_EVERY = 50
INPUT_FILE = "data/moe_self_set_names.json"
OUTPUT_FILE = "data/moe_majors_with_codes.json"
PROGRESS_FILE = "data/moe_search_progress.json"


async def search_one(page, zymc: str) -> dict:
    """在浏览器页面里搜索一个名称."""
    try:
        result = await page.evaluate(
            """
            async (zymc) => {
                const formData = new URLSearchParams();
                formData.append('zydm', '');
                formData.append('zymc', zymc);
                formData.append('xwlx', 'xs');
                formData.append('mldm', '');
                formData.append('yjxkdm', '');
                formData.append('xxfs', '');
                formData.append('tydxs', '');
                formData.append('jsggjh', '');
                formData.append('start', '0');
                formData.append('curPage', '1');
                formData.append('pageSize', '10');
                formData.append('totalPage', '0');
                formData.append('totalCount', '0');

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
            zymc,
        )
        return result
    except Exception as e:
        return {"error": str(e)}


def load_progress() -> tuple[dict, int]:
    """加载已完成的进度."""
    out_path = Path(OUTPUT_FILE)
    if out_path.exists():
        results = json.loads(out_path.read_text(encoding="utf-8"))
        return results, len(results)
    return {}, 0


async def main():
    # 加载名称列表
    data = json.loads(Path(INPUT_FILE).read_text(encoding="utf-8"))
    all_names = data["all_names"]
    print(f"共 {len(all_names)} 个名称需要搜索", flush=True)

    # 加载已完成进度
    results, done_count = load_progress()
    print(f"已完成: {done_count}/{len(all_names)}", flush=True)

    remaining = [n for n in all_names if n not in results]
    print(f"剩余: {len(remaining)}", flush=True)
    if not remaining:
        print("全部完成", flush=True)
        return

    reader = DynamicReader()
    await reader.init(headless=False)
    try:
        page = await reader.context.new_page()
        await page.goto(f"{BASE_URL}/zsml/", wait_until="load", timeout=60000)
        await page.wait_for_timeout(2000)

        success = 0
        errors = 0
        rate_limited = 0
        for i, name in enumerate(remaining):
            # 重试机制
            for attempt in range(3):
                result = await search_one(page, name)
                msg = result.get("msg", {})
                if isinstance(msg, str):
                    if "频繁" in msg or "登录" in msg:
                        if attempt < 2:
                            print(f"  [{done_count + i + 1}] {name}: 限流，等待 5s 重试...", flush=True)
                            rate_limited += 1
                            await page.wait_for_timeout(5000)
                            continue
                    results[name] = {"error": msg, "totalCount": 0, "majors": []}
                    errors += 1
                    break
                else:
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
                    if majors:
                        success += 1
                    break
            else:
                errors += 1

            # 定期保存进度
            if (i + 1) % CHECKPOINT_EVERY == 0:
                Path(OUTPUT_FILE).write_text(
                    json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
                )
                print(f"[{done_count + i + 1}/{len(all_names)}] 成功={success} 错误={errors} 限流={rate_limited}", flush=True)

            await page.wait_for_timeout(INTERVAL_MS)

        await page.close()

        # 最终保存
        Path(OUTPUT_FILE).write_text(
            json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        # 统计
        all_codes = set()
        for info in results.values():
            for m in info.get("majors", []):
                if m.get("code"):
                    all_codes.add(m["code"])

        print(f"\n=== 完成 ===", flush=True)
        print(f"搜索总数: {len(results)}", flush=True)
        print(f"成功（有结果）: {success}", flush=True)
        print(f"错误: {errors}", flush=True)
        print(f"限流: {rate_limited}", flush=True)
        print(f"独立代码数: {len(all_codes)}", flush=True)

        # 按一级学科分组
        by_discipline: dict[str, list[dict]] = {}
        for info in results.values():
            for m in info.get("majors", []):
                code = m.get("code", "")
                yjxkdm = m.get("yjxkdm", "")
                if code and yjxkdm:
                    by_discipline.setdefault(yjxkdm, []).append({
                        "code": code,
                        "name": m.get("name", ""),
                    })

        # 去重
        for yjxkdm in by_discipline:
            seen = set()
            unique = []
            for m in by_discipline[yjxkdm]:
                if m["code"] not in seen:
                    seen.add(m["code"])
                    unique.append(m)
            by_discipline[yjxkdm] = unique

        Path("data/moe_majors_by_discipline.json").write_text(
            json.dumps(by_discipline, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"\n按学科分组（{len(by_discipline)} 个学科）:", flush=True)
        for code in sorted(by_discipline.keys()):
            print(f"  {code}: {len(by_discipline[code])} 个", flush=True)
    finally:
        await reader.close()


if __name__ == "__main__":
    asyncio.run(main())
