"""把探测到的自设二级学科合并到 majors.ts 和 majors.yaml。

读取 data/self_set_majors.json（由 discover_self_set_majors.py 生成），
把每个自设二级学科添加到：
1. yam-desktop/src/data/majors.ts 中对应一级学科的 majors 数组
2. data/majors.yaml 中对应门类的 majors 列表

对于已存在的代码（如 0821Z5），跳过不重复添加。

用法：
    python -m scripts.merge_self_set_majors [--dry-run]
"""
import argparse
import json
import re
from pathlib import Path

# 门类代码 → 门类名称
CATEGORY_NAMES = {
    "01": "哲学", "02": "经济学", "03": "法学", "04": "教育学",
    "05": "文学", "06": "历史学", "07": "理学", "08": "工学",
    "09": "农学", "10": "医学", "11": "军事学", "12": "管理学",
    "14": "交叉学科",
}


def load_discovery(path: Path) -> dict[str, list[dict]]:
    """加载探测结果。返回 {一级学科代码: [{code, name, totalCount}, ...]}。"""
    if not path.exists():
        raise FileNotFoundError(f"探测结果文件不存在: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def merge_into_ts(ts_path: Path, discovery: dict[str, list[dict]], dry_run: bool = False) -> tuple[int, int]:
    """把自设二级学科合并到 majors.ts。返回 (新增数, 跳过数)。"""
    content = ts_path.read_text(encoding="utf-8")
    added = 0
    skipped = 0

    for first_level_code, majors in discovery.items():
        for major in majors:
            code = major["code"]
            name = major["name"]
            # 检查是否已存在
            if f"'{code}'" in content:
                skipped += 1
                continue
            # 找到对应一级学科的位置，在其 majors 数组末尾添加
            # 匹配模式：code: '0812', ... name: '...', ... majors: [ ... ],
            # 我们需要在对应一级学科的 majors 数组的 ] 前面添加
            pattern = (
                r"(code:\s*'" + re.escape(first_level_code) + r"',\s*\n"
                r"\s*name:\s*'[^']*'(?:[^]]*?)majors:\s*\[)\s*\n"
                r"((?:\s*\{ code:\s*'[^']*',\s*name:\s*'[^']*'\s*\},?\s*\n)*)"
                r"(\s*\],)"
            )
            match = re.search(pattern, content, re.DOTALL)
            if not match:
                print(f"  [WARN] ts: 找不到一级学科 {first_level_code} 的 majors 数组，跳过 {code}")
                skipped += 1
                continue
            # 在最后一个 major 后面添加新条目
            existing_majors = match.group(2)
            # 提取缩进
            indent_match = re.search(r"^(\s+)\{", existing_majors)
            indent = indent_match.group(1) if indent_match else "          "
            new_line = f"{indent}{{ code: '{code}', name: '{name}' }},\n"
            new_majors = existing_majors + new_line
            content = content[:match.start(2)] + new_majors + content[match.end(2):]
            added += 1
            print(f"  [ADD] ts: {code} {name} → {first_level_code}")

    if not dry_run:
        ts_path.write_text(content, encoding="utf-8")
    return added, skipped


def merge_into_yaml(yaml_path: Path, discovery: dict[str, list[dict]], dry_run: bool = False) -> tuple[int, int]:
    """把自设二级学科合并到 majors.yaml。返回 (新增数, 跳过数)。

    yaml 结构：
      categories:
      - code: '01'
        name: 哲学
        majors:
        - code: '010100'
          name: 哲学
          ...

    策略：按门类分组，找到每个门类的 majors 列表末尾，在其后追加新专业。
    """
    content = yaml_path.read_text(encoding="utf-8")
    lines = content.split("\n")
    added = 0
    skipped = 0

    # 按门类代码分组自设二级学科
    by_category: dict[str, list[dict]] = {}
    for first_level_code, majors in discovery.items():
        category_code = first_level_code[:2]
        for major in majors:
            code = major["code"]
            name = major["name"]
            # 检查是否已存在
            if f"code: {code}" in content or f"code: '{code}'" in content:
                skipped += 1
                continue
            by_category.setdefault(category_code, []).append(major)

    for category_code, majors_to_add in by_category.items():
        # 找到该门类的起始行（格式可能是 - code: '08' 或 - code: 08）
        cat_start = -1
        for i, line in enumerate(lines):
            # 匹配 - code: '08' 或 - code: 08（行首）
            if re.match(rf"^- code: '?{re.escape(category_code)}'?$", line.strip()):
                cat_start = i
                break
        if cat_start < 0:
            print(f"  [WARN] yaml: 找不到门类 {category_code}，跳过 {len(majors_to_add)} 个专业")
            skipped += len(majors_to_add)
            continue

        # 找到该门类的 majors 列表末尾（下一个门类之前）
        cat_end = len(lines)
        for i in range(cat_start + 1, len(lines)):
            # 匹配下一个门类行（2 位代码，带或不带引号）
            if re.match(r"^- code: '?\d{2}'?$", lines[i].strip()):
                cat_end = i
                break

        # 在 cat_end 前面插入新专业（找到最后一个专业的行，在其后追加）
        # 先找到 cat_end 前面最后一个非空行
        insert_idx = cat_end
        while insert_idx > cat_start and not lines[insert_idx - 1].strip():
            insert_idx -= 1

        # 插入新专业条目
        new_lines = []
        for major in majors_to_add:
            code = major["code"]
            name = major["name"]
            new_lines.extend([
                f"  - code: {code}",
                f"    name: {name}",
                f"    degree_type: 学术学位",
                f"    study_mode: 全日制",
                f"    enabled: true",
            ])
            added += 1
            print(f"  [ADD] yaml: {code} {name} → 门类 {category_code}")

        # 在 insert_idx 位置插入新行（前面加一个空行分隔）
        lines = lines[:insert_idx] + new_lines + [""] + lines[insert_idx:]

    if not dry_run:
        yaml_path.write_text("\n".join(lines), encoding="utf-8")
    return added, skipped


def main():
    parser = argparse.ArgumentParser(description="合并自设二级学科到 majors.ts 和 majors.yaml")
    parser.add_argument("--dry-run", action="store_true", help="只打印不写入")
    parser.add_argument("--discovery", default="data/self_set_majors.json", help="探测结果文件路径")
    args = parser.parse_args()

    discovery_path = Path(args.discovery)
    discovery = load_discovery(discovery_path)
    total = sum(len(v) for v in discovery.values())
    print(f"加载探测结果: {len(discovery)} 个一级学科, {total} 个自设二级学科\n")

    ts_path = Path("d:/yam/yam-desktop/src/data/majors.ts")
    yaml_path = Path("d:/yam/data/majors.yaml")

    print("=== 合并到 majors.ts ===")
    ts_added, ts_skipped = merge_into_ts(ts_path, discovery, args.dry_run)
    print(f"\nts: 新增 {ts_added}, 跳过 {ts_skipped}\n")

    print("=== 合并到 majors.yaml ===")
    yaml_added, yaml_skipped = merge_into_yaml(yaml_path, discovery, args.dry_run)
    print(f"\nyaml: 新增 {yaml_added}, 跳过 {yaml_skipped}\n")

    print(f"总计: ts 新增 {ts_added}, yaml 新增 {yaml_added}")


if __name__ == "__main__":
    main()
