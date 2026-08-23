import json
from pathlib import Path

import pytest

from yam.crawler import dynamic
from yam.crawler.yanzhao import YanZhaoCrawler


def _write_seed(path: Path, school_id: str, name: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            [{"schId": school_id, "dwdm": school_id, "dwmc": name}],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


def _crawler_with_paths(tmp_path: Path) -> YanZhaoCrawler:
    crawler = YanZhaoCrawler("0821Z5", "非织造材料与工程")
    crawler.user_seed_file = tmp_path / "user" / "seed.json"
    crawler.bundled_seed_file = tmp_path / "bundled" / "seed.json"
    crawler.seed_file = crawler.user_seed_file
    return crawler


def test_fetch_schools_prefers_user_seed_without_dynamic_fetch(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    crawler = _crawler_with_paths(tmp_path)
    _write_seed(crawler.user_seed_file, "10001", "用户种子院校")
    _write_seed(crawler.bundled_seed_file, "20001", "内置种子院校")

    async def fail_fetch(*args, **kwargs):
        raise AssertionError("有效用户种子不应再次启动动态抓取")

    monkeypatch.setattr(dynamic.DynamicYanZhaoCrawler, "fetch_and_save", fail_fetch)

    schools = crawler.fetch_schools()

    assert [school["name"] for school in schools] == ["用户种子院校"]
    assert crawler.seed_file == crawler.user_seed_file


def test_fetch_schools_ignores_invalid_user_seed_and_uses_bundled_fallback(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    crawler = _crawler_with_paths(tmp_path)
    crawler.user_seed_file.parent.mkdir(parents=True)
    crawler.user_seed_file.write_text("[]", encoding="utf-8")
    _write_seed(crawler.bundled_seed_file, "20001", "内置种子院校")

    async def fail_fetch(*args, **kwargs):
        raise AssertionError("有效回退种子不应启动动态抓取")

    monkeypatch.setattr(dynamic.DynamicYanZhaoCrawler, "fetch_and_save", fail_fetch)

    schools = crawler.fetch_schools()

    assert [school["name"] for school in schools] == ["内置种子院校"]
    assert crawler.seed_file == crawler.bundled_seed_file


def test_fetch_schools_runs_dynamic_fetch_only_without_a_valid_seed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    crawler = _crawler_with_paths(tmp_path)
    calls = 0

    async def create_user_seed(instance, headless=True):
        nonlocal calls
        calls += 1
        _write_seed(crawler.user_seed_file, "10001", "动态抓取院校")
        return {"school_count": 1, "seed_file": str(crawler.user_seed_file)}

    monkeypatch.setattr(dynamic.DynamicYanZhaoCrawler, "fetch_and_save", create_user_seed)

    schools = crawler.fetch_schools()

    assert calls == 1
    assert [school["name"] for school in schools] == ["动态抓取院校"]
    assert crawler.seed_file == crawler.user_seed_file

