from __future__ import annotations

import json
from pathlib import Path

from yam.scripts.measure_year_source_coverage import measure


AUDIT = (
    Path(__file__).parents[1]
    / "docs"
    / "research"
    / "year-source"
    / "evidence"
    / "local-audit.json"
)


def test_current_product_denominators_and_reference_coverage() -> None:
    report = measure(json.loads(AUDIT.read_text(encoding="utf-8")))

    assert report["current_product_universe"]["plan"]["entity_cycles"] == 11_844
    assert report["current_product_universe"]["department"]["entity_cycles"] == 4_868
    assert report["current_product_universe"]["school_major"]["entity_cycles"] == 3_420
    reference = report["score_coverage_at_school_major_cycle"]["reference"]
    assert reference["numerator"] == 2_454
    assert reference["denominator"] == 3_420
    assert reference["percent"] == 71.7544
    assert [row["numerator"] for row in reference["by_year"]] == [490, 595, 670, 699]


def test_strict_coverage_does_not_promote_untyped_or_unmapped_evidence() -> None:
    report = measure(json.loads(AUDIT.read_text(encoding="utf-8")))

    assert all(
        item["numerator"] == 0
        for item in report["score_coverage_at_school_major_cycle"]["strict_types"].values()
    )
    assert all(
        item["numerator"] == 0
        for item in report["catalog_exact_mapping_by_level"].values()
    )
    assert report["legacy_plan_rows"]["confirmed_current_plan_mappings"] == 0
    assert report["nationwide_admission_combination_coverage"]["status"] == "not_computable"
