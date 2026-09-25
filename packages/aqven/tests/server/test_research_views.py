from typing import Final

import pytest
from factor_lab import REVIEW, ROUTE_DIRECT, ROUTE_REVIEW, checked, experiment, factor_lab

from aqven.loader import LoadedProject
from aqven.series.views import ExperimentDetailView
from aqven.server.views.research import EMPTY_LEDGER, experiment_detail

WRITER: Final = {"agent_id": "writer", "model": "openai:gpt-5.4-mini"}


@pytest.fixture(scope="module")
def lab(tmp_path_factory: pytest.TempPathFactory) -> LoadedProject:
    _, project = checked(factor_lab(tmp_path_factory.mktemp("lab")))
    return project


def detail(project: LoadedProject, experiment_id: str) -> ExperimentDetailView:
    return experiment_detail(project, experiment(project, experiment_id), EMPTY_LEDGER)


def changes(view: ExperimentDetailView) -> dict[str, list[tuple[str, str, str]]]:
    return {
        variant.variant_id: [(change.node_id, change.what.value, change.value) for change in variant.changes]
        for variant in view.variant_details
    }


def assignments(view: ExperimentDetailView) -> dict[str, list[tuple[str, str, bool]]]:
    return {
        variant.variant_id: [(item.node_id, item.agent.agent_id, item.overridden) for item in variant.assignments]
        for variant in view.variant_details
    }


def test_an_agent_experiment_marks_the_node_its_factor_sets(lab: LoadedProject) -> None:
    view = detail(lab, "triage_agents")

    assert view.varies is not None
    assert (view.varies.what.value, view.varies.nodes) == ("agent", ("classify",))
    assert changes(view) == {"writer": [], "mini": [("classify", "agent", "mini")]}
    assert assignments(view) == {"writer": [("classify", "writer", False)], "mini": [("classify", "mini", True)]}


def test_a_prompt_experiment_lists_its_prompts_and_keeps_the_agent(lab: LoadedProject) -> None:
    view = detail(lab, "triage_prompts")

    assert changes(view) == {"as_is": [], "short": [("classify", "prompt", "short")]}
    assert assignments(view) == {"as_is": [("classify", "writer", False)], "short": [("classify", "writer", False)]}
    assert [(prompt.name, prompt.file) for prompt in view.prompts] == [
        ("short", "experiments/triage_prompts/prompts/short.md")
    ]
    assert (view.flows, view.alternatives) == ((), ())


def test_a_use_experiment_lists_its_alternatives_with_their_kind(lab: LoadedProject) -> None:
    view = detail(lab, "triage_routes")

    assert changes(view) == {
        "operator": [],
        "direct": [("route", "use", "route_direct")],
        "senior": [("route", "use", "route_review")],
    }
    assert [(item.alternative_id, item.kind.value, item.file) for item in view.alternatives] == [
        ("review", "human", "experiments/triage_routes/nodes/review.node.yaml"),
        ("route_direct", "switch", "experiments/triage_routes/nodes/route_direct.node.yaml"),
        ("route_review", "switch", "experiments/triage_routes/nodes/route_review.node.yaml"),
    ]
    assert assignments(view)["senior"] == [("classify", "writer", False)]


def test_a_flow_experiment_lists_its_local_flows_and_names_the_project_flow(lab: LoadedProject) -> None:
    view = detail(lab, "desk_flows")

    assert changes(view) == {"full": [], "fast": [("sort", "flow", "triage_fast")]}
    assert [(flow.flow_id, flow.file) for flow in view.flows] == [
        ("triage_fast", "experiments/desk_flows/flows/triage_fast/flow.yaml")
    ]
    assert [(step.node_id, step.kind.value) for step in view.flows[0].steps] == [
        ("classify", "llm"),
        ("summarize", "code"),
    ]
    assert view.flows[0].steps[0].agent is not None
    assert view.flows[0].steps[0].agent.model_dump() == WRITER
    assert (view.subject.flow_id, view.subject.local_flow, view.flow_id) == ("desk", False, "desk")


SUMMARY_RULES: Final = """apiVersion: "aqven/v1"
kind: "Experiment"
description: "A one-line summary reads as well as the full one"
subject:
  flow: "triage"
varies:
  what: "use"
  nodes:
  - "summarize"
cases:
  dataset: "triage_cases"
variants:
- id: "full"
- id: "one_line"
  nodes:
    summarize: "summarize_line"
question:
  kind: "look"
"""

SUMMARIZE_LINE: Final = """apiVersion: "aqven/v1"
kind: "Node"
node: "code"
description: "Summarizes the ticket in one line"
run: "summarize_line"
in:
- name: "ticket"
  type: "TriageTicket"
  description: "The ticket"
  from: "$input"
out:
- name: "summary"
  type: "Text"
  description: "Short summary"
  maxLength: 200
"""

SUMMARIZE_LINE_CODE: Final = """def summarize_line(ticket: object) -> dict[str, str]:
    return {"summary": "one line"}
"""

RULES_FOLDER: Final = "experiments/summary_rules"


@pytest.fixture(scope="module")
def code_lab(tmp_path_factory: pytest.TempPathFactory) -> LoadedProject:
    root = factor_lab(tmp_path_factory.mktemp("code_lab"))
    files = {
        f"{RULES_FOLDER}/experiment.yaml": SUMMARY_RULES,
        f"{RULES_FOLDER}/nodes/summarize_line.node.yaml": SUMMARIZE_LINE,
        f"{RULES_FOLDER}/nodes/summarize_line.py": SUMMARIZE_LINE_CODE,
    }
    for relative, text in files.items():
        (root / relative).parent.mkdir(parents=True, exist_ok=True)
        (root / relative).write_text(text, encoding="utf-8")
    _, project = checked(root)
    return project


def slots(view: ExperimentDetailView) -> list[tuple[str, str, str | None, list[tuple[str, str]]]]:
    return [
        (slot.node_id, slot.kind.value, slot.written, [(file.role, file.path) for file in slot.files])
        for slot in view.slots
    ]


def test_an_agent_experiment_names_the_agent_as_written_and_describes_every_agent_it_compares(
    lab: LoadedProject,
) -> None:
    view = detail(lab, "triage_agents")

    assert [(slot.node_id, slot.written) for slot in view.slots] == [("classify", "writer")]
    assert [(agent.agent_id, agent.file, agent.spec.model) for agent in view.agents] == [
        ("writer", "shared/writer.yaml", "openai:gpt-5.4-mini"),
        ("mini", "shared/mini.yaml", "openai:gpt-5.4-mini"),
    ]
    assert view.agents[1].spec.settings is not None
    assert view.agents[1].spec.settings.temperature == 0.0


def test_a_prompt_experiment_names_the_inference_and_the_prompt_file_as_written(lab: LoadedProject) -> None:
    view = detail(lab, "triage_prompts")

    assert slots(view) == [
        (
            "classify",
            "llm",
            "classify",
            [
                ("node", "triage/classify.node.yaml"),
                ("inference", "triage/classify.inference.yaml"),
                ("prompt", "triage/classify.prompt.md"),
            ],
        )
    ]
    assert view.agents == ()


def test_a_use_experiment_names_the_node_as_written_and_the_files_of_each_alternative(lab: LoadedProject) -> None:
    view = detail(lab, "triage_routes")

    assert slots(view) == [("route", "switch", "route", [("node", "triage/route.yaml")])]
    assert [[(file.role, file.path) for file in item.files] for item in view.alternatives] == [
        [("node", REVIEW)],
        [("node", ROUTE_DIRECT)],
        [("node", ROUTE_REVIEW)],
    ]


def test_a_flow_experiment_names_the_flow_the_slot_calls_as_written(lab: LoadedProject) -> None:
    view = detail(lab, "desk_flows")

    assert slots(view) == [("sort", "call", "triage", [("node", "desk/sort.node.yaml")])]


def test_code_files_resolve_from_a_module_reference_and_from_a_file_next_to_the_node(code_lab: LoadedProject) -> None:
    view = detail(code_lab, "summary_rules")

    assert slots(view) == [
        ("summarize", "code", "summarize", [("node", "triage/summarize.yaml"), ("code", "triage/code.py")])
    ]
    [alternative] = view.alternatives
    assert [(file.role, file.path) for file in alternative.files] == [
        ("node", f"{RULES_FOLDER}/nodes/summarize_line.node.yaml"),
        ("code", f"{RULES_FOLDER}/nodes/summarize_line.py"),
    ]
