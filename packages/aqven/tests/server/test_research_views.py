from typing import Final

import pytest
from factor_lab import checked, experiment, factor_lab

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
