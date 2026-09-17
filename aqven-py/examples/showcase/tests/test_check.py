from collections.abc import Mapping
from pathlib import Path
from typing import Final

import pytest

from aqven.check import CheckReport, check_project
from aqven.cli import main
from aqven.testing import copy_project

type Breakage = tuple[str, str, str]

TRIAGE: Final = "flows/support_case/nodes/triage/triage.node.yaml"
REVISE: Final = "flows/support_case/nodes/polish/revise"
JUDGES: Final = "flows/judge_panel/nodes/judges"
RESEARCH_POLICY: Final = "agents/resolver/research_policy.inference.yaml"
SHADOWING_PROMPT: Final[Breakage] = (RESEARCH_POLICY, "out:\n", 'prompt: "@root/fragments/untrusted_input.md"\nout:\n')
UNBOUND_MESSAGE: Final[Breakage] = (TRIAGE, '- name: "message"\n  from: "$prepare.out.message"\n', "")
BREAKAGES: Final[Mapping[str, Breakage]] = {
    "E_INPUT_UNBOUND": UNBOUND_MESSAGE,
    "E_PII_PROVIDER": ("aqven.yaml", "allows_pii: true", "allows_pii: false"),
    "E_MODALITY_UNSUPPORTED": (TRIAGE, 'agent: "gemini"', 'agent: "mistral"'),
    "E_SOURCE_CONFLICT": (TRIAGE, 'agent: "gemini"', 'inference: "triage"\nagent: "gemini"'),
    "E_STRICT_UNSUPPORTED": ("agents/llama.yaml", "strict: false", "strict: true"),
    "E_TEXT_OUTPUT": ("agents/gpt.yaml", "output:\n", 'output:\n  mode: "text"\n'),
    "E_PROMPT_VARIABLE_UNDECLARED": (
        f"{REVISE}.prompt.md",
        "{{ output_format }}",
        "{{ output_format }}{{ undeclared }}",
    ),
    "E_CONTRACT_VIOLATION": (f"{JUDGES}/qwen.node.yaml", 'agent: "qwen"', 'agent: "gpt"'),
    "E_CHECK_PARAMS": (f"{REVISE}.inference.yaml", 'field: "$out.reply.text"', 'field: "$out.reply.body"'),
    "E_APPROVAL_TOOL": ("agents/resolver/resolver.yaml", '  - "issue_store_credit"', '  - "refund_order"'),
    "E_VARIANT_MISSING": (f"{REVISE}.inference.yaml", 'default: "unknown"', 'default: "generic"'),
    "E_VARIANT_NOT_EXHAUSTIVE": (f"{REVISE}.inference.yaml", '    default: "unknown"\n', ""),
    "E_POLICY_UNKNOWN": ("flows/support_case/nodes/drafts/drafts.node.yaml", 'use: "quorum"', 'use: "majority"'),
    "E_POLICY_PARAMS": (f"{JUDGES}/judges.node.yaml", "min_agree: 2", "min_agree: 5"),
    "E_CODE_NOT_FOUND": ("flows/support_case/nodes/tally/tally.node.yaml", 'run: "tally"', 'run: "count_votes"'),
    "E_CODE_REF_UNRESOLVED": (
        "evals/support_case/reply_quality.yaml",
        'code.support_case:promises_match_resolution"',
        'code.support_case:promises_match_reply"',
    ),
    "E_ALIAS_UNKNOWN": ("tools/search_kb.yaml", 'run: "@root.', 'run: "@lumen.'),
    "E_TYPE_CONSTRAINT_MISMATCH": (
        "flows/support_case/nodes/case_form/case_form.py",
        'type="DeliveryDamage",',
        'type="DeliveryDamage", enum=["crushed_box", "broken_item", "missing_item"],',
    ),
    "E_UNKNOWN_KEY": (
        "evals/support_case/reply_cases.yaml",
        'kind: "Dataset"\n',
        'kind: "Dataset"\nname: "reply_cases"\n',
    ),
}

PENDING_COMMANDS: Final = (
    ("plan",),
    ("build",),
    ("eval", "--eval", "reply_quality"),
    ("optimize", "--eval", "reply_quality"),
)


def broken_copy(root: Path, destination: Path, relative: str, old: str, new: str) -> Path:
    copy = copy_project(root, destination)
    target = copy / relative
    source = target.read_text(encoding="utf-8")
    assert old in source
    target.write_text(source.replace(old, new, 1), encoding="utf-8")
    return copy


def test_example_is_clean(aqven_check_report: CheckReport) -> None:
    assert aqven_check_report.errors == ()
    assert aqven_check_report.warnings == ()


@pytest.mark.parametrize("code", BREAKAGES)
def test_broken_copy_reports_code(aqven_project_root: Path, tmp_path: Path, code: str) -> None:
    report = check_project(broken_copy(aqven_project_root, tmp_path, *BREAKAGES[code]))
    assert code in {item.code.value for item in report.errors}


def test_prompt_beside_explicit_path_is_shadowed(aqven_project_root: Path, tmp_path: Path) -> None:
    copy = broken_copy(aqven_project_root, tmp_path, *SHADOWING_PROMPT)
    assert "W_PROMPT_SHADOWED" in {item.code.value for item in check_project(copy).warnings}


def test_cli_check_exit_codes(aqven_project_root: Path, tmp_path: Path) -> None:
    broken = broken_copy(aqven_project_root, tmp_path, *UNBOUND_MESSAGE)
    assert main(["check", str(aqven_project_root)]) == 0
    assert main(["check", str(broken)]) == 1


@pytest.mark.parametrize("command", PENDING_COMMANDS, ids=[command[0] for command in PENDING_COMMANDS])
def test_cli_pending_commands(aqven_project_root: Path, command: tuple[str, ...]) -> None:
    name, *options = command
    assert main([name, str(aqven_project_root), *options]) == 2
