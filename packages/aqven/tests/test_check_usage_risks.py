from pathlib import Path
from typing import Final

import pytest
from risk_warnings import diagnostics, only, replace, shop, write
from test_check_experiments import JUDGE_INFERENCE, PROJECT_FILES, TRIAGE_EXPERIMENT

from aqven.check import check_project
from aqven.codegen import generate_types
from aqven.diagnostics import Severity

CODE: Final = "W_CHECK_RETRY_UNAVAILABLE"
RETRY_CHECK: Final = '''checks:
- use: "not_empty"
  with:
    field: "$out.rationale"
  on_fail: "retry"
'''
SUBAGENT: Final = '''subagents:
- name: "research"
  description: "Checks the same inference"
  agent: "cheap"
  inference: "classify"
'''
ZERO_AGENT: Final = '''apiVersion: "aqven/v1"
kind: "Agent"
description: "No output retries"
model: "openai:gpt-5.4-mini"
output:
  retries: 0
'''


def zero_retries(root: Path, agent: str) -> None:
    source = (root / agent).read_text(encoding="utf-8")
    if "output:\n" in source:
        replace(root, agent, "output:\n", "output:\n  retries: 0\n")
    else:
        replace(root, agent, "settings:\n", "output:\n  retries: 0\nsettings:\n")


def append(root: Path, relative: str, text: str) -> None:
    target = root / relative
    target.write_text(target.read_text(encoding="utf-8") + text, encoding="utf-8")


def lab(tmp_path: Path) -> Path:
    root = shop(tmp_path)
    for relative, text in PROJECT_FILES.items():
        write(root, relative, text)
    generate_types(root)
    return root


def test_llm_node_retry_check_with_zero_output_retries_warns(tmp_path: Path) -> None:
    root = shop(tmp_path)
    zero_retries(root, "shared/writer.yaml")

    report = check_project(root)
    warning = only(report, CODE)

    assert warning.severity is Severity.WARNING
    assert (warning.file, warning.path) == ("triage/classify.node.yaml", ("agent",))
    assert warning.message == (
        "Inference `classify` has retry checks `not_empty`, but agent `writer` has `output.retries: 0`; "
        "a rejected output cannot start another model attempt."
    )
    assert warning.hint == "raise output.retries, or deliberately choose a non-retry failure policy"
    assert report.ok


def test_retry_check_names_are_sorted_and_response_fallback_does_not_change_the_rule(tmp_path: Path) -> None:
    root = shop(tmp_path)
    zero_retries(root, "shared/writer.yaml")
    replace(
        root,
        "shared/writer.yaml",
        "output:\n",
        'fallback_models:\n- "openai:gpt-5.4-mini"\noutput:\n  on_error: "fallback"\n',
    )
    append(
        root,
        "triage/classify.inference.yaml",
        '- use: "regex"\n  with:\n    field: "$out.rationale"\n    pattern: "ticket"\n  on_fail: "retry"\n',
    )

    warning = only(check_project(root), CODE)

    assert "retry checks `not_empty`, `regex`" in warning.message


def test_subagent_usage_is_evaluated_independently(tmp_path: Path) -> None:
    root = shop(tmp_path)
    replace(root, "shared/writer.yaml", "settings:\n", f"{SUBAGENT}settings:\n")
    zero_retries(root, "shared/cheap.yaml")

    warning = only(check_project(root), CODE)

    assert (warning.file, warning.path) == ("shared/writer.yaml", ("subagents", 0, "agent"))
    assert "agent `cheap` has `output.retries: 0`" in warning.message


def test_shared_inference_warns_once_per_agent_usage(tmp_path: Path) -> None:
    root = shop(tmp_path)
    replace(root, "shared/writer.yaml", "settings:\n", f"{SUBAGENT}settings:\n")
    zero_retries(root, "shared/writer.yaml")
    zero_retries(root, "shared/cheap.yaml")

    found = diagnostics(check_project(root), CODE)

    assert [(item.file, item.path) for item in found] == [
        ("shared/writer.yaml", ("subagents", 0, "agent")),
        ("triage/classify.node.yaml", ("agent",)),
    ]


def test_llm_judge_usage_warns_at_the_judge_agent_reference(tmp_path: Path) -> None:
    root = lab(tmp_path)
    write(root, "shared/zero.yaml", ZERO_AGENT)
    replace(root, TRIAGE_EXPERIMENT, '  agent: "writer"\n  validated_by', '  agent: "zero"\n  validated_by')
    append(root, JUDGE_INFERENCE, RETRY_CHECK)

    warning = only(check_project(root), CODE)

    assert (warning.file, warning.path) == (TRIAGE_EXPERIMENT, ("checks", 2, "agent"))
    assert "Inference `triage_judge`" in warning.message
    assert "agent `zero` has `output.retries: 0`" in warning.message


@pytest.mark.parametrize("on_fail", ["fail", "flag"])
def test_non_retry_policies_do_not_warn(tmp_path: Path, on_fail: str) -> None:
    root = shop(tmp_path)
    zero_retries(root, "shared/writer.yaml")
    replace(root, "triage/classify.inference.yaml", 'on_fail: "retry"', f'on_fail: "{on_fail}"')

    assert diagnostics(check_project(root), CODE) == []


def test_retries_at_least_one_and_unresolved_usages_do_not_warn(tmp_path: Path) -> None:
    root = shop(tmp_path)
    assert diagnostics(check_project(root), CODE) == []

    zero_retries(root, "shared/writer.yaml")
    replace(root, "triage/classify.node.yaml", 'agent: "writer"', 'agent: "ghost"')
    assert diagnostics(check_project(root), CODE) == []


def test_local_flow_and_variant_checks_are_deterministic_and_deduplicated(tmp_path: Path) -> None:
    root = lab(tmp_path)
    zero_retries(root, "shared/writer.yaml")
    append(root, JUDGE_INFERENCE, RETRY_CHECK)

    first = check_project(root)
    second = check_project(root)
    found = diagnostics(first, CODE)

    assert first.diagnostics == second.diagnostics
    assert {(item.file, item.path) for item in found} == {
        ("experiments/judge_check/flows/judge/nodes/judge.node.yaml", ("agent",)),
        (TRIAGE_EXPERIMENT, ("checks", 2, "agent")),
        ("triage/classify.node.yaml", ("agent",)),
    }
    assert len({(item.file, item.path, item.message) for item in found}) == len(found) == 3
