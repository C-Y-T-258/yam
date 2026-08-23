from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest
import requests

from yam import diagnostics
from yam.crawler import dynamic
from yam.crawler.dynamic import (
    DynamicReader,
    DynamicYanZhaoCrawler,
    _parse_school_list_response,
)


def test_empty_province_response_is_valid_and_needs_no_retry() -> None:
    schools, total = _parse_school_list_response(
        {"flag": True, "msg": {"list": [], "totalCount": 0}}
    )

    assert schools == []
    assert total == 0


def test_school_response_rejects_string_error() -> None:
    with pytest.raises(RuntimeError, match="请登录"):
        _parse_school_list_response({"flag": False, "msg": "请登录"})


def test_province_scan_does_not_retry_a_valid_empty_region(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    responses = [
        {"flag": True, "msg": {"list": [{"schId": "1", "dwmc": "测试大学"}], "totalCount": 1}},
        {"flag": True, "msg": {"list": [], "totalCount": 0}},
    ]
    sleeps: list[float] = []
    events: list[tuple[str, str, str]] = []

    class FakeResponse:
        def __init__(self, payload: dict) -> None:
            self.payload = payload

        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return self.payload

    class FakeSession:
        def __init__(self) -> None:
            self.cookies = {}
            self.headers = {}
            self.calls = 0

        def post(self, *args, **kwargs) -> FakeResponse:
            payload = responses[self.calls]
            self.calls += 1
            return FakeResponse(payload)

    class FakePage:
        async def wait_for_timeout(self, milliseconds: int) -> None:
            return None

        async def close(self) -> None:
            return None

    class FakeContext:
        async def new_page(self) -> FakePage:
            return FakePage()

        async def cookies(self) -> list[dict[str, str]]:
            return [{"name": "CASTGC", "value": "redacted", "domain": "account.chsi.com.cn"}]

    session = FakeSession()
    reader = DynamicReader()
    reader.context = FakeContext()

    async def no_navigation(*args, **kwargs) -> None:
        return None

    async def fake_major(*args, **kwargs) -> dict[str, str]:
        return {"zydm": "0821Z5", "zymc": "测试专业"}

    async def record_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    monkeypatch.setattr(dynamic, "_PROVINCES", {"11": "北京", "82": "澳门"})
    monkeypatch.setattr(requests, "Session", lambda: session)
    monkeypatch.setattr(
        dynamic,
        "log_event",
        lambda event, message, level="INFO": events.append((event, str(message), level)),
    )
    monkeypatch.setattr(reader, "_goto_with_retry", no_navigation)
    monkeypatch.setattr(reader, "_fetch_major_sign", fake_major)
    monkeypatch.setattr(dynamic.asyncio, "sleep", record_sleep)

    schools = asyncio.run(reader.fetch_school_list("0821Z5", "测试专业"))

    assert len(schools) == 1
    assert session.calls == 2
    assert sleeps == [2, 0.5]
    request_events = [event for event in events if event[0] == "seed_school_request"]
    assert len(request_events) == 2
    assert "region=11" in request_events[0][1]
    assert "returned=1 total=1" in request_events[0][1]
    assert "region=82" in request_events[1][1]
    assert "returned=0 total=0" in request_events[1][1]


def test_navigation_timing_is_logged(monkeypatch: pytest.MonkeyPatch) -> None:
    events: list[tuple[str, str, str]] = []

    class FakePage:
        async def goto(self, url: str, **kwargs) -> None:
            return None

    monkeypatch.setattr(
        dynamic,
        "log_event",
        lambda event, message, level="INFO": events.append((event, str(message), level)),
    )

    asyncio.run(DynamicReader._goto_with_retry(FakePage(), "https://yz.chsi.com.cn/zsml/?secret=no"))

    assert events[0][0] == "browser_navigation"
    assert "path=/zsml/" in events[0][1]
    assert "secret" not in events[0][1]
    assert "elapsed_ms=" in events[0][1]


def test_login_and_fetch_initializes_browser_only_through_interactive_login(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = {"init": 0, "login": 0, "fetch": 0, "close": 0}

    class FakeReader:
        cookie_file = tmp_path / "cookies.json"

        async def init(self, headless: bool = True) -> None:
            calls["init"] += 1

        async def interactive_login(self, major_code: str, major_name: str) -> bool:
            calls["login"] += 1
            await self.init(headless=False)
            return True

        async def fetch_school_list(self, major_code: str, major_name: str) -> list[dict]:
            calls["fetch"] += 1
            return [{"schId": "1", "dwdm": "10001", "dwmc": "测试大学"}]

        async def close(self) -> None:
            calls["close"] += 1

    monkeypatch.setattr(dynamic, "DynamicReader", FakeReader)
    monkeypatch.setattr(dynamic, "log_event", lambda *args, **kwargs: None)
    crawler = DynamicYanZhaoCrawler("0821Z5", "测试专业")
    crawler.seed_file = tmp_path / "seed.json"

    result = asyncio.run(crawler.login_and_fetch())

    assert result["success"] is True
    assert calls == {"init": 1, "login": 1, "fetch": 1, "close": 1}


def test_success_lifecycle_event_is_written_and_sanitized(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    log_path = tmp_path / "yam-python.log"
    monkeypatch.setattr(diagnostics, "LOG_DIRECTORY", tmp_path)
    monkeypatch.setattr(diagnostics, "LOG_PATH", log_path)

    diagnostics.log_event(
        "fetch_completed",
        "major_code=0821Z5 success=1 Cookie=secret",
    )

    record = json.loads(log_path.read_text(encoding="utf-8"))
    assert record["event"] == "fetch_completed"
    assert record["level"] == "INFO"
    assert "secret" not in record["safe_message"]
