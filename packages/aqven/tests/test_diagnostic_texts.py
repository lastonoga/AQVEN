import json
from typing import Final

import pytest

from aqven.diagnostics import (
    DIAGNOSTIC_TEXTS,
    DiagnosticCode,
    Severity,
    diagnostic,
    format_json,
    format_text,
    templated_diagnostic,
)
from aqven_llm.errors import INSTALL_HINT

AGENT_FILE: Final = "agents/classifier.yaml"
VALUES: Final = {
    "model": "cohere:command-r7b",
    "provider": "cohere",
    "extra": "cohere",
    "mode": "native",
    "supported": "tool, prompted",
    "source": "model profile",
    "module": "lumen",
    "folder": "/work/lumen/src/lumen",
}


@pytest.mark.parametrize(
    ("code", "severity"),
    [
        (DiagnosticCode.E_PROVIDER_EXTRA_MISSING, Severity.ERROR),
        (DiagnosticCode.E_PROVIDER_NO_STREAMING, Severity.ERROR),
        (DiagnosticCode.E_OUTPUT_MODE_UNSUPPORTED, Severity.ERROR),
        (DiagnosticCode.W_OUTPUT_MODE_RESOLVED, Severity.WARNING),
        (DiagnosticCode.W_TYPES_SHADOWS_STDLIB, Severity.WARNING),
    ],
)
def test_new_codes_have_severity_message_and_hint(code: DiagnosticCode, severity: Severity) -> None:
    item = templated_diagnostic(code, AGENT_FILE, ("model",), VALUES)

    assert item.severity is severity
    assert item.message and "{" not in item.message
    assert item.hint and "{" not in item.hint
    assert code in DIAGNOSTIC_TEXTS


EXPERIMENT_FILE: Final = "experiments/reply_quality/experiment.yaml"
EXPERIMENT_VALUES: Final = {
    "experiment": "reply_quality",
    "arm": "critic",
    "arms": "revise_only",
    "folder": "experiments/reply_quality",
    "problem": "question names variant gpt, which is not declared under variants",
    "fix": "declare it or name one of: base, mistral",
    "metric": "accuracy",
    "checks": "critique, promises",
    "metrics": "success_rate, cost_usd",
    "check": "critique",
    "target": "critique_planted",
    "name": "late_parcel",
    "first": "0",
    "dataset": "support_case_cases",
    "tags": "lang=en",
    "planned": "80",
    "selected": "12",
    "case": "late_parcel",
    "wanted": "expected_output with the fields category",
}


@pytest.mark.parametrize(
    ("code", "severity"),
    [
        (DiagnosticCode.E_ARM_UNKNOWN, Severity.ERROR),
        (DiagnosticCode.E_RANGE_INVALID, Severity.ERROR),
        (DiagnosticCode.E_VARIANT_INVALID, Severity.ERROR),
        (DiagnosticCode.E_METRIC_UNKNOWN, Severity.ERROR),
        (DiagnosticCode.E_EXPERIMENT_UNKNOWN, Severity.ERROR),
        (DiagnosticCode.E_DATASET_MISMATCH, Severity.ERROR),
        (DiagnosticCode.E_CASE_DUPLICATE, Severity.ERROR),
        (DiagnosticCode.E_CASES_EMPTY, Severity.ERROR),
        (DiagnosticCode.E_EXPECTED_MISSING, Severity.ERROR),
        (DiagnosticCode.W_PLAN_EXCEEDS_CASES, Severity.WARNING),
    ],
)
def test_experiment_codes_have_severity_message_and_hint(code: DiagnosticCode, severity: Severity) -> None:
    item = templated_diagnostic(code, EXPERIMENT_FILE, ("question",), EXPERIMENT_VALUES)

    assert item.severity is severity
    assert item.message and "{" not in item.message
    assert item.hint and "{" not in item.hint


def test_missing_extra_names_the_install_command() -> None:
    item = templated_diagnostic(DiagnosticCode.E_PROVIDER_EXTRA_MISSING, AGENT_FILE, ("model",), VALUES)

    assert item.hint == 'install the extra: uv add "aqven[cohere]"'
    assert item.hint is not None and INSTALL_HINT.format(extra="cohere") in item.hint


def test_text_format_prints_the_hint_under_the_line() -> None:
    item = templated_diagnostic(
        DiagnosticCode.E_OUTPUT_MODE_UNSUPPORTED, AGENT_FILE, ("output", "mode"), VALUES, line=4, column=9
    )

    lines = format_text((item,)).splitlines()

    assert lines[0] == (
        "agents/classifier.yaml:4:9: error E_OUTPUT_MODE_UNSUPPORTED output.mode: "
        "output.mode native is not supported by model cohere:command-r7b"
    )
    assert lines[1] == "  hint: set output.mode to one of: tool, prompted"


def test_json_format_carries_the_hint_and_plain_diagnostics_stay_without_it() -> None:
    hinted = templated_diagnostic(DiagnosticCode.W_OUTPUT_MODE_RESOLVED, AGENT_FILE, ("output", "mode"), VALUES)
    plain = diagnostic(DiagnosticCode.E_CYCLE, "flows/a/flow.yaml", ("order",), "cycle")

    document = json.loads(format_json((hinted, plain)))
    hints = {entry["code"]: entry["hint"] for entry in document["diagnostics"]}

    assert hints == {"W_OUTPUT_MODE_RESOLVED": "set output.mode: native to pin it", "E_CYCLE": None}
    assert format_text((plain,)).splitlines()[0] == "flows/a/flow.yaml: error E_CYCLE R-44 order: cycle"
