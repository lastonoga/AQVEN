from pathlib import Path
from typing import Final

import pytest
from fixture_warnings import TRIAGE_NESTED_MEDIA
from risk_warnings import shop

from aqven.check import RULES, CodeResolver, build_context
from aqven.check.capabilities import check_capabilities
from aqven.check.flow_risks import check_flow_risks
from aqven.check.flows import check_flows
from aqven.check.identifier_types import check_identifier_types
from aqven.check.inference_risks import check_inference_risks
from aqven.check.inferences import check_inferences
from aqven.check.types import check_types
from aqven.check.usage_risks import check_usage_risks
from aqven.diagnostics import SEVERITY_BY_CODE, DiagnosticCode, Severity
from aqven.loader import load_project

RISK_CODES: Final = (
    "W_TEXT_IDENTIFIER_TYPE",
    "W_ID_ALLOWED_SET_MISSING",
    "W_ID_COVERAGE_UNCHECKED",
    "W_ID_COVERAGE_CAP",
    "W_NESTED_MEDIA_NOT_ATTACHED",
    "W_MAP_ITEM_FAILURE_HIDDEN",
    "W_CHECK_RETRY_UNAVAILABLE",
    "W_DATASET_INPUT_REUSED",
)


@pytest.mark.parametrize("name", RISK_CODES)
def test_risk_code_is_a_warning(name: str) -> None:
    code = DiagnosticCode(name)

    assert code.value == name
    assert SEVERITY_BY_CODE[code] is Severity.WARNING


def test_risk_rule_skeletons_are_registered_in_their_planned_positions() -> None:
    assert RULES.index(check_identifier_types) == RULES.index(check_types) + 1
    assert RULES.index(check_inference_risks) == RULES.index(check_inferences) + 1
    assert RULES.index(check_usage_risks) == RULES.index(check_capabilities) + 1
    assert RULES.index(check_flow_risks) == RULES.index(check_flows) + 1


def test_risk_rules_emit_the_expected_fixture_nested_media_warning(tmp_path: Path) -> None:
    root = shop(tmp_path)
    loaded = load_project(root).project
    assert loaded is not None
    code = CodeResolver(root)
    with code.session():
        context = build_context(loaded, code)
        found = [
            item
            for rule in (check_identifier_types, check_inference_risks, check_flow_risks, check_usage_risks)
            for item in rule(context)
        ]

    assert found == [TRIAGE_NESTED_MEDIA.model_copy(update={"line": None, "column": None})]
