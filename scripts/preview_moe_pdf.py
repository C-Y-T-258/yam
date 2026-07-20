"""快速预览 MOE PDF 的前 3 页内容."""

from pathlib import Path
import pdfplumber

pdf_path = Path("data/moe_pdfs/self_set_second_level.pdf")
with pdfplumber.open(pdf_path) as pdf:
    print(f"PDF 共 {len(pdf.pages)} 页")
    for i in [0, 1, 2, 50, 100]:
        if i < len(pdf.pages):
            page = pdf.pages[i]
            text = page.extract_text() or ""
            print(f"\n=== 第 {i+1} 页 ===")
            print(text[:2000])
            print("---")
            # 也看看表格
            tables = page.extract_tables()
            if tables:
                print(f"表格数: {len(tables)}")
                for t_idx, table in enumerate(tables[:1]):
                    print(f"表 1 行数: {len(table)}")
                    for row in table[:5]:
                        print(f"  {row}")
