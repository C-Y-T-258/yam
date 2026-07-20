"""登录后抓取所有 totalCount > 10 的学科的第 2-N 页.

前置条件：用户已在 Playwright 浏览器里登录研招网。
- 如果 cookies 已存在（~/.yam/cookies/yz.chsi.com.cn.json），脚本会自动加载并复用
- 如果未登录，脚本会弹出浏览器等待用户登录

策略：
1. 先用第 1 页的 totalCount 识别需要翻页的学科
2. 对每个 totalCount > 10 的学科，翻页抓取所有页
3. 输出到 data/yjxkdm_all_majors_logged_in.json
"""

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from yam.crawler.dynamic import DynamicReader, BASE_URL


# 需要登录补全的学科（从未登录抓取结果分析得到）
DISCIPLINES_NEED_LOGIN = [
    "1002", "0301", "1001", "0202", "1005", "0401", "0501", "1204", "1202",
    "0502", "0802", "1007", "0805", "1004", "1201", "0302", "0812", "0403",
    "0817", "0703", "0811", "0814", "0503", "0823", "0201", "0705", "0907",
    "0830", "0901", "0832", "0828", "0305", "0702", "0714", "0807", "0815",
    "0903", "0602", "0810", "0829", "1006", "1008", "0818", "0902", "0701",
    "0303", "0808", "0904", "0905", "0819", "0707", "0709", "0824", "0101",
    "0820", "0809", "0825", "0837", "0801", "1203",
]


async def check_login(reader: DynamicReader) -> bool:
    """检查是否已登录研招网."""
    page = await reader.context.new_page()
    try:
        await page.goto(f"{BASE_URL}/zsml/", wait_until="load", timeout=60000)
        await page.wait_for_timeout(2000)
        cookies = await reader.context.cookies()
        has_castgc = any(c.get("name") == "CASTGC" for c in cookies)
        return has_castgc
    finally:
        await page.close()


async def fetch_full_discipline(
    reader: DynamicReader, yjxkdm: str, mldm: str
) -> list[dict]:
    """分页抓取某个一级学科的所有专业（需登录）."""
    page = await reader.context.new_page()
    try:
        await page.goto(f"{BASE_URL}/zsml/", wait_until="load", timeout=60000)
        await page.wait_for_timeout(1500)

        all_majors: list[dict] = []
        total = 0
        for cur_page in range(1, 30):
            result = await page.evaluate(
                """
                async (params) => {
                    const formData = new URLSearchParams();
                    formData.append('zydm', '');
                    formData.append('zymc', '');
                    formData.append('xwlx', 'xs');
                    formData.append('mldm', params.mldm);
                    formData.append('yjxkdm', params.yjxkdm);
                    formData.append('xxfs', '');
                    formData.append('tydxs', '');
                    formData.append('jsggjh', '');
                    formData.append('start', String((params.page - 1) * 10));
                    formData.append('curPage', String(params.page));
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
                {"yjxkdm": yjxkdm, "mldm": mldm, "page": cur_page},
            )
            msg = result.get("msg", {})
            if isinstance(msg, str):
                print(f"  [ERROR] yjxkdm={yjxkdm} page={cur_page}: {msg}")
                if "登录" in msg:
                    print("  ⚠️  需要登录，请先在浏览器登录研招网")
                    return []
                break
            majors = msg.get("list", [])
            total = int(msg.get("totalCount", 0))
            all_majors.extend(majors)
            if cur_page == 1:
                print(f"  yjxkdm={yjxkdm}: totalCount={total}")
            if len(majors) < 10 or len(all_majors) >= total:
                break
            await page.wait_for_timeout(800)  # 翻页间隔 0.8s 避免限流
        return all_majors
    finally:
        await page.close()


async def main():
    reader = DynamicReader()
    await reader.init(headless=False)
    try:
        # 1. 检查登录状态
        print("=== 检查登录状态 ===")
        logged_in = await check_login(reader)
        if not logged_in:
            print("⚠️  未检测到登录凭证（CASTGC）")
            print("请在弹出的浏览器窗口中登录研招网：")
            print("  1. 访问 https://yz.chsi.com.cn/")
            print("  2. 点击右上角登录")
            print("  3. 完成登录后回到终端按 Enter 继续...")
            input()
            logged_in = await check_login(reader)
            if not logged_in:
                print("❌ 仍未登录，退出。请先运行桌面端触发登录流程。")
                return
        print("✅ 已登录研招网")

        # 2. 抓取所有需要补全的学科
        all_results: dict[str, list[dict]] = {}
        for code in DISCIPLINES_NEED_LOGIN:
            mldm = code[:2]
            print(f"\n=== 抓取 {code} (mldm={mldm}) ===")
            try:
                majors = await fetch_full_discipline(reader, code, mldm)
                seen = set()
                unique = []
                for m in majors:
                    zydm = m.get("zydm", "")
                    if zydm and zydm not in seen:
                        seen.add(zydm)
                        unique.append({
                            "code": zydm,
                            "name": m.get("zymc", ""),
                            "yjxkdm": code,
                        })
                all_results[code] = unique
                print(f"  去重后 {len(unique)} 个专业")
                await asyncio.sleep(1.5)
            except Exception as e:
                print(f"  [ERROR] {code}: {e}")

        out = Path("data/yjxkdm_all_majors_logged_in.json")
        out.write_text(json.dumps(all_results, ensure_ascii=False, indent=2), encoding="utf-8")
        total_count = sum(len(v) for v in all_results.values())
        print(f"\n=== 完成 ===")
        print(f"共抓取 {len(all_results)} 个学科, {total_count} 个专业")
        print(f"结果已保存到 {out}")
    finally:
        await reader.close()


if __name__ == "__main__":
    asyncio.run(main())
