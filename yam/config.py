"""全局配置与专业列表."""

import json
import os
import sys
from pathlib import Path
from typing import Any

import yaml

DEFAULT_CONFIG = {
    "concurrency": 3,
    "retry_times": 3,
    "request_timeout": 30,
    "delay_between_requests": 0.5,
}


class Config:
    """YAM 全局配置."""

    def __init__(self) -> None:
        self.project_dir = Path(__file__).parent.parent.resolve()
        self.data_dir = self._ensure_dir(Path.home() / ".yam" / "data")
        self.log_dir = self._ensure_dir(Path.home() / ".yam" / "logs")
        self.config_file = Path.home() / ".yam" / "config.yaml"
        if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
            self.resource_root = Path(sys._MEIPASS).resolve()
        else:
            resource_override = os.environ.get("YAM_RESOURCE_DIR")
            self.resource_root = (
                Path(resource_override).resolve()
                if resource_override
                else self.project_dir
            )
        self.majors_file = self.resource_root / "data" / "majors.yaml"
        self.realtime_majors_file = self.data_dir / "majors_realtime.json"
        self.development_realtime_majors_file = self.project_dir / "data" / "majors_realtime.json"
        self.user_config = self._load_user_config()

    def _ensure_dir(self, path: Path) -> Path:
        path.mkdir(parents=True, exist_ok=True)
        return path

    def _load_user_config(self) -> dict[str, Any]:
        if self.config_file.exists():
            with open(self.config_file, "r", encoding="utf-8") as f:
                return yaml.safe_load(f) or {}
        return {}

    def get(self, key: str, default: Any = None) -> Any:
        return self.user_config.get(key, DEFAULT_CONFIG.get(key, default))

    def load_majors(self) -> dict[str, Any]:
        with open(self.majors_file, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}

    def list_majors(self, enabled_only: bool = True) -> list[dict[str, Any]]:
        data = self.load_majors()
        majors = []
        for cat in data.get("categories", []):
            for major in cat.get("majors", []):
                major["category_code"] = cat["code"]
                major["category_name"] = cat["name"]
                if not enabled_only or major.get("enabled", False):
                    majors.append(major)
        return majors

    def get_major(self, code: str) -> dict[str, Any] | None:
        """按代码查专业；优先使用用户实时目录，开发时兼容仓库目录。"""
        realtime_file = self.realtime_majors_file
        if (
            not realtime_file.exists()
            and not getattr(sys, "frozen", False)
            and not os.environ.get("YAM_RESOURCE_DIR")
            and self.development_realtime_majors_file.exists()
        ):
            realtime_file = self.development_realtime_majors_file
        if realtime_file.exists():
            with open(realtime_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            for category_key, degree_type in (
                ("academic_categories", "学术学位"),
                ("professional_categories", "专业学位"),
            ):
                for category in data.get(category_key, []):
                    for discipline in category.get("disciplines", []):
                        for major in discipline.get("majors", []):
                            if str(major.get("code", "")) == code:
                                return {
                                    **major,
                                    "code": code,
                                    "degree_type": degree_type,
                                    "category_code": category.get("code", ""),
                                    "category_name": category.get("name", ""),
                                    "discipline_code": discipline.get("code", ""),
                                    "discipline_name": discipline.get("name", ""),
                                }

        for major in self.list_majors(enabled_only=False):
            if str(major["code"]) == code:
                return major
        return None


config = Config()
