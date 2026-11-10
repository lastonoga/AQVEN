from pathlib import Path
from typing import Final

import pytest
from risk_warnings import diagnostics, field, id_type, inference, install, only, record_type, shop, union_type

from aqven.check import check_project

CODE: Final = "W_ID_COVERAGE_UNCHECKED"
ALLOWED_CODE: Final = "W_ID_ALLOWED_SET_MISSING"
BASE: Final = {
    "review_id.yaml": id_type(),
    "other_id.yaml": id_type(),
    "review.yaml": record_type(field("review_id", "ReviewId")),
    "classification.yaml": record_type(field("review_id", "ReviewId")),
}
REVIEWS: Final = field("reviews", "Review[]", extra="  maxItems: 5\n")
CLASSIFICATIONS: Final = field("classifications", "Classification[]", extra="  maxItems: 5\n")
UNIQUE: Final = '''checks:
- use: "unique_items"
  with:
    field: "$out.classifications"
    key: "review_id"
  on_fail: "flag"
'''
CUSTOM: Final = '''checks:
- run: "fixture_shop.triage.classify:rationale_is_short"
  on_fail: "flag"
'''
ALLOWED: Final = '''allowed_sets:
- type: "ReviewId"
  from: "$in.reviews[*].review_id"
'''


def test_shared_keyed_lists_warn_about_coverage_and_duplicates(tmp_path: Path) -> None:
    root = shop(tmp_path)
    install(root, BASE, inference(REVIEWS, CLASSIFICATIONS))

    report = check_project(root)
    warning = only(report, CODE)

    assert (warning.file, warning.path) == ("risk/work.inference.yaml", ("out", 0, "type"))
    assert warning.message == (
        "Input `reviews[*]` and output `classifications[*]` share key type `ReviewId`, but exact coverage and "
        "duplicate protection are not statically guarded. If each input review must be represented in the output, "
        "add coverage and uniqueness checks appropriate to the contract."
    )
    assert warning.hint == (
        "declare whether the contract needs exact one-to-one coverage, subset coverage or uniqueness only; "
        "allowed_sets proves membership, not coverage"
    )
    assert report.ok
    assert diagnostics(report, ALLOWED_CODE)


def test_matching_unique_items_changes_only_the_duplicate_part(tmp_path: Path) -> None:
    root = shop(tmp_path)
    install(root, BASE, inference(REVIEWS, CLASSIFICATIONS, suffix=UNIQUE))

    warning = only(check_project(root), CODE)

    assert warning.message == (
        "Input `reviews[*]` and output `classifications[*]` share key type `ReviewId`. Duplicates are checked, "
        "but exact coverage is not; if every input review must produce a classification, add a coverage check."
    )


def test_union_variants_with_a_required_shared_key_are_covered(tmp_path: Path) -> None:
    root = shop(tmp_path)
    types = {
        **BASE,
        "review_union.yaml": union_type(
            ("first", field("review_id", "ReviewId")),
            ("second", field("review_id", "ReviewId")),
        ),
        "classification_union.yaml": union_type(
            ("first", field("review_id", "ReviewId")),
            ("second", field("review_id", "ReviewId")),
        ),
    }
    source = inference(
        field("reviews", "ReviewUnion[]", extra="  maxItems: 5\n"),
        field("classifications", "ClassificationUnion[]", extra="  maxItems: 5\n"),
    )
    install(root, types, source)

    assert only(check_project(root), CODE).path == ("out", 0, "type")


def test_custom_run_is_a_possible_coverage_guard(tmp_path: Path) -> None:
    root = shop(tmp_path)
    install(root, BASE, inference(REVIEWS, CLASSIFICATIONS, suffix=CUSTOM))

    assert diagnostics(check_project(root), CODE) == []


def test_allowed_set_membership_does_not_suppress_coverage(tmp_path: Path) -> None:
    root = shop(tmp_path)
    types = {**BASE, "review_id.yaml": id_type("dynamic")}
    install(root, types, inference(REVIEWS, CLASSIFICATIONS, suffix=ALLOWED))

    assert only(check_project(root), CODE)


SCENARIOS: Final = {
    "nullable_output": (
        BASE,
        REVIEWS,
        field("classifications", "Classification[]?", extra="  maxItems: 5\n"),
    ),
    "nullable_key": (
        {**BASE, "classification.yaml": record_type(field("review_id", "ReviewId?"))},
        REVIEWS,
        CLASSIFICATIONS,
    ),
    "nested_only": (
        {**BASE, "envelope.yaml": record_type(field("inner", "Classification"))},
        REVIEWS,
        field("classifications", "Envelope[]", extra="  maxItems: 5\n"),
    ),
    "different_type": (
        {**BASE, "classification.yaml": record_type(field("review_id", "OtherId"))},
        REVIEWS,
        CLASSIFICATIONS,
    ),
    "scalar_input": (
        BASE,
        field("review_id", "ReviewId"),
        CLASSIFICATIONS,
    ),
    "partial_union": (
        {
            **BASE,
            "classification_union.yaml": union_type(
                ("identified", field("review_id", "ReviewId")),
                ("other", field("note", "Text", extra="  maxLength: 20\n")),
            ),
        },
        REVIEWS,
        field("classifications", "ClassificationUnion[]", extra="  maxItems: 5\n"),
    ),
}


@pytest.mark.parametrize("scenario", list(SCENARIOS), ids=list(SCENARIOS))
def test_coverage_negative_controls(tmp_path: Path, scenario: str) -> None:
    types, inputs, outputs = SCENARIOS[scenario]
    root = shop(tmp_path)
    install(root, types, inference(inputs, outputs))

    assert diagnostics(check_project(root), CODE) == []


@pytest.mark.parametrize(
    "wrong",
    [
        UNIQUE.replace('key: "review_id"', 'key: "other"'),
        UNIQUE.replace('field: "$out.classifications"', 'field: "$out.other"'),
    ],
    ids=["wrong_key", "wrong_field"],
)
def test_unique_items_must_match_the_output_list_and_shared_key(tmp_path: Path, wrong: str) -> None:
    root = shop(tmp_path)
    install(root, BASE, inference(REVIEWS, CLASSIFICATIONS, suffix=wrong))

    assert "duplicate protection are not statically guarded" in only(check_project(root), CODE).message
