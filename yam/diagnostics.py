"""Local-only diagnostic logging with sensitive-value redaction."""

from __future__ import annotations

import json
import os
import re
import threading
import traceback
from datetime import datetime, timezone
from pathlib import Path

LOG_DIRECTORY = Path.home() / ".yam" / "logs"
LOG_PATH = LOG_DIRECTORY / "yam-python.log"
MAX_LOG_BYTES = 2 * 1024 * 1024
ROTATED_LOG_COUNT = 3
_LOCK = threading.Lock()

_HEADER_RE = re.compile(r"(?im)\b(Cookie|Authorization)\s*:\s*[^\r\n]*")
_VALUE_RE = re.compile(
    r"(?i)\b(Cookie|Authorization|CASTGC|JSESSIONID|access_token|refresh_token|token|sessionid|session)"
    r"\b\s*([=:])\s*(?:['\"])?[^\s;,\r\n&'\"]+"
)


def sanitize_sensitive(message: object) -> str:
    """Return text with authentication and session values removed."""
    value = str(message)
    value = _HEADER_RE.sub(lambda match: f"{match.group(1)}: [REDACTED]", value)
    return _VALUE_RE.sub(
        lambda match: f"{match.group(1)}{match.group(2)}[REDACTED]", value
    )


def safe_message(error: BaseException | object, fallback: str = "操作失败") -> str:
    value = sanitize_sensitive(error).replace("\r", " ").replace("\n", " ").strip()
    return (value or fallback)[:500]


def log_exception(event: str, error: BaseException) -> None:
    """Append a sanitized exception and traceback; logging failures are ignored."""
    try:
        trace = "".join(traceback.format_exception(type(error), error, error.__traceback__))
        _append(
            {
                "timestamp_utc": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace(
                    "+00:00", "Z"
                ),
                "level": "ERROR",
                "event": re.sub(r"[^A-Za-z0-9_-]", "_", event)[:64] or "python_exception",
                "exception_type": type(error).__name__,
                "safe_message": safe_message(error),
                "traceback": sanitize_sensitive(trace),
            }
        )
    except Exception:
        pass


def log_event(event: str, message: object, level: str = "INFO") -> None:
    """Append a sanitized lifecycle event; logging failures are ignored."""
    try:
        _append(
            {
                "timestamp_utc": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace(
                    "+00:00", "Z"
                ),
                "level": re.sub(r"[^A-Za-z]", "", level).upper()[:16] or "INFO",
                "event": re.sub(r"[^A-Za-z0-9_-]", "_", event)[:64] or "python_event",
                "safe_message": safe_message(message, "event"),
            }
        )
    except Exception:
        pass


def _append(record: dict[str, str]) -> None:
    with _LOCK:
        LOG_DIRECTORY.mkdir(parents=True, exist_ok=True)
        _rotate_if_needed()
        with LOG_PATH.open("a", encoding="utf-8") as log_file:
            log_file.write(json.dumps(record, ensure_ascii=False) + os.linesep)


def _rotate_if_needed() -> None:
    if not LOG_PATH.exists() or LOG_PATH.stat().st_size <= MAX_LOG_BYTES:
        return

    oldest = Path(f"{LOG_PATH}.{ROTATED_LOG_COUNT}")
    if oldest.exists():
        oldest.unlink()
    for index in range(ROTATED_LOG_COUNT - 1, 0, -1):
        source = Path(f"{LOG_PATH}.{index}")
        if source.exists():
            source.replace(Path(f"{LOG_PATH}.{index + 1}"))
    LOG_PATH.replace(Path(f"{LOG_PATH}.1"))
