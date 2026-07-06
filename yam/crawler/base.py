"""爬虫基类."""

from abc import ABC, abstractmethod
from typing import Any


class BaseCrawler(ABC):
    """所有爬虫的基类."""

    def __init__(self, major_code: str, major_name: str):
        self.major_code = major_code
        self.major_name = major_name

    @property
    @abstractmethod
    def source(self) -> str:
        """数据源名称."""

    @abstractmethod
    def fetch_schools(self) -> list[dict[str, Any]]:
        """获取院校列表."""

    @abstractmethod
    def fetch_departments(self, school: dict[str, Any]) -> list[dict[str, Any]]:
        """获取某院校的院系所/招生信息."""

    @abstractmethod
    def fetch_score_lines(
        self, school: dict[str, Any], years: list[int]
    ) -> list[dict[str, Any]]:
        """获取某院校的历年分数线."""
