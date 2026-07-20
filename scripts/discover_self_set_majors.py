"""探测研招网自设二级学科（Z/J 类）的有效代码。

遍历所有一级学科 × Z1-Z9 × J1-J9，调用 zys.do 检查哪些代码有招生数据。
对于有效代码，记录研招网返回的专业名称（zymc）。

用法：
    python -m scripts.discover_self_set_majors           # 全量探测
    python -m scripts.discover_self_set_majors --prefix 0812  # 只探测 0812 下
"""
import argparse
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

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


def fetch_major_meta(major_code: str) -> dict | None:
    """调用 zys.do 查询某个专业代码，返回第一条匹配的元数据或 None。"""
    mldm = major_code[:2]
    xwlx = "xs"  # 自设二级学科都是学术学位
    data = urllib.parse.urlencode({
        "zydm": major_code,
        "zymc": "",
        "xwlx": xwlx,
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
    }).encode("utf-8")
    req = urllib.request.Request(ZYS_URL, data=data, headers=HEADERS, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"  [ERROR] {major_code}: {e}")
        return None
    msg = result.get("msg", {}) if isinstance(result, dict) else {}
    if isinstance(msg, str):
        print(f"  [WARN] {major_code}: msg={msg}")
        return None
    if not isinstance(msg, dict):
        return None
    total = msg.get("totalCount", 0)
    lst = msg.get("list", [])
    if total == 0 or not lst:
        return None
    # 返回第一个匹配条目
    for item in lst:
        if item.get("zydm") == major_code:
            return item
    return lst[0]


def load_first_level_codes(ts_path: Path) -> list[str]:
    """从 majors.ts 提取所有 4 位一级学科代码（学术学位）。"""
    content = ts_path.read_text(encoding="utf-8")
    # 匹配 code: '0812', 形式的一级学科代码
    import re
    matches = re.findall(r"code:\s*'(\d{4})',\s*\n\s*name:", content)
    # 只保留学术学位（前 2 位 < 50 或为 14 开头的交叉学科）
    codes = []
    for code in matches:
        prefix = int(code[:2])
        if prefix < 50 or code.startswith("14"):
            codes.append(code)
    return sorted(set(codes))


def probe_prefix(prefix: str, suffixes: list[str]) -> list[dict]:
    """探测某个一级学科下的所有自设二级学科。"""
    results = []
    for suffix in suffixes:
        code = f"{prefix}{suffix}"
        meta = fetch_major_meta(code)
        if meta:
            name = meta.get("zymc", "")
            results.append({"code": code, "name": name, "totalCount": meta.get("totalCount", 0)})
            print(f"  [OK] {code} {name} (totalCount={meta.get('totalCount', 0)})")
        time.sleep(0.3)  # 避免限流
    return results


def main():
    parser = argparse.ArgumentParser(description="探测研招网自设二级学科")
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

    all_results = {}
    for i, prefix in enumerate(all_codes):
        print(f"\n[{i+1}/{len(all_codes)}] 探测 {prefix} ...")
        results = probe_prefix(prefix, all_suffixes)
        if results:
            all_results[prefix] = results

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(all_results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n完成！共发现 {sum(len(v) for v in all_results.values())} 个自设二级学科")
    print(f"结果已保存到 {output_path}")


if __name__ == "__main__":
    main()
