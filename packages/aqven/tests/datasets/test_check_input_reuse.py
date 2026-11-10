from pathlib import Path
from typing import Final
from unittest.mock import patch

import pytest
from factor_lab import factor_lab
from risk_warnings import diagnostics, only, shop, write

from aqven.check import CodeResolver, build_context, check_project
from aqven.check.datasets import check_datasets
from aqven.diagnostics import Severity
from aqven.loader import load_project
from aqven.series.split import split_of, split_salt
from aqven.spec import DatasetId

CODE: Final = "W_DATASET_INPUT_REUSED"
LUMEN: Final = Path(__file__).parents[4] / "examples" / "lumen"
TEXT_INPUT: Final = '    text: "same"\n'
BLOB_INPUT: Final = '''    photo:
      $media: "image/jpeg"
      blob_id: "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      size_bytes: 10
'''
EXPERIMENT: Final = '''apiVersion: "aqven/v1"
kind: "Experiment"
description: "Reuses one identity"
subject:
  flow: "triage"
  cases:
    dataset: "reused"
variants:
- id: "current"
question:
  kind: "look"
'''


def case(name: str, inputs: str, *, extra: str = "") -> str:
    return f'- name: "{name}"\n  inputs:\n{inputs}{extra}'


def dataset(root: Path, dataset_id: str, cases: str, *, flow: bool = False) -> None:
    flow_line = 'flow: "triage"\n' if flow else ""
    source = f'apiVersion: "aqven/v1"\nkind: "Dataset"\n{flow_line}cases:\n{cases}'
    write(root, f"datasets/{dataset_id}.yaml", source)


def write_bytes(root: Path, relative: str, data: bytes) -> None:
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)


def test_opposite_split_duplicate_warns_at_the_holdout_inputs(tmp_path: Path) -> None:
    root = shop(tmp_path)
    dataset(root, "reviews", case("case_a", TEXT_INPUT))
    dataset(root, "review_copy", case("case_b", TEXT_INPUT))

    report = check_project(root)
    warning = only(report, CODE)

    assert warning.severity is Severity.WARNING
    assert (warning.file, warning.path) == ("datasets/reviews.yaml", ("cases", 0, "inputs"))
    assert warning.message == (
        "The same input occurs as `review_copy/case_b` (dev), `reviews/case_a` (holdout); tuning and held-out "
        "evaluation can receive the same stimulus. Consolidate the duplicate identity or review the intentional "
        "overlap."
    )
    assert warning.hint == (
        "consolidate the duplicate identity or review the intentional overlap; renaming a case only rerolls the split"
    )
    assert report.ok


def test_same_case_name_can_collide_across_dataset_ids(tmp_path: Path) -> None:
    root = shop(tmp_path)
    dataset(root, "reviews", case("always_1", TEXT_INPUT))
    dataset(root, "review_copy", case("always_1", TEXT_INPUT))

    warning = only(check_project(root), CODE)

    assert (warning.file, warning.path) == ("datasets/review_copy.yaml", ("cases", 0, "inputs"))


def test_mapping_key_order_and_excluded_fields_do_not_change_the_fingerprint(tmp_path: Path) -> None:
    root = shop(tmp_path)
    first = '    text: "same"\n    number: 1\n'
    second = '    number: 1\n    text: "same"\n'
    extras = '''  tags:
    group: "other"
  context:
    tenant_id: "other"
  node_outputs:
    classify:
      different: true
  metadata:
    owner: "other"
  expected_output:
    different: true
'''
    dataset(root, "reviews", case("case_a", first, extra="  tags:\n    group: \"original\"\n"))
    dataset(root, "review_copy", case("case_b", second, extra=extras))

    assert only(check_project(root), CODE)


def test_n_way_group_emits_one_sorted_diagnostic(tmp_path: Path) -> None:
    root = shop(tmp_path)
    dataset(root, "reviews", case("case_a", TEXT_INPUT))
    dataset(root, "reviews_b", case("case_c", TEXT_INPUT))
    dataset(root, "review_copy", case("case_b", TEXT_INPUT))

    report = check_project(root)
    warning = only(report, CODE)

    assert warning.message.index("`review_copy/case_b`") < warning.message.index("`reviews/case_a`")
    assert warning.message.index("`reviews/case_a`") < warning.message.index("`reviews_b/case_c`")
    assert (warning.file, warning.path) == ("datasets/reviews.yaml", ("cases", 0, "inputs"))


def test_same_split_duplicates_and_different_inputs_do_not_warn(tmp_path: Path) -> None:
    root = shop(tmp_path)
    dataset(root, "reviews", case("case_a", TEXT_INPUT))
    dataset(root, "reviews_a", case("case_a", TEXT_INPUT))
    dataset(root, "review_copy", case("case_b", '    text: "different"\n'))
    dataset(root, "review_copy_b", case("case_b", '    items:\n    - "a"\n    - "b"\n'))
    dataset(root, "review_copy_c", case("case_b", '    items:\n    - "b"\n    - "a"\n'))

    assert diagnostics(check_project(root), CODE) == []


def test_one_identity_reused_by_experiments_is_not_duplication(tmp_path: Path) -> None:
    root = shop(tmp_path)
    inputs = '''    subject: "Where is my parcel"
    body: "The order did not arrive"
    customer:
      name: "Anna"
      email: null
    photo: null
'''
    dataset(root, "reused", case("late_parcel", inputs), flow=True)
    write(root, "experiments/first/experiment.yaml", EXPERIMENT)
    write(root, "experiments/second/experiment.yaml", EXPERIMENT)

    assert diagnostics(check_project(root), CODE) == []


def test_unresolved_media_excludes_the_case_from_reuse_analysis(tmp_path: Path) -> None:
    root = shop(tmp_path)
    missing = '''    photo:
      $media: "image/jpeg"
      file: "missing.jpg"
'''
    dataset(root, "reviews", case("case_a", missing))
    dataset(root, "review_copy", case("case_b", missing))

    report = check_project(root)

    assert diagnostics(report, CODE) == []
    assert any(item.code.value == "E_MEDIA_FILE_MISSING" for item in report.diagnostics)


def test_file_identity_uses_media_type_and_effective_path_not_display_name(tmp_path: Path) -> None:
    root = shop(tmp_path)
    write_bytes(root, "samples/photo.jpg", b"same bytes")
    first = '''    photo:
      $media: "image/jpeg"
      file: "@root/samples/photo.jpg"
      name: "first.jpg"
'''
    second = first.replace('name: "first.jpg"', 'name: "second.jpg"')
    dataset(root, "reviews", case("case_a", first))
    dataset(root, "review_copy", case("case_b", second))

    assert only(check_project(root), CODE)


def test_identical_bytes_at_different_paths_and_file_blob_equivalence_are_not_inferred(tmp_path: Path) -> None:
    root = shop(tmp_path)
    write_bytes(root, "samples/first.jpg", b"same bytes")
    write_bytes(root, "samples/second.jpg", b"same bytes")
    first = '''    photo:
      $media: "image/jpeg"
      file: "@root/samples/first.jpg"
'''
    second = first.replace("first.jpg", "second.jpg")
    dataset(root, "reviews", case("case_a", first))
    dataset(root, "review_copy", case("case_b", second))
    dataset(root, "review_blob", case("case_b", BLOB_INPUT))

    assert diagnostics(check_project(root), CODE) == []


def test_blob_identity_ignores_display_name_and_size(tmp_path: Path) -> None:
    root = shop(tmp_path)
    other = BLOB_INPUT.replace("size_bytes: 10", "size_bytes: 999\n      name: \"other.jpg\"")
    dataset(root, "reviews", case("case_a", BLOB_INPUT))
    dataset(root, "review_copy", case("case_b", other))

    assert only(check_project(root), CODE)


def test_reuse_check_does_not_read_media_bytes(tmp_path: Path) -> None:
    root = shop(tmp_path)
    write_bytes(root, "samples/photo.jpg", b"jpeg bytes")
    media = '''    photo:
      $media: "image/jpeg"
      file: "@root/samples/photo.jpg"
'''
    dataset(root, "reviews", case("case_a", media))
    dataset(root, "review_copy", case("case_b", media))
    loaded = load_project(root).project
    assert loaded is not None
    code = CodeResolver(root)
    with code.session():
        context = build_context(loaded, code)
        with patch.object(Path, "read_bytes", side_effect=AssertionError("media bytes were read")):
            found = [item for item in check_datasets(context) if item.code.value == CODE]

    assert len(found) == 1


def test_showcase_and_factor_lab_same_split_controls_remain_clean(tmp_path: Path) -> None:
    showcase_split = split_of(split_salt("lumen"), DatasetId("support_case_csv_review"), "imported_multimodal_case")
    other_split = split_of(split_salt("lumen"), DatasetId("support_case_csv_ui_demo"), "imported_multimodal_case")
    assert showcase_split is other_split
    showcase = diagnostics(check_project(LUMEN), CODE)
    assert [item for item in showcase if "support_case_csv_review/imported_multimodal_case" in item.message] == []

    factor_split = split_of(split_salt("fixture_shop"), DatasetId("triage_cases"), "late_parcel")
    desk_split = split_of(split_salt("fixture_shop"), DatasetId("desk_cases"), "late_parcel")
    assert factor_split is desk_split
    assert diagnostics(check_project(factor_lab(tmp_path)), CODE) == []


@pytest.mark.parametrize("literal", [".nan", ".inf", "-.inf", "9007199254740992"])
def test_noncanonical_numbers_are_excluded_without_aborting_checks(tmp_path: Path, literal: str) -> None:
    root = shop(tmp_path)
    inputs = f"    value: {literal}\n"
    dataset(root, "reviews", case("case_a", inputs))
    dataset(root, "review_copy", case("case_b", inputs))

    report = check_project(root)

    assert report.project is not None
    assert diagnostics(report, CODE) == []


def test_safe_integer_duplicate_still_warns(tmp_path: Path) -> None:
    root = shop(tmp_path)
    inputs = "    value: 9007199254740991\n"
    dataset(root, "reviews", case("case_a", inputs))
    dataset(root, "review_copy", case("case_b", inputs))

    assert only(check_project(root), CODE)
