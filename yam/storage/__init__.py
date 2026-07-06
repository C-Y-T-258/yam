"""数据存储层."""

from yam.storage.db import Database
from yam.storage.models import Department, MajorSnapshot, School, ScoreLine

__all__ = ["Database", "Department", "MajorSnapshot", "School", "ScoreLine"]
