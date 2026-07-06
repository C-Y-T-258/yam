"""通用工具函数."""

import hashlib
import json
import time
from datetime import datetime


def now_str() -> str:
    """返回当前时间的 ISO 格式字符串."""
    return datetime.now().isoformat(timespec="seconds")


def hash_dict(data: dict) -> str:
    """为字典生成短哈希，用于缓存键."""
    return hashlib.sha256(
        json.dumps(data, sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()[:16]


def sleep(seconds: float) -> None:
    """可中断的睡眠."""
    time.sleep(seconds)
