"""Standalone entry point used by the bundled desktop Python backend."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from collections.abc import Callable


def configure_standard_streams() -> None:
    """Keep bundled Windows child-process output on the UTF-8 wire protocol."""
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        reconfigure = getattr(stream, "reconfigure", None)
        if not callable(reconfigure):
            continue
        try:
            reconfigure(encoding="utf-8", errors="backslashreplace", line_buffering=True)
        except (OSError, ValueError):
            # Some embedded launchers expose a stream that cannot be reconfigured.
            # Protocol emitters must still avoid locale-only status glyphs.
            pass


configure_standard_streams()

from yam.browser import BrowserMissingError, edge_executable_path
from yam.diagnostics import log_event, log_exception, safe_message


def _forward(main: Callable[[], object], args: list[str]) -> int:
    original = sys.argv
    sys.argv = [original[0], *args]
    try:
        result = main()
        return result if isinstance(result, int) else 0
    finally:
        sys.argv = original


def _run_cli(command: str, args: list[str]) -> int:
    from yam.cli import app

    original = sys.argv
    sys.argv = [original[0], command, *args]
    try:
        app()
        return 0
    finally:
        sys.argv = original


def _login_yanzhao(major_code: str) -> int:
    from yam.crawler.dynamic import DynamicYanZhaoCrawler

    started = time.monotonic()
    log_event("login_seed_started", f"major_code={major_code}")
    crawler = DynamicYanZhaoCrawler(major_code, "")
    result = asyncio.run(crawler.login_and_fetch())
    log_event(
        "login_seed_completed",
        f"major_code={major_code} school_count={result.get('school_count', 0)} "
        f"success={bool(result.get('success'))} elapsed_seconds={int(time.monotonic() - started)}",
    )
    print("YAM_LOGIN_RESULT " + json.dumps(result, ensure_ascii=False), flush=True)
    return 0


def _refresh_login() -> int:
    from yam.crawler.dynamic import DynamicReader

    async def run() -> bool:
        reader = DynamicReader()
        try:
            return await reader.interactive_login("", "")
        finally:
            await reader.close()

    started = time.monotonic()
    log_event("login_refresh_started", "interactive login started")
    ok = asyncio.run(run())
    log_event(
        "login_refresh_completed",
        f"success={ok} elapsed_seconds={int(time.monotonic() - started)}",
    )
    print("YAM_REFRESH_RESULT " + json.dumps({"success": ok}, ensure_ascii=False), flush=True)
    return 0


def _doctor(json_output: bool) -> int:
    dependencies: dict[str, bool] = {}
    for module_name in ("playwright", "httpx", "aiohttp"):
        try:
            __import__(module_name)
            dependencies[module_name] = True
        except ImportError:
            dependencies[module_name] = False

    from yam.config import config

    try:
        resource_available = bool(config.load_majors().get("categories"))
    except (OSError, ValueError):
        resource_available = False
    edge_path = edge_executable_path()
    available = all(dependencies.values()) and resource_available
    status = {
        "mode": "bundled" if getattr(sys, "frozen", False) else "development",
        "executable_path": str(sys.executable),
        "available": available,
        "browser": "msedge" if edge_path else "missing",
        "browser_available": edge_path is not None,
        "message": (
            "后端运行正常" if available and edge_path
            else "未检测到可用的 Microsoft Edge，请安装或更新 Microsoft Edge 后重试"
            if not edge_path
            else "后端依赖不完整"
        ),
        "dependencies": dependencies,
        "resource_available": resource_available,
    }
    payload = json.dumps(status, ensure_ascii=False)
    if json_output:
        print("YAM_BACKEND_STATUS " + payload, flush=True)
    else:
        print(payload, flush=True)
    return 0 if available else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="研喵 YAM 桌面后端")
    subparsers = parser.add_subparsers(dest="command", metavar="COMMAND", required=True)
    for name, help_text in (
        ("sync-to-tauri", "同步采集数据到桌面数据库"),
        ("fetch", "抓取专业数据"),
        ("refresh-login", "刷新研招网登录状态"),
        ("search-majors", "实时查询专业"),
        ("update-majors-catalog", "更新完整专业目录"),
    ):
        subparsers.add_parser(name, help=help_text, add_help=False)
    login = subparsers.add_parser("login-yanzhao", help="登录研招网并抓取专业种子")
    login.add_argument("--major-code", required=True, metavar="CODE")
    doctor = subparsers.add_parser("doctor", help="检查后端运行环境")
    doctor.add_argument("--json", action="store_true", dest="json_output")
    return parser


def main(argv: list[str] | None = None) -> int:
    args_list = list(sys.argv[1:] if argv is None else argv)
    parser = build_parser()
    namespace, remaining = parser.parse_known_args(args_list)
    command = namespace.command

    if command == "sync-to-tauri":
        from yam.scripts.sync_to_tauri import main as sync_main

        return _forward(sync_main, remaining)
    if command == "fetch":
        return _run_cli("fetch", remaining)
    if command == "login-yanzhao":
        if remaining:
            parser.error(f"unrecognized arguments: {' '.join(remaining)}")
        return _login_yanzhao(namespace.major_code)
    if command == "refresh-login":
        if remaining:
            parser.error(f"unrecognized arguments: {' '.join(remaining)}")
        return _refresh_login()
    if command == "search-majors":
        return _run_cli("search-majors", remaining)
    if command == "update-majors-catalog":
        from yam.scripts.update_majors_catalog import main as update_main

        return _forward(update_main, remaining)
    if command == "doctor":
        if remaining:
            parser.error(f"unrecognized arguments: {' '.join(remaining)}")
        return _doctor(namespace.json_output)
    parser.error(f"unknown command: {command}")
    return 2


def run() -> int:
    try:
        return main()
    except (SystemExit, KeyboardInterrupt):
        raise
    except BrowserMissingError as error:
        print(f"YAM_ERROR BROWSER_MISSING {error}", flush=True)
        return 1
    except Exception as error:
        log_exception("backend_entry_failed", error)
        print(f"YAM 后端操作失败：{safe_message(error)}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(run())

