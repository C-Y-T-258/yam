"""掌上考研 API 爬虫.

封装对掌上考研公开 PC 端接口的调用，用于获取院校历年复试分数线。
接口地址: https://api.kaoyan.cn/pc
"""

import json
from pathlib import Path
from typing import Any, Callable

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

    def fetch_school_rank_map(self, major_code: str) -> dict[str, int]:
        """按专业抓取掌上考研院校排序，返回 {学校名: 排名}.

        掌上考研 PC 端没有稳定的"按专业列学校"公开 API，此处尝试调用
        候选接口；任何异常都返回空 dict，调用方应据此降级到 school_code 升序。
        """
        try:
            sleep(self.delay)
            data = self._post(
                "/school/schoolListBySpecial",
                {"special_code": major_code, "page": 1, "limit": 500},
            )
            items = data.get("data", []) if isinstance(data, dict) else []
            rank_map: dict[str, int] = {}
            for idx, item in enumerate(items):
                name = item.get("school_name", "") or item.get("name", "")
                if name:
                    rank_map[self._normalize_name(name)] = idx
            return rank_map
        except Exception:
            return {}

    def fetch_school_tags_map(self, school_names: list[str]) -> dict[str, dict[str, Any]]:
        """按学校名批量查询掌上考研标签，返回 {归一化学校名: 标签字典}.

        研招网 API 的 b985 字段对所有学校都返回 0（不可靠），且无 b211 字段。
        掌上考研 /school/schoolList 接口（按名字查）返回完整的
        is_985/is_211/is_zihuaxian/syl 字段，以此作为 985/211 标识的权威数据源。

        为减少 API 调用，结果会缓存到 ~/.yam/cache/zhangshangkaoyan_tags.json，
        后续查询直接从缓存读取。只对缓存未命中的学校发起网络请求。

        返回的标签字典包含：
        - is_985: 1=是 985，0=否
        - is_211: 1=是 211，0=否
        - is_zihuaxian: 1=自划线，0=否
        - syl: 1=双一流，0=否
        """
        tags_cache_file = self.cache_dir / "zhangshangkaoyan_tags.json"
        cache: dict[str, dict[str, Any]] = {}
        if tags_cache_file.exists():
            try:
                with open(tags_cache_file, "r", encoding="utf-8") as f:
                    cache = json.load(f)
            except Exception:
                cache = {}

        result: dict[str, dict[str, Any]] = {}
        missing: list[str] = []

        for name in school_names:
            normalized = self._normalize_name(name)
            if normalized in cache:
                result[normalized] = cache[normalized]
            else:
                missing.append(name)

        if not missing:
            return result

        # 对缓存未命中的学校逐个查询 /school/schoolList 接口
        for name in missing:
            normalized = self._normalize_name(name)
            if normalized in cache:
                result[normalized] = cache[normalized]
                continue
            try:
                sleep(self.delay)
                data = self._post(
                    "/school/schoolList",
                    {"school_name": name, "page": 1, "limit": 10},
                )
                items = data.get("data", []) if isinstance(data, dict) else []
                tags = None
                if items:
                    # 优先精确匹配
                    for item in items:
                        item_name = item.get("school_name", "")
                        if item_name == name or self._normalize_name(item_name) == normalized:
                            tags = item
                            break
                    if tags is None and len(items) == 1:
                        tags = items[0]
                    if tags is None:
                        # 模糊匹配
                        for item in items:
                            item_name = item.get("school_name", "")
                            if normalized in self._normalize_name(item_name):
                                tags = item
                                break
                if tags is not None:
                    tag_data = {
                        "is_985": 1 if tags.get("is_985") == 1 else 0,
                        "is_211": 1 if tags.get("is_211") == 1 else 0,
                        "is_zihuaxian": 1 if tags.get("is_zihuaxian") == 1 else 0,
                        "syl": 1 if tags.get("syl") == 1 else 0,
                    }
                else:
                    # 查询不到则标记为空标签，避免重复查询
                    tag_data = {
                        "is_985": 0,
                        "is_211": 0,
                        "is_zihuaxian": 0,
                        "syl": 0,
                    }
                cache[normalized] = tag_data
                result[normalized] = tag_data
            except Exception:
                # 网络错误不缓存，下次重试
                continue

        # 保存缓存
        try:
            with open(tags_cache_file, "w", encoding="utf-8") as f:
                json.dump(cache, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

        return result

    def fetch_departments(self, school: dict[str, Any]) -> list[dict[str, Any]]:
        """掌上考研不用于获取院系所信息."""
        return []

    def fetch_score_lines(
        self, school: dict[str, Any], years: list[int]
    ) -> list[dict[str, Any]]:
        """获取某院校目标专业的历年分数线（同步版本，单校）.

        保留作为兼容性接口；批量场景应使用 `fetch_score_lines_batch`（ISSUE-029）
        走 httpx 并发，多校 × 多年从串行 N×M 降到并发 15。
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

            # 分级匹配：6位精确 > 4位一级学科 > 2位门类（与 batch 版一致）
            matched_by_level: dict[int, list[dict[str, Any]]] = {6: [], 4: [], 2: []}
            for item in items:
                code = str(item.get("code", "")).strip()
                if code == self.major_code:
                    matched_by_level[6].append(item)
                elif len(code) == 4 and self.major_code.startswith(code):
                    matched_by_level[4].append(item)
                elif len(code) == 2 and self.major_code.startswith(code):
                    matched_by_level[2].append(item)

            for level in (6, 4, 2):
                if not matched_by_level[level]:
                    continue
                for item in matched_by_level[level]:
                    raw_note = item.get("note", "")
                    if level == 4:
                        note = f"一级学科参考线（code={item.get('code', '')}）" + (f" | {raw_note}" if raw_note else "")
                    elif level == 2:
                        note = f"门类级参考线（code={item.get('code', '')}）" + (f" | {raw_note}" if raw_note else "")
                    else:
                        note = raw_note
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
                            "note": note,
                            "source": self.source,
                            "fetched_at": now_str(),
                        }
                    )
                break  # 只取最高优先级的匹配

        return results

    async def fetch_score_lines_batch(
        self,
        schools: list[dict[str, Any]],
        years: list[int],
        *,
        concurrency: int = 15,
        on_progress: "Callable[[int, int, str], None] | None" = None,
    ) -> dict[str, list[dict[str, Any]]]:
        """并发获取多所院校的历年分数线（ISSUE-029 httpx 并发版）.

        两阶段策略：
        1. 串行预解析 school_id（带本地缓存，通常很快；并发会有缓存写入竞争）
        2. httpx 并发拉取 schoolScore（每校 × 每年一个任务，15 并发）

        掌上考研 API 限流策略与研招网不同（返回 code/message 而非 msg 字符串），
        因此 `rate_limit_keywords=()` 禁用 msg 限流判定，仅对 HTTP/网络异常重试。

        Args:
            schools: 院校列表（YAM 标准格式，含 school_id / name）
            years: 要抓取的年份列表
            concurrency: 并发数，默认 15
            on_progress: 进度回调 (current, total, school_name)

        Returns:
            {school_id: [score_line, ...]}，仅包含 school_id 解析成功的校；
            未在结果中的 school_id 视为失败（school_id 未找到/HTTP 错误），
            调用方用 `school_id in map` 区分成功与失败。
            成功但无分数线数据的专业会返回空列表（合法情况）。
        """
        import asyncio
        import httpx

        from yam.crawler.httpx_client import call_api_with_retry

        if not schools or not years:
            return {}

        # 第 1 步：串行预解析 school_id（带本地缓存，命中后纯本地操作）
        school_id_map: dict[str, int | None] = {}  # school_name -> school_id
        for school in schools:
            name = school.get("name", "")
            if name and name not in school_id_map:
                try:
                    school_id_map[name] = self._search_school_id(name)
                except Exception:
                    school_id_map[name] = None

        # 第 2 步：并发拉取 schoolScore
        url = f"{self.API_BASE}/school/schoolScore"
        headers = self._headers()
        sem = asyncio.Semaphore(concurrency)
        results: dict[str, list[dict[str, Any]]] = {}
        completed = 0
        total = len(schools)
        lock = asyncio.Lock()

        async with httpx.AsyncClient(
            follow_redirects=True,
            headers={"User-Agent": headers["User-Agent"], "Referer": headers["Referer"]},
        ) as client:
            async def _fetch_one(school: dict[str, Any]) -> None:
                nonlocal completed
                async with sem:
                    name = school.get("name", "")
                    school_id = school_id_map.get(name)
                    school_key = school.get("school_id", "")

                    # school_id 未找到：失败，不写入 results
                    if school_id is not None:
                        all_scores: list[dict[str, Any]] = []
                        for year in years:
                            data = {
                                "school_id": str(school_id),
                                "year": str(year),
                                "page": "1",
                                "limit": "100",
                            }
                            # 掌上考研不用 msg 限流判定，仅 HTTP/网络异常重试
                            result, err = await call_api_with_retry(
                                client, url, data, headers, timeout=self.timeout,
                                rate_limit_keywords=(),
                            )
                            if err or not result or result.get("code") != "0000":
                                continue
                            body_data = result.get("data")
                            items = (
                                body_data if isinstance(body_data, list)
                                else (body_data or {}).get("data", [])
                                if isinstance(body_data, dict) else []
                            )
                            # 分级匹配：6位精确 > 4位一级学科 > 2位门类
                            # 掌上考研对不同学校返回的 code 粒度不同：
                            #   - 6位（081200）：专业级分数线（最精确）
                            #   - 4位（0812）：一级学科级分数线
                            #   - 2位（08）：门类级分数线（985自划线院校常见）
                            # 每年只取最高优先级的匹配，避免混合不同粒度的数据
                            matched_by_level: dict[int, list[dict[str, Any]]] = {6: [], 4: [], 2: []}
                            for item in items:
                                code = str(item.get("code", "")).strip()
                                if code == self.major_code:
                                    matched_by_level[6].append(item)
                                elif len(code) == 4 and self.major_code.startswith(code):
                                    matched_by_level[4].append(item)
                                elif len(code) == 2 and self.major_code.startswith(code):
                                    matched_by_level[2].append(item)

                            for level in (6, 4, 2):
                                if not matched_by_level[level]:
                                    continue
                                for item in matched_by_level[level]:
                                    raw_note = item.get("note", "")
                                    if level == 4:
                                        note = f"一级学科参考线（code={item.get('code', '')}）" + (f" | {raw_note}" if raw_note else "")
                                    elif level == 2:
                                        note = f"门类级参考线（code={item.get('code', '')}）" + (f" | {raw_note}" if raw_note else "")
                                    else:
                                        note = raw_note
                                    all_scores.append({
                                        "department_id": str(item.get("depart_id", "")),
                                        "department_name": item.get("depart_name", ""),
                                        "year": year,
                                        "total": self._parse_int(item.get("total")),
                                        "politics": self._parse_int(item.get("politics")),
                                        "english": self._parse_int(item.get("english")),
                                        "special_one": self._parse_int(item.get("special_one")),
                                        "special_two": self._parse_int(item.get("special_two")),
                                        "note": note,
                                        "source": self.source,
                                        "fetched_at": now_str(),
                                    })
                                break  # 只取最高优先级的匹配
                        # 成功（含空列表：school_id 找到但该专业无分数线数据）
                        results[school_key] = all_scores

                    async with lock:
                        completed += 1
                        if on_progress is not None:
                            on_progress(completed, total, name)

            await asyncio.gather(*[_fetch_one(s) for s in schools])

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
