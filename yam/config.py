"""全局配置与专业列表."""

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
        self.majors_file = self.project_dir / "data" / "majors.yaml"
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
        for major in self.list_majors(enabled_only=False):
            if major["code"] == code:
                return major
        return None


config = Config()
