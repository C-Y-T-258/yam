"""Pydantic 数据模型."""

from typing import Optional

from pydantic import BaseModel, Field


class ScoreLine(BaseModel):
    """某院系某年分数线."""

    year: int
    total: Optional[int] = None
    politics: Optional[int] = None
    english: Optional[int] = None
    special_one: Optional[int] = None
    special_two: Optional[int] = None
    note: Optional[str] = None


class Department(BaseModel):
    """院系所/招生方向."""

    department_id: str
    name: str
    enrollment_count: Optional[int] = None
    exam_subjects: list[str] = Field(default_factory=list)
    score_lines: dict[int, Optional[ScoreLine]] = Field(default_factory=dict)


class School(BaseModel):
    """院校."""

    school_id: str
    name: str
    province: Optional[str] = None
    level: Optional[str] = None
    departments: list[Department] = Field(default_factory=list)


class MajorSnapshot(BaseModel):
    """某次抓取快照."""

    major_code: str
    major_name: str
    fetched_at: str
    school_count: int
    source: str
