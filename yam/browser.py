"""Playwright browser selection for source and bundled desktop modes."""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any


class BrowserMissingError(RuntimeError):
    """Microsoft Edge is required but unavailable."""


_EDGE_MESSAGE = "未检测到可用的 Microsoft Edge，请安装或更新 Microsoft Edge 后重试"


def is_desktop_runtime() -> bool:
    return bool(os.environ.get("YAM_DESKTOP")) or bool(getattr(sys, "frozen", False))


def edge_executable_path() -> Path | None:
    candidates: list[Path] = []
    for variable in ("PROGRAMFILES(X86)", "PROGRAMFILES", "LOCALAPPDATA"):
        root = os.environ.get(variable)
        if root:
            candidates.append(Path(root) / "Microsoft" / "Edge" / "Application" / "msedge.exe")
    return next((path for path in candidates if path.is_file()), None)


def _is_missing_executable(error: Exception) -> bool:
    text = str(error).lower()
    return (
        "executable doesn't exist" in text
        or "executable does not exist" in text
        or "browser executable" in text
        or "msedge" in text and ("not found" in text or "failed to launch" in text)
    )


async def launch_browser(browser_type: Any, headless: bool = True) -> Any:
    if is_desktop_runtime():
        try:
            return await browser_type.launch(headless=headless, channel="msedge")
        except Exception as error:
            if _is_missing_executable(error):
                raise BrowserMissingError(_EDGE_MESSAGE) from None
            raise

    try:
        return await browser_type.launch(headless=headless)
    except Exception as bundled_error:
        if not _is_missing_executable(bundled_error):
            raise
        try:
            return await browser_type.launch(headless=headless, channel="msedge")
        except Exception as edge_error:
            if _is_missing_executable(edge_error):
                raise BrowserMissingError(_EDGE_MESSAGE) from None
            raise
