"""研招网 API 爬虫.

封装对中国研究生招生信息网公开接口的调用，
包括院校列表、院系所、招生人数、考试科目等。
"""

import asyncio
import json
import os
import threading
import time
from pathlib import Path
from typing import Any, Callable

import requests

from yam.config import config
from yam.crawler.base import BaseCrawler
from yam.crawler.dynamic import LoginRequiredError, build_detail_url
from yam.diagnostics import log_event, safe_message
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
        seed_name = f"yan_zhao_{major_code}_all_regions.json"
        self.user_seed_file = config.data_dir / "seeds" / seed_name
        self.bundled_seed_file = config.resource_root / "data" / "seeds" / seed_name
        self.seed_file = self.user_seed_file

    @staticmethod
    def _load_valid_seed(path: Path) -> list[dict[str, Any]] | None:
        """读取有效的非空种子列表；损坏或空文件视为不可用。"""
        if not path.exists():
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                raw = json.load(f)
        except (OSError, UnicodeError, json.JSONDecodeError):
            return None
        if not isinstance(raw, list) or not raw:
            return None
        if not all(
            isinstance(item, dict)
            and str(item.get("schId", "")).strip()
            and str(item.get("dwmc", "")).strip()
            for item in raw
        ):
            return None
        return raw

    def _find_seed(self) -> tuple[Path | None, list[dict[str, Any]] | None]:
        """优先使用用户登录阶段生成的种子，源码种子仅作只读回退。"""
        for source, path in (
            ("user", self.user_seed_file),
            ("bundled", self.bundled_seed_file),
        ):
            raw = self._load_valid_seed(path)
            if raw is not None:
                log_event(
                    "seed_selected",
                    f"major_code={self.major_code} source={source} school_count={len(raw)}",
                )
                return path, raw
        log_event("seed_missing", f"major_code={self.major_code}", "WARN")
        return None, None

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
        url = build_detail_url(self.major_code, self.major_name)
        self.session.get(url, headers=self._headers(), timeout=self.timeout)

    def fetch_schools(self) -> list[dict[str, Any]]:
        """获取开设目标专业的院校列表.

        优先读取本地种子文件。种子文件来自研招网公开查询结果。
        若种子文件不存在，尝试使用动态爬虫自动抓取并保存。
        """
        seed_file, raw = self._find_seed()
        if raw is None:
            try:
                from yam.crawler.dynamic import DynamicYanZhaoCrawler

                dynamic = DynamicYanZhaoCrawler(self.major_code, self.major_name)
                import asyncio

                # ISSUE-017: 种子抓取（29 省扫描）可能耗时 >300s，远超 Rust 端 300s 超时。
                # 后台心跳线程每 30s 发 YAM_PROGRESS 0/0，刷新 commands.rs 的 last_progress_time，
                # 避免种子抓取中途被误判"300 秒无进度更新"而终止。
                # 仅桌面端（YAM_DESKTOP=1）发协议行；独立 CLI `yam fetch-seeds` 不发避免噪声。
                heartbeat_stop = threading.Event()
                if os.environ.get("YAM_DESKTOP"):
                    def _seed_heartbeat() -> None:
                        n = 0
                        while not heartbeat_stop.wait(30):
                            n += 1
                            print(
                                f"YAM_PROGRESS 0/0 正在获取 {self.major_code} "
                                f"{self.major_name} 种子数据（按省份扫描院校列表，心跳 {n}）...",
                                flush=True,
                            )

                    threading.Thread(target=_seed_heartbeat, daemon=True).start()

                try:
                    result = asyncio.run(dynamic.fetch_and_save())
                finally:
                    heartbeat_stop.set()
                print(f"已自动抓取 {self.major_code} 种子数据：{result['school_count']} 所院校")
            except LoginRequiredError:
                raise
            except Exception as e:
                print(f"自动抓取 {self.major_code} 种子数据失败：{e}")
                raise RuntimeError(
                    f"无法获取 {self.major_code} 的院校种子数据：{e}"
                ) from e

            seed_file, raw = self._find_seed()

        if seed_file is None or raw is None:
            raise RuntimeError(
                f"无法获取 {self.major_code} 的院校种子数据"
            )
        self.seed_file = seed_file

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
        """获取某院校的院系所/招生信息（同步版本，单校）.

        保留作为兼容性接口；批量场景应使用 `fetch_departments_batch`（ISSUE-029）
        走 httpx 并发，单专业采集 13-18min → 1-2min。
        """
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

    async def fetch_departments_batch(
        self,
        schools: list[dict[str, Any]],
        *,
        concurrency: int = 15,
        request_delay: float = 0.0,
        on_progress: "Callable[[int, int, str], None] | None" = None,
    ) -> tuple[dict[str, list[dict[str, Any]]], dict[str, str]]:
        """并发获取多所院校的院系所/招生信息（ISSUE-029 httpx 并发版）.

        yjfxs.do 无需登录、可高并发（参考 docs/references/yanzhao-mcp-asset-inventory.md）。
        套用 ISSUE-023 验证可行的策略：httpx.AsyncClient + 15 并发 + 限流指数退避重试
        （2s→4s→8s），单校失败不影响其他校。失败校由调用方做第二轮低并发重试。

        Args:
            schools: 院校列表（YAM 标准格式，含 school_id / school_code）
            concurrency: 并发数，默认 15（实测 30 触发 IP 级限流）
            request_delay: 每次请求前的等待秒数，默认 0（第一轮快速）；
                           第二轮重试建议 0.3s + concurrency=5 防限流
            on_progress: 进度回调 (current, total, school_name)，每完成 1 所触发

        Returns:
            (results, errors) 元组：
            - results: {school_id: [dept, ...]}，仅包含成功校（flag=true）
            - errors: {school_id: error_msg}，包含失败校及真实错误信息
            调用方用 `school_id in results` 区分成功与失败。
        """
        import httpx

        from yam.crawler.httpx_client import call_api_with_retry

        if not schools:
            return {}, {}

        # 先用同步 session 访问一次详情页建立 cookie（JSESSIONID 等）
        # yjfxs.do 虽然无需登录，但服务端仍要求有效 session cookie
        try:
            self._ensure_session()
        except Exception:
            pass  # 兜底：即使建立 session 失败也尝试直接并发

        # 提取当前 session 的 cookies 传给 httpx
        cookie_dict = {c.name: c.value for c in self.session.cookies}

        url = f"{self.BASE_URL}/zsml/rs/yjfxs.do"
        headers = {
            **self._headers(),
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            "Accept": "application/json, text/plain, */*",
            "Origin": self.BASE_URL,
        }

        sem = asyncio.Semaphore(concurrency)
        results: dict[str, list[dict[str, Any]]] = {}
        errors: dict[str, str] = {}
        completed = 0
        total = len(schools)
        lock = asyncio.Lock()

        async with httpx.AsyncClient(
            follow_redirects=True,
            cookies=cookie_dict,
            headers={"User-Agent": headers["User-Agent"]},
        ) as client:
            async def _fetch_one(school: dict[str, Any]) -> None:
                nonlocal completed
                async with sem:
                    request_started = time.monotonic()
                    if request_delay > 0:
                        await asyncio.sleep(request_delay)
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
                    result, err = await call_api_with_retry(
                        client, url, data, headers, timeout=self.timeout
                    )

                    school_id = school.get("school_id", "")
                    if not err and result and result.get("flag"):
                        msg = result.get("msg", {})
                        if isinstance(msg, dict):
                            items = msg.get("list", [])
                            depts = [self._parse_department_item(item) for item in items]
                            results[school_id] = depts
                    else:
                        # 记录真实错误信息（而非泛化的"并发采集失败"）
                        if err:
                            errors[school_id] = err
                        elif result:
                            errors[school_id] = f"flag={result.get('flag')}"
                        else:
                            errors[school_id] = "空响应"

                    request_status = "success" if school_id in results else "failed"
                    log_event(
                        "department_request",
                        f"major_code={self.major_code} school_id={school_id or 'unknown'} "
                        f"status={request_status} departments={len(results.get(school_id, []))} "
                        f"elapsed_ms={int((time.monotonic() - request_started) * 1000)} "
                        f"error={safe_message(errors.get(school_id, 'none'))}",
                        "INFO" if request_status == "success" else "WARN",
                    )

                    async with lock:
                        completed += 1
                        if on_progress is not None:
                            on_progress(completed, total, school.get("name", ""))

            await asyncio.gather(*[_fetch_one(s) for s in schools])

        return results, errors

    async def fetch_departments_with_retries(
        self,
        schools: list[dict[str, Any]],
        *,
        on_progress: "Callable[[int, int, str], None] | None" = None,
        on_log: "Callable[[str, str], None] | None" = None,
    ) -> tuple[dict[str, list[dict[str, Any]]], dict[str, str]]:
        """三阶段降级并发采集院系所（ISSUE-029 增强，解决"访问太频繁"残留失败）.

        背景：研招网 IP 级限流。第一轮 15 并发快速模式必然触发"访问太频繁"，
        第二轮仅降并发到 5 + 0.3s 延迟仍会触发（实测 271 所中残留 22 所失败，
        且失败院校集中在湖北/广东/广西省代码段，符合"省份限流窗口未冷却"特征）。

        策略：
        - 第一轮：15 并发 0s 延迟（快速，预期 ~30% 失败）
        - 等待 30s（限流窗口冷却）
        - 第二轮：3 并发 1.5s 延迟（保守，预期剩余 ~10 所失败）
        - 等待 60s
        - 第三轮：1 并发 2s 延迟（兜底，预期 0 失败）

        Args:
            schools: 待采集院校列表
            on_progress: 进度回调，每完成 1 所触发（每轮内部独立计数）
            on_log: 阶段日志回调 (level, msg)，level ∈ {"info","warn","success"}。
                调用方可转发为 YAM_LOG 协议或写入本地日志。

        Returns:
            (results, errors) 元组，与 fetch_departments_batch 一致。
            errors 仅包含真正最终失败的院校。
        """
        all_results: dict[str, list[dict[str, Any]]] = {}
        all_errors: dict[str, str] = {}
        pending = list(schools)

        # (阶段名, 并发, 延迟, 冷却秒数)
        stages: list[tuple[str, int, float, int]] = [
            ("第一轮", 15, 0.0, 0),     # 快速
            ("第二轮", 3, 1.5, 30),     # 30s 冷却 + 3 并发 1.5s 延迟
            ("第三轮", 1, 2.0, 60),     # 60s 冷却 + 1 并发 2s 延迟
        ]

        for stage_name, conc, delay, cooldown in stages:
            if not pending:
                break
            stage_started = time.monotonic()
            if cooldown > 0:
                log_event(
                    "department_cooldown",
                    f"major_code={self.major_code} stage={stage_name} seconds={cooldown} "
                    f"pending={len(pending)}",
                    "WARN",
                )
                if on_log is not None:
                    on_log("warn", f"{stage_name}：等待 {cooldown}s 限流冷却...")
                await asyncio.sleep(cooldown)
            if on_log is not None:
                on_log(
                    "info",
                    f"{stage_name}：{len(pending)} 所院校"
                    f"（{conc} 并发，{delay}s 延迟）...",
                )

            # 每轮独立计数 progress（避免上一轮完成数影响当前轮）
            stage_completed = 0
            stage_total = len(pending)

            def _stage_progress(current: int, total: int, name: str) -> None:
                # current 是 fetch_departments_batch 内部的计数
                # 这里转发给外部 on_progress（外部不关心分轮）
                if on_progress is not None:
                    on_progress(current, total, name)

            results, errors = await self.fetch_departments_batch(
                pending,
                concurrency=conc,
                request_delay=delay,
                on_progress=_stage_progress,
            )
            all_results.update(results)
            all_errors.update(errors)

            # 收集下一轮待重试院校（不在 results 中的）
            pending = [s for s in pending if s["school_id"] not in all_results]

            if on_log is not None:
                success_n = len(results)
                fail_n = len(pending)
                level = "success" if fail_n == 0 else "info"
                on_log(
                    level,
                    f"{stage_name}完成：成功 {success_n}，剩余失败 {fail_n}",
                )
            log_event(
                "department_stage_completed",
                f"major_code={self.major_code} stage={stage_name} success={success_n} "
                f"remaining_failed={fail_n} elapsed_seconds={int(time.monotonic() - stage_started)}",
                "INFO" if fail_n == 0 else "WARN",
            )

        # 清理：已成功的院校从 errors 中移除
        for sid in list(all_errors.keys()):
            if sid in all_results:
                del all_errors[sid]

        return all_results, all_errors

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

