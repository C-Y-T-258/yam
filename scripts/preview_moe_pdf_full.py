"""查看 MOE PDF 完整表格结构（含所有列）."""

from pathlib import Path
import pdfplumber

pdf_path = Path("data/moe_pdfs/self_set_second_level.pdf")
with pdfplumber.open(pdf_path) as pdf:
    # 看第 1、2、50 页的表格
    for i in [0, 1, 50]:
        if i < len(pdf.pages):
            page = pdf.pages[i]
            tables = page.extract_tables()
            print(f"\n=== 第 {i+1} 页，表格数 {len(tables)} ===")
            for t_idx, table in enumerate(tables):
                print(f"表 {t_idx+1}: {len(table)} 行")
                # 看表头和前 5 行
                for row_idx, row in enumerate(table[:8]):
                    print(f"  row {row_idx}: {row}")
                if len(table) > 8:
                    print(f"  ... 共 {len(table)} 行")
