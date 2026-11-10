from pathlib import Path
from typing import Final

import pytest
from risk_warnings import diagnostics, field, id_type, inference, install, only, record_type, shop, union_type

from aqven.check import check_project

CODE: Final = "W_ID_COVERAGE_CAP"
COVERAGE_CODE: Final = "W_ID_COVERAGE_UNCHECKED"
ALLOWED_CODE: Final = "W_ID_ALLOWED_SET_MISSING"
BASE: Final = {
    "zone_id.yaml": id_type(),
    "other_id.yaml": id_type(),
    "zone.yaml": record_type(field("zone_id", "ZoneId")),
    "group.yaml": record_type(field("zones", "Zone[]", extra="  maxItems: 20\n")),
    "zone_result.yaml": record_type(field("zone_id", "ZoneId")),
}
INPUT: Final = field("groups", "Group[]", extra="  maxItems: 10\n")
OUTPUT: Final = field("result", "ZoneResult[]", extra="  maxItems: 50\n")
CHECKS: Final = '''checks:
- run: "fixture_shop.triage.classify:rationale_is_short"
  on_fail: "flag"
- use: "unique_items"
  with:
    field: "$out.result"
    key: "zone_id"
  on_fail: "flag"
'''


def test_nested_capacity_products_warn_and_coexist_with_other_id_warnings(tmp_path: Path) -> None:
    root = shop(tmp_path)
    install(root, BASE, inference(INPUT, OUTPUT))

    report = check_project(root)
    warning = only(report, CODE)

    assert (warning.file, warning.path) == ("risk/work.inference.yaml", ("out", 0, "maxItems"))
    assert warning.message == (
        "Input `groups[*].zones[*]` can contain 200 `ZoneId`-keyed entries (10×20), but output `result[*]` "
        "has capacity 50. If every input entry requires its own output record, "
        "coverage is impossible for schema-allowed inputs."
    )
    assert warning.hint == (
        "raise or rebalance the output caps, narrow the declared input, "
        "or review the intentional subset/truncation contract"
    )
    assert diagnostics(report, ALLOWED_CODE)
    assert diagnostics(report, COVERAGE_CODE)
    assert report.ok


def test_custom_run_and_unique_items_do_not_suppress_capacity(tmp_path: Path) -> None:
    root = shop(tmp_path)
    install(root, BASE, inference(INPUT, OUTPUT, suffix=CHECKS))

    report = check_project(root)

    assert only(report, CODE)
    assert diagnostics(report, COVERAGE_CODE) == []


def test_registry_output_bound_anchors_at_the_top_level_type(tmp_path: Path) -> None:
    root = shop(tmp_path)
    types = {
        **BASE,
        "result_batch.yaml": record_type(field("items", "ZoneResult[]", extra="  maxItems: 50\n")),
    }
    install(root, types, inference(INPUT, field("result", "ResultBatch")))

    warning = only(check_project(root), CODE)

    assert warning.path == ("out", 0, "type")
    assert "output `result.items[*]` has capacity 50" in warning.message


def test_optional_input_ancestors_and_union_branch_maximum_still_count(tmp_path: Path) -> None:
    root = shop(tmp_path)
    types = {
        **BASE,
        "small_zone.yaml": record_type(field("zone_id", "ZoneId")),
        "large_zone.yaml": record_type(field("zone_id", "ZoneId")),
        "small_group.yaml": record_type(field("zones", "SmallZone[]", extra="  maxItems: 10\n")),
        "large_group.yaml": record_type(field("zones", "LargeZone[]", extra="  maxItems: 20\n")),
        "group_union.yaml": union_type(
            ("small", field("zones", "SmallZone[]", extra="  maxItems: 10\n")),
            ("large", field("zones", "LargeZone[]", extra="  maxItems: 20\n")),
        ),
    }
    source = inference(
        field("groups", "GroupUnion[]?", extra="  maxItems: 10\n"),
        OUTPUT,
    )
    install(root, types, source)

    assert "200 `ZoneId`-keyed entries (10×20)" in only(check_project(root), CODE).message


NEGATIVE: Final = {
    "equal": (BASE, INPUT, field("result", "ZoneResult[]", extra="  maxItems: 200\n")),
    "larger": (BASE, INPUT, field("result", "ZoneResult[]", extra="  maxItems: 201\n")),
    "unknown_input": (
        {**BASE, "group.yaml": record_type(field("zones", "Zone[]"))},
        INPUT,
        OUTPUT,
    ),
    "zero_input": (BASE, field("groups", "Group[]", extra="  maxItems: 0\n"), OUTPUT),
    "unknown_output": (BASE, INPUT, field("result", "ZoneResult[]")),
    "nullable_output": (BASE, INPUT, field("result", "ZoneResult[]?", extra="  maxItems: 50\n")),
    "different_type": (
        {**BASE, "zone_result.yaml": record_type(field("zone_id", "OtherId"))},
        INPUT,
        OUTPUT,
    ),
    "scalar_input": (BASE, field("zone_id", "ZoneId"), OUTPUT),
    "partial_output": (
        {
            **BASE,
            "result_union.yaml": union_type(
                ("identified", field("zone_id", "ZoneId")),
                ("other", field("note", "Text", extra="  maxLength: 20\n")),
            ),
        },
        INPUT,
        field("result", "ResultUnion[]", extra="  maxItems: 50\n"),
    ),
}


@pytest.mark.parametrize("scenario", list(NEGATIVE), ids=list(NEGATIVE))
def test_capacity_negative_controls(tmp_path: Path, scenario: str) -> None:
    types, inputs, outputs = NEGATIVE[scenario]
    root = shop(tmp_path)
    install(root, types, inference(inputs, outputs))

    assert diagnostics(check_project(root), CODE) == []
