from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from unittest import mock

import pytest

from yam import backend_entry


@pytest.mark.parametrize(
    "args",
    [
        ["--help"],
        ["sync-to-tauri", "--help"],
        ["search-majors", "--help"],
    ],
)
def test_dispatcher_help_smoke(args: list[str]) -> None:
    env = os.environ.copy()
    env.update(PYTHONIOENCODING="utf-8", PYTHONUTF8="1")
    result = subprocess.run(
        [sys.executable, "-m", "yam.backend_entry", *args],
        cwd=Path(__file__).parents[1],
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert result.returncode == 0, result.stderr
    assert "help" in result.stdout.lower() or "帮助" in result.stdout


def test_doctor_json_protocol(capsys: pytest.CaptureFixture[str]) -> None:
    assert backend_entry.main(["doctor", "--json"]) == 0
    line = capsys.readouterr().out.strip()
    assert line.startswith("YAM_BACKEND_STATUS ")
    payload = json.loads(line.removeprefix("YAM_BACKEND_STATUS "))
    assert payload["mode"] == "development"
    assert payload["dependencies"] == {"playwright": True, "httpx": True, "aiohttp": True}
    assert payload["browser"] in {"msedge", "missing"}


def test_sync_arguments_are_forwarded(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    def fake_forward(main: object, args: list[str]) -> int:
        captured.update(main=main, args=args)
        return 0

    fake_module = mock.Mock()
    monkeypatch.setattr(backend_entry, "_forward", fake_forward)
    monkeypatch.setitem(sys.modules, "yam.scripts.sync_to_tauri", fake_module)
    assert backend_entry.main(["sync-to-tauri", "--major-code", "081200", "--clear"]) == 0
    assert captured["args"] == ["--major-code", "081200", "--clear"]


def test_search_arguments_are_forwarded(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    def fake_run_cli(command: str, args: list[str]) -> int:
        captured.update(command=command, args=args)
        return 0

    monkeypatch.setattr(backend_entry, "_run_cli", fake_run_cli)
    assert backend_entry.main(["search-majors", "--yjxkdm", "0812", "--json"]) == 0
    assert captured == {"command": "search-majors", "args": ["--yjxkdm", "0812", "--json"]}


def test_bundled_resources_and_user_realtime_path(tmp_path: Path) -> None:
    resource_dir = tmp_path / "backend-assets"
    resource_data = resource_dir / "data"
    resource_data.mkdir(parents=True)
    source = Path(__file__).parents[1] / "data" / "majors.yaml"
    (resource_data / "majors.yaml").write_bytes(source.read_bytes())

    home = tmp_path / "home"
    script = """
from yam.config import config
assert config.get_major('081200')['code'] == '081200'
assert config.majors_file == __import__('pathlib').Path(__import__('os').environ['YAM_RESOURCE_DIR']) / 'data' / 'majors.yaml'
assert config.realtime_majors_file == __import__('pathlib').Path.home() / '.yam' / 'data' / 'majors_realtime.json'
assert not str(config.realtime_majors_file).startswith(str(config.majors_file.parent))
print(config.realtime_majors_file)
"""
    env = os.environ.copy()
    env.update(HOME=str(home), USERPROFILE=str(home), YAM_RESOURCE_DIR=str(resource_dir))
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=Path(__file__).parents[1],
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert result.returncode == 0, result.stderr
    assert str(home / ".yam" / "data" / "majors_realtime.json") in result.stdout
    assert not (resource_data / "majors_realtime.json").exists()
