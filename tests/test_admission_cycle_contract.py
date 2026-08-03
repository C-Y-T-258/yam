from __future__ import annotations

import json
from pathlib import Path


CONTRACT = (
    Path(__file__).parents[1]
    / "docs"
    / "research"
    / "year-source"
    / "evidence"
    / "admission-cycle-contract.json"
)


def test_contract_keeps_year_kinds_and_strict_fact_types_separate() -> None:
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))

    direct = set(contract["year_mapping"]["direct_when_entity_confirmed"])
    never = set(contract["year_mapping"]["never_direct"])
    assert not direct & never
    assert {"request_year", "publication_date", "collected_at", "archive_capture_time"} <= never
    assert contract["catalog_presence"]["empty_query_state"] == "unknown"
    assert set(contract["entity_mapping"]["levels"]) == {
        "school",
        "major",
        "department",
        "direction",
        "plan",
    }
    assert {
        "national_score_line",
        "school_score_line",
        "department_score_line",
        "major_score_line",
        "direction_score_line",
    } <= set(contract["fact_types"])


def test_contract_requires_version_chain_and_private_row_deduplication() -> None:
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))

    assert {"correction", "supplement", "adjustment"} <= set(
        contract["version_chain"]["relations"]
    )
    assert "HMAC-SHA256" in contract["deduplication"]["candidate_row_rule"]
    assert "no name or raw exam number" in contract["deduplication"]["candidate_row_rule"]
