from __future__ import annotations

import json
from pathlib import Path


INVENTORY = (
    Path(__file__).parents[1]
    / "docs"
    / "research"
    / "year-source"
    / "evidence"
    / "source-inventory.json"
)


def test_source_inventory_has_traceable_determinate_conclusions() -> None:
    payload = json.loads(INVENTORY.read_text(encoding="utf-8"))
    allowed = set(payload["allowed_conclusions"])
    assert allowed == {"可自动采集", "仅人工可用", "受限", "无历史数据", "不可用"}
    assert len(payload["sources"]) >= 10

    for source in payload["sources"]:
        assert source["conclusion"] in allowed
        assert source["url"]
        assert source["evidence_urls"]
        assert source["evidence_locator"]
        assert source["source_year_kind"]
        assert set(source["confidence"]) == {
            "authority",
            "traceability",
            "entity_match_granularity",
        }


def test_source_inventory_contains_no_candidate_pii_fields() -> None:
    text = INVENTORY.read_text(encoding="utf-8")
    forbidden_keys = ('"candidate_name"', '"exam_number"', '"identity_number"')
    assert not any(key in text for key in forbidden_keys)
