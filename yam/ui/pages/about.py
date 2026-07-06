"""数据来源说明."""

from nicegui import ui

from yam.ui.theme import PRIMARY


def build_about_page(major_code: str) -> None:
    """构建数据说明页."""
    ui.label("数据来源说明").classes("text-h4").style(f"color: {PRIMARY};")
    ui.markdown("""
## 数据来源

- **研招网（yz.chsi.com.cn）**：院校、院系、招生人数、考试科目等。
- **掌上考研**：历年招生计划、复试分数线等。

## 数据异常说明

由于两个来源的统计口径不同，可能会出现招生人数、年份覆盖不一致的情况。
所有异常数据均已用 ⚠️ 标记，请用户到院校官网核实最终信息。
    """).classes("text-body1")
