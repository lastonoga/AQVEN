from pathlib import Path

from enum_projects import (
    STANDARD_SHOP,
    broken_shop,
    input_only_inline_shop,
    manual_liquid_shop,
    nested_shop,
)

from aqven.check import CheckReport, check_project
from aqven.diagnostics import Diagnostic, DiagnosticCode, Severity
from aqven.testing import copy_project


def warnings(report: CheckReport) -> list[Diagnostic]:
    return [item for item in report.diagnostics if item.code is DiagnosticCode.W_ENUM_DEFINITIONS_MANUAL]


def test_default_and_explicit_auto_emit_no_manual_warning(tmp_path: Path) -> None:
    default = check_project(STANDARD_SHOP)
    explicit = check_project(nested_shop(tmp_path, mode="auto"))

    assert warnings(default) == []
    assert warnings(explicit) == []


def test_manual_warns_once_even_when_prompt_defines_values(tmp_path: Path) -> None:
    report = check_project(manual_liquid_shop(tmp_path))

    [warning] = warnings(report)
    assert report.ok
    assert warning.severity is Severity.WARNING
    assert warning.file == "triage/classify.inference.yaml"
    assert warning.path == ("enum_definitions",)
    assert warning.message == (
        "Inference `classify` disables automatic definitions for output enums "
        "`TriageCategory` (`category`); the prompt is responsible for defining these values."
    )
    assert warning.hint == "include the value definitions in the prompt or restore `enum_definitions: auto`"


def test_manual_nested_warning_lists_all_paths_in_order(tmp_path: Path) -> None:
    report = check_project(nested_shop(tmp_path, mode="manual"))

    [warning] = warnings(report)
    assert report.ok
    assert warning.file == "agents/writer/lookup.inference.yaml"
    assert warning.path == ("enum_definitions",)
    assert warning.message == (
        "Inference `lookup` disables automatic definitions for output enums "
        "`Mood` (`assessment.score.criterion, assessment.tie_break, direct, scores[*].criterion`), "
        "`Priority` (`assessment.priority, assessment.score.priorities[*], scores[*].priorities[*]`); "
        "the prompt is responsible for defining these values."
    )


def test_manual_input_only_and_inline_output_enums_emit_no_warning(tmp_path: Path) -> None:
    report = check_project(input_only_inline_shop(tmp_path))

    assert warnings(report) == []
    assert report.ok


def test_manual_broken_output_type_keeps_existing_error_without_warning(tmp_path: Path) -> None:
    report = check_project(broken_shop(tmp_path))

    assert warnings(report) == []
    assert not report.ok
    assert any(item.code is DiagnosticCode.E_TYPE_UNKNOWN for item in report.errors)


def test_same_enum_in_input_and_output_is_reported_once(tmp_path: Path) -> None:
    root = copy_project(STANDARD_SHOP, tmp_path)
    inference = root / "flows/intake/nodes/reply/reply.inference.yaml"
    inference.write_text(
        inference.read_text(encoding="utf-8").replace("variants:\n", 'enum_definitions: "manual"\nvariants:\n'),
        encoding="utf-8",
    )

    [warning] = warnings(check_project(root))

    assert warning.message == (
        "Inference `reply` disables automatic definitions for output enums "
        "`Mood` (`mood`); the prompt is responsible for defining these values."
    )
