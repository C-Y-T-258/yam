"""掌上考研 API 爬虫.

封装对掌上考研公开 PC 端接口的调用，用于获取院校历年复试分数线。
接口地址: https://api.kaoyan.cn/pc
"""

import json
from pathlib import Path
from typing import Any

import requests

from yam.config import config
from yam.crawler.base import BaseCrawler
from yam.utils import now_str, sleep


class ZhangShangKaoYanCrawler(BaseCrawler):
    """掌上考研爬虫."""

    API_BASE = "https://api.kaoyan.cn/pc"

    @property
    def source(self) -> str:
        return "zhangshangkaoyan"

    def __init__(self, major_code: str, major_name: str):
        super().__init__(major_code, major_name)
        self.session = requests.Session()
        self.timeout = config.get("request_timeout", 30)
        self.delay = config.get("delay_between_requests", 0.5)
        self.cache_dir = config.data_dir / "cache"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.school_id_cache_file = self.cache_dir / "zhangshangkaoyan_school_ids.json"
        self._school_id_cache: dict[str, int | None] = self._load_school_id_cache()

    def _headers(self) -> dict[str, str]:
        return {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/137.0.0.0 Safari/537.36"
            ),
            "Referer": "https://www.kaoyan.cn/",
        }

    def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        """发送 POST 请求并返回业务数据."""
        url = f"{self.API_BASE}{path}"
        response = self.session.post(
            url, data=payload, headers=self._headers(), timeout=self.timeout
        )
        response.raise_for_status()
        body = response.json()
        if body.get("code") != "0000":
            msg = body.get("message", "未知错误")
            raise RuntimeError(f"掌上考研接口返回错误: {msg}")
        return body.get("data") or {}

    def _load_school_id_cache(self) -> dict[str, int | None]:
        """加载学校 ID 本地缓存."""
        if self.school_id_cache_file.exists():
            with open(self.school_id_cache_file, "r", encoding="utf-8") as f:
                return json.load(f)
        return {}

    def _save_school_id_cache(self) -> None:
        """保存学校 ID 本地缓存."""
        with open(self.school_id_cache_file, "w", encoding="utf-8") as f:
            json.dump(self._school_id_cache, f, ensure_ascii=False, indent=2)

    # 已知研招网名称与掌上考研名称不一致的映射.
    # 研招网仍使用旧名，掌上考研已更新校名.
    SCHOOL_NAME_ALIASES: dict[str, str] = {
        "湖州师范学院": "湖州师范大学",
        "闽江学院": "闽江大学",
        "皖南医学院": "皖南医科大学",
        "中国航空研究院(613所)": "中国航空研究院",
        "中国电子科技集团有限公司研究生院": "中国电子科技集团",
        "湖南理工学院": "湖南理工大学",
    }

    def _normalize_name(self, name: str) -> str:
        """统一名称中的标点与空格，方便比对."""
        return (
            name.replace("(", "（")
            .replace(")", "）")
            .replace(" ", "")
            .strip()
        )

    def _search_school_id(self, name: str) -> int | None:
        """根据学校名称查询掌上考研 school_id.

        支持：精确匹配、括号全半角归一化、别名映射、模糊匹配。
        """
        if name in self._school_id_cache:
            cached = self._school_id_cache[name]
            return cached if cached is not None else None

        search_names = [name]
        alias = self.SCHOOL_NAME_ALIASES.get(name)
        if alias and alias != name:
            search_names.append(alias)

        for query in search_names:
            result = self._do_search_school_id(query)
            if result is not None:
                self._school_id_cache[name] = result
                self._save_school_id_cache()
                return result

        # 最后尝试用归一化后的名称再搜一次
        normalized = self._normalize_name(name)
        if normalized != name and normalized not in search_names:
            result = self._do_search_school_id(normalized)
            if result is not None:
                self._school_id_cache[name] = result
                self._save_school_id_cache()
                return result

        self._school_id_cache[name] = None
        self._save_school_id_cache()
        return None

    def _do_search_school_id(self, name: str) -> int | None:
        """执行一次学校名称查询."""
        sleep(self.delay)
        data = self._post(
            "/school/schoolList",
            {"school_name": name, "page": 1, "limit": 10},
        )
        items = data.get("data", []) if isinstance(data, dict) else []
        if not items:
            return None

        normalized_query = self._normalize_name(name)

        # 优先精确匹配（含归一化后）
        for item in items:
            item_name = item.get("school_name", "")
            if item_name == name or self._normalize_name(item_name) == normalized_query:
                return int(item["school_id"])

        # 只有一个结果时采用
        if len(items) == 1:
            return int(items[0]["school_id"])

        # 模糊匹配：查询串是结果名称的子串
        for item in items:
            item_name = item.get("school_name", "")
            if normalized_query in self._normalize_name(item_name):
                return int(item["school_id"])

        # 反向子串匹配：结果名称是查询串的子串
        for item in items:
            item_name = self._normalize_name(item.get("school_name", ""))
            if item_name and item_name in normalized_query:
                return int(item["school_id"])

        return None

    def fetch_schools(self) -> list[dict[str, Any]]:
        """掌上考研不用于获取院校列表."""
        return []

    def fetch_departments(self, school: dict[str, Any]) -> list[dict[str, Any]]:
        """掌上考研不用于获取院系所信息."""
        return []

    def fetch_score_lines(
        self, school: dict[str, Any], years: list[int]
    ) -> list[dict[str, Any]]:
        """获取某院校目标专业的历年分数线.

        返回 YAM 标准格式的分数线记录列表。
        """
        name = school.get("name", "")
        school_id = self._search_school_id(name)
        if school_id is None:
            raise RuntimeError(f"未找到掌上考研学校 ID: {name}")

        results: list[dict[str, Any]] = []
        for year in years:
            sleep(self.delay)
            data = self._post(
                "/school/schoolScore",
                {"school_id": school_id, "year": year, "page": 1, "limit": 100},
            )
            items = data if isinstance(data, list) else data.get("data", [])

            for item in items:
                code = str(item.get("code", "")).strip()
                if code != self.major_code:
                    continue

                results.append(
                    {
                        "department_id": str(item.get("depart_id", "")),
                        "department_name": item.get("depart_name", ""),
                        "year": year,
                        "total": self._parse_int(item.get("total")),
                        "politics": self._parse_int(item.get("politics")),
                        "english": self._parse_int(item.get("english")),
                        "special_one": self._parse_int(item.get("special_one")),
                        "special_two": self._parse_int(item.get("special_two")),
                        "note": item.get("note", ""),
                        "source": self.source,
                        "fetched_at": now_str(),
                    }
                )

        return results

    def fetch_admission_plans(
        self, school: dict[str, Any], years: list[int]
    ) -> list[dict[str, Any]]:
        """获取某院校目标专业的历年招生计划.

        返回 YAM 标准格式的招生计划记录列表。
        """
        name = school.get("name", "")
        school_id = self._search_school_id(name)
        if school_id is None:
            raise RuntimeError(f"未找到掌上考研学校 ID: {name}")

        results: list[dict[str, Any]] = []
        for year in years:
            sleep(self.delay)
            data = self._post(
                "/school/planListV2",
                {
                    "school_id": school_id,
                    "year": year,
                    "page": 1,
                    "limit": 100,
                    "keyword": self.major_code,
                },
            )
            items = data.get("data", []) if isinstance(data, dict) else data

            for item in items:
                code = str(item.get("special_code", "")).strip()
                if code != self.major_code:
                    continue

                results.append(
                    {
                        "department_id": str(item.get("depart_id", "")),
                        "department_name": item.get("depart_name", ""),
                        "year": year,
                        "plan_id": str(item.get("plan_id", "")),
                        "spe_id": str(item.get("spe_id", "")),
                        "research_direction": "",
                        "exam_subjects": [],
                        "reference_books": [],
                        "enrollment_count": self._parse_int(item.get("recruit_number")),
                        "note": item.get("remark", ""),
                        "source": self.source,
                        "fetched_at": now_str(),
                    }
                )

        return results

    @staticmethod
    def _parse_int(value: Any) -> int | None:
        """解析整数字段，异常值转为 None."""
        if value is None:
            return None
        try:
            num = int(value)
            return num if num >= 0 else None
        except (ValueError, TypeError):
            return None
