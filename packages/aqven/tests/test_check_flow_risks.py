from pathlib import Path
from typing import Final

import pytest
from risk_warnings import diagnostics, only, replace, shop
from test_check import with_batch  # type: ignore

from aqven.check import check_project
from aqven.codegen import generate_types

CODE: Final = "W_MAP_ITEM_FAILURE_HIDDEN"
BATCH_MAP_FILE: Final = "batch/each.yaml"
MAP_FAILURES: Final = '''- name: "failures"
  type: "MapItemError[]"
  description: "Failed tickets"
  maxItems: 20
  from: "$failed"
'''
FLOW_FAILURES: Final = '''- name: "failures"
  from: "$each.out.failures"
'''
TYPE_FAILURES: Final = '''- name: "failures"
  type: "MapItemError[]"
  description: "Failed tickets"
  maxItems: 20
'''


def hide_failures(root: Path) -> None:
    replace(root, BATCH_MAP_FILE, MAP_FAILURES, "")
    replace(root, "batch/flow.yaml", FLOW_FAILURES, "")
    replace(root, "batch/types/triage_batch_result.yaml", TYPE_FAILURES, "")
    generate_types(root)


@pytest.mark.parametrize("policy", ["skip", "default"])
def test_skip_and_default_without_failed_output_warn(tmp_path: Path, policy: str) -> None:
    root = shop(tmp_path)
    with_batch(root)
    hide_failures(root)
    if policy == "default":
        replace(
            root,
            BATCH_MAP_FILE,
            '  use: "skip"\n',
            '  use: "default"\n  with:\n    value:\n      summary: "—"\n',
        )

    report = check_project(root)
    warning = only(report, CODE)

    assert (warning.file, warning.path) == (BATCH_MAP_FILE, ("on_item_error", "use"))
    if policy == "skip":
        assert warning.message == (
            "Map `each` recovers item failures with `skip`, but no output field exposes `$failed`; failed items can "
            "disappear from the node output. Expose failures or verify that downstream code reconstructs coverage "
            "from `$ok` and the input."
        )
    else:
        assert warning.message == (
            "Map `each` replaces failed items with defaults, but no output field exposes `$failed`; failure records "
            "are absent from the node output even though defaulted items count as successful. Expose failures if "
            "downstream must distinguish them."
        )
    assert warning.hint == (
        "expose MapItemError[] from $failed with an appropriate bound when the node contract "
        "requires failure visibility"
    )
    assert report.ok


def test_direct_failed_output_suppresses_the_warning(tmp_path: Path) -> None:
    root = shop(tmp_path)
    with_batch(root)

    assert diagnostics(check_project(root), CODE) == []


def test_projected_failed_output_suppresses_the_warning(tmp_path: Path) -> None:
    root = shop(tmp_path)
    with_batch(root)
    replace(root, BATCH_MAP_FILE, 'from: "$failed"', 'from: "$failed[*].message"')
    replace(root, BATCH_MAP_FILE, 'type: "MapItemError[]"', 'type: "Text[]"\n  maxLength: 200')
    replace(root, "batch/types/triage_batch_result.yaml", 'type: "MapItemError[]"', 'type: "Text[]"\n  maxLength: 200')
    generate_types(root)

    assert diagnostics(check_project(root), CODE) == []


@pytest.mark.parametrize("policy", ["fail", "run"])
def test_fail_and_custom_policy_are_outside_the_rule(tmp_path: Path, policy: str) -> None:
    root = shop(tmp_path)
    with_batch(root)
    hide_failures(root)
    replacement = '  use: "fail"\n' if policy == "fail" else '  run: "fixture_shop.triage.code:first_summary"\n'
    replace(root, BATCH_MAP_FILE, '  use: "skip"\n', replacement)

    assert diagnostics(check_project(root), CODE) == []


def test_broken_output_reference_does_not_cascade_into_a_risk_warning(tmp_path: Path) -> None:
    root = shop(tmp_path)
    with_batch(root)
    hide_failures(root)
    replace(root, BATCH_MAP_FILE, "$ok[*].summary", "$missing.out.summary")

    assert diagnostics(check_project(root), CODE) == []
