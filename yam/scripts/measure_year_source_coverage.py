"""Measure admission-cycle coverage from the read-only local audit artifact.

The audit artifact is produced from query-only SQLite connections. This step
does not open a user database and never treats projected score rows as catalog
history. Its output contains aggregate counts only.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


CYCLES = (2023, 2024, 2025, 2026)
DEFAULT_AUDIT = Path("docs/research/year-source/evidence/local-audit.json")


def _percent(numerator: int, denominator: int) -> float:
    return round(numerator * 100 / denominator, 4) if denominator else 0.0


def _rows(audit: dict[str, Any], database: str, query_id: str) -> list[dict[str, Any]]:
    return audit[database]["queries"][query_id]["rows"]


def measure(audit: dict[str, Any]) -> dict[str, Any]:
    entity = _rows(audit, "desktop", "desktop.current_entities")[0]
    per_cycle = {
        "major": entity["majors"],
        "school": entity["source_school_ids"],
        "school_major": entity["school_major_pairs"],
        "department": entity["department_entities"],
        "plan": entity["plans"],
    }
    universe = {
        level: {"entities": count, "cycles": len(CYCLES), "entity_cycles": count * len(CYCLES)}
        for level, count in per_cycle.items()
    }

    score_rows = _rows(audit, "desktop", "desktop.score_evidence_by_year_scope")
    school_major_by_year = {
        year: next(
            (
                row["school_major_pairs"]
                for row in score_rows
                if row["year"] == year and row["score_scope"] == "school_major"
            ),
            0,
        )
        for year in CYCLES
    }
    denominator = universe["school_major"]["entity_cycles"]
    reference_total = sum(school_major_by_year.values())
    reference_coverage = {
        "classification": "untyped_score_reference",
        "entity_granularity": "school_major",
        "numerator": reference_total,
        "denominator": denominator,
        "percent": _percent(reference_total, denominator),
        "by_year": [
            {
                "admission_cycle": year,
                "numerator": school_major_by_year[year],
                "denominator": per_cycle["school_major"],
                "percent": _percent(school_major_by_year[year], per_cycle["school_major"]),
            }
            for year in CYCLES
        ],
        "warning": "Reference rows are not classified as national, school, department, major, or direction score lines.",
    }

    zero_by_year = [
        {
            "admission_cycle": year,
            "numerator": 0,
            "denominator": per_cycle["school_major"],
            "percent": 0.0,
        }
        for year in CYCLES
    ]
    strict_score = {
        score_type: {
            "numerator": 0,
            "denominator": denominator,
            "percent": 0.0,
            "by_year": zero_by_year,
            "reason": "The local model has no provenance-backed strict score-line type for this category.",
        }
        for score_type in (
            "national_score_line",
            "school_score_line",
            "department_score_line",
            "major_score_line",
            "direction_score_line",
        )
    }

    directory_fields = (
        "offered_status",
        "department",
        "direction",
        "study_mode",
        "exam_mode",
        "exam_subjects",
        "planned_enrollment",
        "special_plan",
    )
    plan_denominator = universe["plan"]["entity_cycles"]
    directory = {
        field: {
            "numerator": 0,
            "denominator": plan_denominator,
            "percent": 0.0,
            "reason": "All current plan snapshots have catalog_year_status=unknown.",
        }
        for field in directory_fields
    }

    admission_fields = (
        "admitted_count",
        "initial_score_min",
        "initial_score_avg",
        "initial_score_max",
        "retest_score",
        "final_score",
    )
    admission = {
        field: {
            "numerator": 0,
            "denominator": denominator,
            "percent": 0.0,
            "reason": "No admission-statistics fact is present in the local product database.",
        }
        for field in admission_fields
    }

    legacy_plan_rows = sum(
        row["rows"]
        for row in _rows(audit, "source", "source.admission_plan_by_year_major")
    )
    confirmed_plan_mappings = sum(
        row["mappings"]
        for row in _rows(audit, "desktop", "desktop.source_mapping_status")
        if row["entity_type"] == "plan" and row["mapping_status"] == "confirmed"
    )

    exact_mapping = {
        level: {
            "numerator": 0,
            "denominator": values["entity_cycles"],
            "percent": 0.0,
            "reason": "No local catalog fact has a declared cycle and a confirmed mapping at this level.",
        }
        for level, values in universe.items()
    }

    return {
        "artifact_schema": "yam.year_source_coverage.v1",
        "admission_cycles": list(CYCLES),
        "input": {
            "artifact_schema": audit["artifact_schema"],
            "query_ids": [
                "desktop.current_entities",
                "desktop.catalog_year_status",
                "desktop.score_evidence_by_year_scope",
                "desktop.plan_year_rows",
                "desktop.source_mapping_status",
            ],
        },
        "current_product_universe": universe,
        "catalog_exact_mapping_by_level": exact_mapping,
        "catalog_field_coverage_at_plan_cycle": directory,
        "score_coverage_at_school_major_cycle": {
            "reference": reference_coverage,
            "strict_types": strict_score,
        },
        "admission_statistics_coverage_at_school_major_cycle": admission,
        "legacy_plan_rows": {
            "rows": legacy_plan_rows,
            "confirmed_current_plan_mappings": confirmed_plan_mappings,
            "coverage_numerator": confirmed_plan_mappings,
            "reason": "Only 085410 is present and all observed third-party source entities are unmapped.",
        },
        "nationwide_admission_combination_coverage": {
            "status": "not_computable",
            "numerator": None,
            "denominator": None,
            "percent": None,
            "reason": "No authoritative, versioned nationwide universe of school-department-major-direction-plan combinations for all four cycles was obtained.",
        },
        "rules": {
            "empty_query": "unknown",
            "confirmed_absence": "requires a complete official annual catalog after entity reconciliation",
            "publication_or_collection_time": "never substitutes for admission_cycle",
            "projected_score_rows": "never count as historical catalog coverage",
            "external_depth_samples": "never extrapolate into the all-product numerator",
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audit", type=Path, default=DEFAULT_AUDIT)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()
    payload = measure(json.loads(args.audit.read_text(encoding="utf-8")))
    text = json.dumps(payload, ensure_ascii=False, indent=2 if args.pretty else None, sort_keys=True) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding="utf-8")
    else:
        print(text, end="")


if __name__ == "__main__":
    main()
