from pathlib import Path
from typing import Final

import pytest
from risk_warnings import diagnostics, field, id_type, inference, install, only, record_type, shop, union_type

from aqven.check import check_project
from aqven.diagnostics import Severity

CODE: Final = "W_ID_ALLOWED_SET_MISSING"
HINT: Final = (
    "for an allowed set, mark the IdType allowed_set: dynamic and declare allowed_sets.from with one compatible "
    "$in list; deterministic pass-through/generation or a reviewed custom guard are alternatives"
)
BASE_TYPES: Final = {
    "review_id.yaml": id_type(),
    "review.yaml": record_type(field("review_id", "ReviewId")),
    "result.yaml": record_type(field("review_id", "ReviewId")),
    "result_union.yaml": union_type(
        ("identified", field("review_id", "ReviewId")),
        ("other", field("note", "Text", extra="  maxLength: 20\n")),
    ),
}
REVIEWS: Final = field("reviews", "Review[]", extra="  maxItems: 5\n")
ALLOWED: Final = '''allowed_sets:
- type: "ReviewId"
  from: "$in.reviews[*].review_id"
'''


@pytest.mark.parametrize(
    "output",
    [
        field("review_id", "ReviewId"),
        field("review_id", "ReviewId?"),
        field("review_ids", "ReviewId[]", extra="  maxItems: 3\n"),
        field("result", "Result"),
        field("result", "ResultUnion"),
    ],
    ids=["direct", "optional", "list", "nested", "union"],
)
def test_output_id_without_allowed_set_warns_with_input_candidates(tmp_path: Path, output: str) -> None:
    root = shop(tmp_path)
    install(root, BASE_TYPES, inference(REVIEWS, output))

    report = check_project(root)
    warning = only(report, CODE)

    assert warning.severity is Severity.WARNING
    assert (warning.file, warning.path) == ("risk/work.inference.yaml", ("out", 0, "type"))
    assert warning.message == (
        "Output uses `ReviewId` without an allowed set. Matching input candidates exist at "
        "`reviews[*].review_id`; if the model selects input entities, constrain the output "
        "or attach IDs deterministically."
    )
    assert warning.hint == HINT
    assert report.ok


def test_repeated_output_type_produces_one_warning_and_sorted_candidates(tmp_path: Path) -> None:
    root = shop(tmp_path)
    inputs = field("z_ids", "ReviewId[]", extra="  maxItems: 5\n") + REVIEWS
    outputs = field("review_id", "ReviewId") + field("result", "Result")
    install(root, BASE_TYPES, inference(inputs, outputs))

    warning = only(check_project(root), CODE)

    assert "`reviews[*].review_id`, `z_ids[*]`" in warning.message


def test_output_id_without_a_matching_input_list_has_the_other_message(tmp_path: Path) -> None:
    root = shop(tmp_path)
    types = {"job_id.yaml": id_type()}
    source = inference(field("job_id", "JobId"), field("job_id", "JobId"))
    install(root, types, source)

    report = check_project(root)
    warning = only(report, CODE)

    assert warning.message == (
        "Output uses `JobId` without an allowed set or a matching input list. If the model selects existing entities, "
        "provide a candidate set; if this is a new identifier, generate it in code "
        "rather than asking the model to invent it."
    )
    assert report.ok


@pytest.mark.parametrize("allowed_set", ["dynamic", "none"], ids=["valid_declaration", "invalid_declaration"])
def test_any_existing_declaration_suppresses_the_warning(tmp_path: Path, allowed_set: str) -> None:
    root = shop(tmp_path)
    types = {**BASE_TYPES, "review_id.yaml": id_type(allowed_set)}
    install(root, types, inference(REVIEWS, field("result", "Result"), suffix=ALLOWED))

    assert diagnostics(check_project(root), CODE) == []


def test_input_only_dynamic_and_unresolved_ids_do_not_warn(tmp_path: Path) -> None:
    root = shop(tmp_path)
    opaque = union_type(
        ("dynamic", field("value", "Dynamic")),
        ("unknown", field("value", "MissingType")),
    )
    source = inference(REVIEWS + field("opaque", "Opaque"), field("answer", "Text", extra="  maxLength: 20\n"))
    install(root, {**BASE_TYPES, "opaque.yaml": opaque}, source)

    assert diagnostics(check_project(root), CODE) == []
