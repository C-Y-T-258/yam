"""研招网 API 爬虫.

封装对中国研究生招生信息网公开接口的调用，
包括院校列表、院系所、招生人数、考试科目等。
"""

import json
from pathlib import Path
from typing import Any

import requests

from yam.config import config
from yam.crawler.base import BaseCrawler
from yam.crawler.dynamic import LoginRequiredError
from yam.utils import now_str, sleep


class YanZhaoCrawler(BaseCrawler):
    """研招网爬虫.

    数据流：
    1. 从种子文件或 API 获取开设目标专业的院校列表；
    2. 对每所学校访问 zydetail.do 建立 session；
    3. POST yjfxs.do 获取院系所、招生人数、考试科目；
    4. 解析为 YAM 标准数据结构。
    """

    BASE_URL = "https://yz.chsi.com.cn"

    @property
    def source(self) -> str:
        return "yanzhao"

    def __init__(self, major_code: str, major_name: str):
        super().__init__(major_code, major_name)
        self.session = requests.Session()
        self.timeout = config.get("request_timeout", 30)
        self.delay = config.get("delay_between_requests", 0.5)
        self.seed_file = (
            config.project_dir / "data" / "seeds" / f"yan_zhao_{major_code}_all_regions.json"
        )

    def _headers(self) -> dict[str, str]:
        return {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
            "Referer": f"{self.BASE_URL}/zsml/queryAction.do",
        }

    def _ensure_session(self) -> None:
        """访问任意研招网页面获取必要 cookie."""
        url = (
            f"{self.BASE_URL}/zsml/zydetail.do?"
            f"zydm={self.major_code}&zymc=%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD"
            f"&xwlx=zyxw&mldm=08&mlmc=%E5%B7%A5%E5%AD%A6"
            f"&yjxkdm={self.major_code[:4]}&yjxkmc=%E7%94%B5%E5%AD%90%E4%BF%A1%E6%81%AF"
            f"&xxfs=1"
        )
        self.session.get(url, headers=self._headers(), timeout=self.timeout)

    def fetch_schools(self) -> list[dict[str, Any]]:
        """获取开设目标专业的院校列表.

        优先读取本地种子文件。种子文件来自研招网公开查询结果。
        若种子文件不存在，尝试使用动态爬虫自动抓取并保存。
        """
        if not self.seed_file.exists():
            try:
                from yam.crawler.dynamic import DynamicYanZhaoCrawler

                dynamic = DynamicYanZhaoCrawler(self.major_code, self.major_name)
                import asyncio

                count = asyncio.run(dynamic.fetch_and_save())
                print(f"已自动抓取 {self.major_code} 种子数据：{count} 所院校")
            except LoginRequiredError:
                print(
                    f"抓取 {self.major_code} 种子数据需要登录研招网，"
                    f"请先运行：yam fetch-seeds -m {self.major_code} --login"
                )
                raise
            except Exception as e:
                print(f"自动抓取 {self.major_code} 种子数据失败：{e}")
                raise RuntimeError(
                    f"无法获取 {self.major_code} 的院校种子数据：{e}"
                ) from e

        if not self.seed_file.exists():
            raise RuntimeError(
                f"无法获取 {self.major_code} 的院校种子数据，"
                f"请尝试运行：yam fetch-seeds -m {self.major_code} --login"
            )

        with open(self.seed_file, "r", encoding="utf-8") as f:
            raw = json.load(f)

        schools = []
        for item in raw:
            schools.append(
                {
                    "school_id": item.get("schId", ""),
                    "school_code": item.get("dwdm", ""),
                    "name": item.get("dwmc", ""),
                    "province": item.get("szss", ""),
                    "province_code": item.get("szssm", ""),
                    "level": self._infer_level(item),
                    "self_scoring": item.get("zhx") == "1",
                    "doctoral_program": item.get("bs") == "1",
                    "double_first_class": item.get("syl") == "1",
                    "is_985": item.get("b985") == "1",
                    "sign": item.get("sign", ""),
                    "sign2": item.get("sign2", ""),
                }
            )
        return schools

    def _infer_level(self, item: dict[str, Any]) -> str:
        """根据研招网返回的标识推断学校层次.

        科研院所（研究院/研究所/科学院）独立标记，不归入普通本科；
        研招网 b985 字段不可靠（全为 0），且无 b211 字段；
        syl 标识双一流。985/211 的准确判断由 sync_to_tauri.py 调用
        掌上考研 API 覆写，这里只做初步推断。
        """
        name = item.get("dwmc", "")
        is_research = any(p in name for p in ("研究院", "研究所", "科学院", "研究生院"))
        if is_research:
            return "科研院所"
        if item.get("syl") == "1":
            return "双一流"
        return "普通本科"

    def fetch_departments(self, school: dict[str, Any]) -> list[dict[str, Any]]:
        """获取某院校的院系所/招生信息."""
        self._ensure_session()
        sleep(self.delay)

        url = f"{self.BASE_URL}/zsml/rs/yjfxs.do"
        data = {
            "zydm": self.major_code,
            "zymc": "",
            "dwdm": school.get("school_code", ""),
            "xxfs": "",
            "dwlxs": "",
            "tydxs": "",
            "jsggjh": "",
            "start": "0",
            "pageSize": "100",
            "totalCount": "0",
        }

        response = self.session.post(
            url, data=data, headers=self._headers(), timeout=self.timeout
        )
        response.raise_for_status()
        result = response.json()

        if not result.get("flag"):
            return []

        items = result.get("msg", {}).get("list", [])
        departments = []
        for item in items:
            departments.append(self._parse_department_item(item))
        return departments

    def _parse_department_item(self, item: dict[str, Any]) -> dict[str, Any]:
        """将研招网 yjfxs.do 返回的条目解析为 YAM 标准格式."""
        special_plans: list[str] = []
        if item.get("tydxs") == "1":
            special_plans.append("退役大学生士兵")
        if item.get("jsggjh") == "1":
            special_plans.append("少数民族高层次骨干计划")

        return {
            "department_id": item.get("yxsdm", ""),
            "name": item.get("yxsmc", ""),
            "enrollment_count": self._parse_enrollment_num(
                item.get("nzsrs", 0), item.get("nzsrsstr", "")
            ),
            "enrollment_text": item.get("nzsrsstr", ""),
            "research_direction": item.get("yjfxmc", ""),
            "exam_subjects": self._parse_exam_subjects(item.get("kskmz", [])),
            "exam_type": item.get("ksfsmc", ""),
            "study_mode": self._parse_study_mode(item.get("xxfs", "")),
            "special_plans": special_plans,
            "advisor": item.get("zdjs", ""),
            "source": self.source,
            "fetched_at": now_str(),
        }

    def _parse_study_mode(self, value: Any) -> str:
        """解析学习方式编码为可读文本."""
        if value == "1" or str(value).strip() == "1":
            return "全日制"
        if value == "2" or str(value).strip() == "2":
            return "非全日制"
        if isinstance(value, str) and value.strip():
            return value.strip()
        return ""

    def _parse_enrollment_num(self, value: Any, text: str = "") -> int | None:
        """解析招生人数.

        研招网 `nzsrs` 字段经常为 0，真实人数在 `nzsrsstr` 文本字段中，
        如 "专业：6(不含推免)"，需要从中提取数字。
        """
        import re

        # 优先从文本字段解析
        if text:
            match = re.search(r"(\d+)", text)
            if match:
                return int(match.group(1))

        # 兜底：直接解析数字字段
        try:
            num = int(value)
            return num if num >= 0 else None
        except (ValueError, TypeError):
            return None

    def _parse_exam_subjects(self, kskmz: list[dict[str, Any]]) -> list[str]:
        """解析考试科目数组为字符串列表."""
        subjects = []
        if not kskmz:
            return subjects

        # kskmz 可能是一个包含对象的列表
        for km in kskmz:
            if not isinstance(km, dict):
                continue
            for key in ["km1Vo", "km2Vo", "km3Vo", "km4Vo"]:
                subj = km.get(key)
                if isinstance(subj, dict):
                    name = subj.get("kskmmc", "")
                    if name:
                        subjects.append(name)
        return subjects

    def fetch_score_lines(
        self, school: dict[str, Any], years: list[int]
    ) -> list[dict[str, Any]]:
        """研招网不直接提供分数线，返回空."""
        return []
