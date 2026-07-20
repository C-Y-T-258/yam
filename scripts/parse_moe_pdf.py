"""解析教育部自设二级学科 PDF，提取所有专业代码和名称.

PDF 结构（预期）：
- 按一级学科分组
- 每行：学校名称 | 二级学科代码 | 二级学科名称
- 我们只需要提取所有不同的 (zydm, zymc) 组合

输出：data/moe_self_set_majors.json
格式：{ "0812": [{"code": "0812Z1", "name": "信息安全"}, ...], ... }
"""

import json
import re
from pathlib import Path

import pdfplumber


def extract_majors_from_pdf(pdf_path: Path) -> dict[str, list[dict]]:
    """从 PDF 提取所有自设二级学科，按一级学科分组."""
    results: dict[str, list[dict]] = {}
    # 匹配 6 位代码：4 位一级学科 + Z/J + 数字字母（如 0812Z1, 0812J1, 0812Z10）
    code_pattern = re.compile(r'\b(\d{4})([ZJ])(\w{1,3})\b')

    current_yjxkdm = ""
    current_yjxkmc = ""

    with pdfplumber.open(pdf_path) as pdf:
        print(f"PDF 共 {len(pdf.pages)} 页")
        for page_idx, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            lines = text.split("\n")

            for line in lines:
                # 尝试识别"一级学科"标题行（如"0812 计算机科学与技术"）
                # 这种行通常在表格的分组标题
                mld_match = re.match(r'^(\d{4})\s+(\S.+?)$', line.strip())
                if mld_match and len(mld_match.group(1)) == 4:
                    code = mld_match.group(1)
                    name = mld_match.group(2).strip()
                    # 只更新一级学科，不添加（这是一级学科标题行）
                    if code[:2] in ("01", "02", "03", "04", "05", "06", "07",
                                     "08", "09", "10", "11", "12", "13", "14"):
                        current_yjxkdm = code
                        current_yjxkmc = name
                        continue

                # 提取所有 Z/J 代码
                for match in code_pattern.finditer(line):
                    yjxkdm = match.group(1)
                    suffix_type = match.group(2)  # Z 或 J
                    suffix = match.group(3)
                    full_code = f"{yjxkdm}{suffix_type}{suffix}"
                    # 尝试从行中提取专业名称（代码后面的中文）
                    # 代码后面的内容
                    after_code = line[match.end():].strip()
                    # 名称可能在代码后面或前面
                    name = ""
                    # 简单策略：取代码后面的中文部分
                    name_match = re.search(r'([\u4e00-\u9fa5][\u4e00-\u9fa5（）\(\)\w\s]+)', after_code)
                    if name_match:
                        name = name_match.group(1).strip()

                    if not name:
                        # 尝试从代码前面找名称
                        before_code = line[:match.start()].strip()
                        name_match = re.search(r'([\u4e00-\u9fa5][\u4e00-\u9fa5（）\(\)\w\s]+)', before_code)
                        if name_match:
                            name = name_match.group(1).strip()

                    if yjxkdm not in results:
                        results[yjxkdm] = []
                    # 去重
                    existing = {m["code"] for m in results[yjxkdm]}
                    if full_code not in existing:
                        results[yjxkdm].append({
                            "code": full_code,
                            "name": name or "(未识别)",
                            "yjxkdm": yjxkdm,
                        })

            if page_idx % 20 == 0:
                print(f"  已处理 {page_idx + 1}/{len(pdf.pages)} 页, 当前 {len(results)} 个学科")

    return results


def main():
    pdf_path = Path("data/moe_pdfs/self_set_second_level.pdf")
    print(f"=== 解析 {pdf_path} ===")
    results = extract_majors_from_pdf(pdf_path)

    # 统计
    total = sum(len(v) for v in results.values())
    print(f"\n=== 解析完成 ===")
    print(f"共 {len(results)} 个一级学科, {total} 个自设二级学科")
    print(f"\n各学科专业数（前 30 个）:")
    for code in sorted(results.keys())[:30]:
        majors = results[code]
        print(f"  {code}: {len(majors)} 个")

    # 重点看 0812
    if "0812" in results:
        print(f"\n=== 0812 计算机科学与技术（{len(results['0812'])} 个）===")
        for m in results["0812"]:
            print(f"  {m['code']} {m['name']}")

    # 输出
    out = Path("data/moe_self_set_majors.json")
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n结果已保存到 {out}")


if __name__ == "__main__":
    main()
