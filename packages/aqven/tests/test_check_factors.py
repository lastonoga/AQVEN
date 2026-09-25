from dataclasses import dataclass
from pathlib import Path
from typing import Final

import pytest
from factor_lab import (
    AGENTS,
    DESK,
    FAST_CLASSIFY,
    FAST_FLOW,
    PROMPTS,
    REVIEW,
    ROUTE_DIRECT,
    ROUTES,
    SHORT_PROMPT,
    factor_lab,
    replace,
    write,
)

from aqven.check import CheckReport, check_project
from aqven.diagnostics import DiagnosticCode, Severity

EXPERIMENT_FILES: Final = (AGENTS, PROMPTS, ROUTES, DESK)


@dataclass(frozen=True, slots=True)
class Mutation:
    file: str
    old: str
    new: str
    expected: DiagnosticCode
    at: tuple[str, tuple[str | int, ...]]


@pytest.fixture
def lab(tmp_path: Path) -> Path:
    return factor_lab(tmp_path)


def located(report: CheckReport, code: DiagnosticCode) -> list[tuple[str, tuple[str | int, ...]]]:
    return [(item.file, item.path) for item in report.diagnostics if item.code is code]


def test_all_four_factor_kinds_check_clean(lab: Path) -> None:
    report = check_project(lab)

    assert report.diagnostics == ()


MUTATIONS: Final[dict[str, Mutation]] = {
    "factor_missing_with_two_variants": Mutation(
        AGENTS,
        'varies:\n  what: "agent"\n  nodes:\n  - "classify"\n',
        "",
        DiagnosticCode.E_FACTOR_MISSING,
        (AGENTS, ("variants",)),
    ),
    "factor_node_unknown": Mutation(
        ROUTES,
        '  - "route"\n',
        '  - "rout"\n',
        DiagnosticCode.E_FACTOR_NODE_UNKNOWN,
        (ROUTES, ("varies", "nodes", 0)),
    ),
    "prompt_factor_on_a_code_node": Mutation(
        PROMPTS,
        '  nodes:\n  - "classify"\n',
        '  nodes:\n  - "classify"\n  - "summarize"\n',
        DiagnosticCode.E_FACTOR_KIND,
        (PROMPTS, ("varies", "nodes", 1)),
    ),
    "flow_factor_on_an_llm_node": Mutation(
        AGENTS,
        'what: "agent"',
        'what: "flow"',
        DiagnosticCode.E_FACTOR_KIND,
        (AGENTS, ("varies", "nodes", 0)),
    ),
    "variant_outside_the_factor": Mutation(
        AGENTS,
        '    classify: "mini"\n',
        '    classify: "mini"\n    route__confirm: "mini"\n',
        DiagnosticCode.E_VARIANT_OUTSIDE_FACTOR,
        (AGENTS, ("variants", 1, "nodes", "route__confirm")),
    ),
    "alternative_unknown": Mutation(
        ROUTES,
        'route: "route_direct"',
        'route: "route_fast"',
        DiagnosticCode.E_ALTERNATIVE_UNKNOWN,
        (ROUTES, ("variants", 1, "nodes", "route")),
    ),
    "prompt_missing": Mutation(
        PROMPTS,
        'classify: "short"',
        'classify: "long"',
        DiagnosticCode.E_PROMPT_MISSING,
        (PROMPTS, ("variants", 1, "nodes", "classify")),
    ),
    "agent_unknown": Mutation(
        AGENTS,
        'classify: "mini"',
        'classify: "ghost"',
        DiagnosticCode.E_AGENT_UNKNOWN,
        (AGENTS, ("variants", 1, "nodes", "classify")),
    ),
    "flow_unknown": Mutation(
        DESK,
        'sort: "triage_fast"',
        'sort: "triage_slow"',
        DiagnosticCode.E_FLOW_UNKNOWN,
        (DESK, ("variants", 1, "nodes", "sort")),
    ),
    "flow_contract": Mutation(
        FAST_FLOW,
        'input: "TriageTicket"',
        'input: "Customer"',
        DiagnosticCode.E_FACTOR_FLOW_CONTRACT,
        (DESK, ("variants", 1, "nodes", "sort")),
    ),
    "prompt_variable_in_the_variant": Mutation(
        SHORT_PROMPT,
        "{{ ticket.body }}",
        "{{ ticket.body }} {{ mood }}",
        DiagnosticCode.E_PROMPT_VARIABLE_UNDECLARED,
        (PROMPTS, ("variants", 1, "nodes", "classify")),
    ),
    "binding_of_the_alternative": Mutation(
        ROUTE_DIRECT,
        'from: "$classify.out.category"\n  delivery',
        'from: "$classify.out.queue"\n  delivery',
        DiagnosticCode.E_REF_MISSING,
        (ROUTES, ("variants", 1, "nodes", "route")),
    ),
    "child_of_the_alternative": Mutation(
        REVIEW,
        'form: "TriageReview"',
        'form: "Ghost"',
        DiagnosticCode.E_TYPE_UNKNOWN,
        (ROUTES, ("variants", 2, "nodes", "route")),
    ),
    "subject_agent_policy_in_the_variant": Mutation(
        AGENTS,
        'classify: "mini"',
        'classify: "cheap"',
        DiagnosticCode.E_PII_PROVIDER,
        (AGENTS, ("variants", 1, "nodes", "classify")),
    ),
}


@pytest.mark.parametrize("name", list(MUTATIONS), ids=list(MUTATIONS))
def test_factor_problem_is_reported(lab: Path, name: str) -> None:
    mutation = MUTATIONS[name]
    replace(lab, mutation.file, mutation.old, mutation.new)

    report = check_project(lab)

    assert mutation.at in located(report, mutation.expected), report.diagnostics
    assert not report.ok


def test_compile_problem_of_a_variant_names_the_variant_and_the_original_file(lab: Path) -> None:
    replace(lab, SHORT_PROMPT, "{{ ticket.body }}", "{{ ticket.body }} {{ mood }}")

    report = check_project(lab)

    (problem,) = report.diagnostics
    assert (problem.file, problem.path, problem.line) == (PROMPTS, ("variants", 1, "nodes", "classify"), 16)
    assert problem.message == (
        f"variant short: {SHORT_PROMPT}:6: variable mood is not declared in the inference inputs"
    )


def test_a_local_flow_problem_is_reported_once_on_its_own_file(lab: Path) -> None:
    replace(lab, FAST_CLASSIFY, 'agent: "writer"', 'agent: "ghost"')

    report = check_project(lab)

    assert located(report, DiagnosticCode.E_AGENT_UNKNOWN) == [(FAST_CLASSIFY, ("agent",))]


def test_alternative_with_the_id_of_a_subject_node_is_reported_on_the_alternative(lab: Path) -> None:
    taken = "experiments/triage_routes/nodes/summarize.node.yaml"
    write(lab, taken, (lab / ROUTE_DIRECT).read_text(encoding="utf-8"))

    report = check_project(lab)

    assert (taken, ()) in located(report, DiagnosticCode.E_ALTERNATIVE_ID_TAKEN)


def test_local_flow_with_the_id_of_a_project_flow_is_a_duplicate(lab: Path) -> None:
    write(lab, "experiments/desk_flows/flows/triage/flow.yaml", (lab / FAST_FLOW).read_text(encoding="utf-8"))

    report = check_project(lab)

    assert ("experiments/desk_flows/flows/triage/flow.yaml", ()) in located(report, DiagnosticCode.E_ID_DUPLICATE)


def test_two_variants_with_the_same_values_are_a_warning(lab: Path) -> None:
    replace(lab, ROUTES, '    route: "route_review"\n', '    route: "route_direct"\n')

    report = check_project(lab)

    assert {(item.code, item.severity, item.file, item.path) for item in report.diagnostics} == {
        (DiagnosticCode.W_VARIANT_DUPLICATE, Severity.WARNING, ROUTES, ("variants", 2, "nodes")),
        (
            DiagnosticCode.W_ALTERNATIVE_UNUSED,
            Severity.WARNING,
            "experiments/triage_routes/nodes/route_review.node.yaml",
            (),
        ),
        (DiagnosticCode.W_ALTERNATIVE_UNUSED, Severity.WARNING, REVIEW, ()),
    }
    assert report.ok
    assert report.diagnostics[0].message == (
        "experiment triage_routes: variant senior sets the same values as variant direct"
    )


def test_unused_alternative_prompt_and_local_flow_are_warnings(lab: Path) -> None:
    write(lab, "experiments/triage_routes/nodes/route_spare.node.yaml", (lab / ROUTE_DIRECT).read_text("utf-8"))
    write(lab, "experiments/triage_prompts/prompts/spare.md", (lab / SHORT_PROMPT).read_text("utf-8"))
    spare_flow = "experiments/desk_flows/flows/triage_spare/flow.yaml"
    write(lab, spare_flow, (lab / FAST_FLOW).read_text(encoding="utf-8"))
    for node in ("classify", "summarize"):
        source = f"experiments/desk_flows/flows/triage_fast/{node}.node.yaml"
        write(lab, f"experiments/desk_flows/flows/triage_spare/{node}.node.yaml", (lab / source).read_text("utf-8"))

    report = check_project(lab)

    assert sorted(item.file for item in report.diagnostics if item.code is DiagnosticCode.W_ALTERNATIVE_UNUSED) == [
        spare_flow,
        "experiments/triage_prompts/prompts/spare.md",
        "experiments/triage_routes/nodes/route_spare.node.yaml",
    ]


def test_varies_with_one_variant_is_allowed(lab: Path) -> None:
    replace(lab, AGENTS, '- id: "mini"\n  nodes:\n    classify: "mini"\n', "")

    assert check_project(lab).diagnostics == ()


def test_variants_that_all_keep_the_subject_are_an_aa_experiment(lab: Path) -> None:
    replace(lab, AGENTS, 'varies:\n  what: "agent"\n  nodes:\n  - "classify"\n', "")
    replace(lab, AGENTS, '- id: "mini"\n  nodes:\n    classify: "mini"\n', '- id: "again"\n')

    assert check_project(lab).diagnostics == ()


def test_one_variant_with_values_needs_a_factor(lab: Path) -> None:
    replace(lab, AGENTS, 'varies:\n  what: "agent"\n  nodes:\n  - "classify"\n', "")
    replace(lab, AGENTS, '- id: "writer"\n', "")

    report = check_project(lab)

    (problem,) = report.errors
    assert problem.code is DiagnosticCode.E_FACTOR_MISSING
    assert problem.message == (
        "experiment triage_agents: variant mini sets nodes, but the experiment declares no varies"
    )


def test_arms_folder_is_an_orphan_that_points_to_flows(lab: Path) -> None:
    arm = "experiments/desk_flows/arms/triage_old/flow.yaml"
    write(lab, arm, (lab / FAST_FLOW).read_text(encoding="utf-8"))

    report = check_project(lab)

    (problem,) = [item for item in report.diagnostics if item.code is DiagnosticCode.E_ORPHAN_FILE]
    assert problem.file == arm
    assert "experiments/desk_flows/flows/triage_old/" in problem.message
