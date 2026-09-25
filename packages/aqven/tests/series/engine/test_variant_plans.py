import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Final

import pytest
from series_fixture import TERSE_MARKER, write_project

from aqven.check import check_project
from aqven.diagnostics import DiagnosticCode, diagnostic
from aqven.engine.loading import CodeLoader
from aqven.factors import AssemblyFailure, VariantAssembly
from aqven.ir import CompiledCallNode, CompiledCodeNode, CompiledLlmNode, CompiledProject, TemplatePrompt
from aqven.series.model import VariantChange, VariantRole
from aqven.series.planner import PlannedSeries, PlanningState, SeriesPlanner, plan_request
from aqven.series.plans import VariantBuild, VariantDraft, VariantNotBuilt, compiled_series
from aqven.series.views import SeriesStartRequest
from aqven.server.workspace import take_snapshot
from aqven.spec import ExperimentId, FactorKind, FlowId, InferenceId, NodeId, VariantId, VariantSpec

TRIAGE: Final = FlowId("triage")
DESK: Final = FlowId("desk")
TERSE_FILE: Final = "experiments/triage_prompts/prompts/terse.md"
SHOUT_FILE: Final = "experiments/triage_use/nodes/shout.node.yaml"
QUICK_FILE: Final = "experiments/desk_flows/flows/quick/flow.yaml"


@pytest.fixture
def project_root(tmp_path: Path) -> Path:
    return write_project(tmp_path)


def planned(root: Path, experiment_id: str) -> PlannedSeries:
    planner = SeriesPlanner(types=CodeLoader(root), engine_version="test", holdout_share=0.5)
    state = PlanningState(check_project(root), take_snapshot(root))
    request = SeriesStartRequest(experiment_id=ExperimentId(experiment_id))
    return asyncio.run(planner.plan(plan_request(request), state, None))


def by_id(series: PlannedSeries) -> dict[str, VariantBuild]:
    return {build.record.variant_id: build for build in series.variants}


def node_of[N](plan: CompiledProject, flow_id: FlowId, node_id: str, kind: type[N]) -> N:
    node = plan.flow(flow_id).nodes[NodeId(node_id)]
    assert isinstance(node, kind)
    return node


def template_of(plan: CompiledProject, inference_id: InferenceId) -> str:
    prompt = plan.inference(inference_id).prompt
    assert isinstance(prompt, TemplatePrompt)
    return prompt.template


def hashes(series: PlannedSeries) -> dict[str, str]:
    return {build.record.variant_id: build.record.flow_hash for build in series.variants}


def edit(root: Path, relative: str, old: str, new: str) -> None:
    target = root / relative
    text = target.read_text(encoding="utf-8")
    assert text.count(old) == 1
    target.write_text(text.replace(old, new), encoding="utf-8")


def test_a_prompt_variant_gives_the_node_its_own_inference_with_the_experiment_prompt(project_root: Path) -> None:
    variants = by_id(planned(project_root, "triage_prompts"))
    written, terse = variants["as_written"], variants["terse"]

    written_node = node_of(written.plan, TRIAGE, "classify", CompiledLlmNode)
    terse_node = node_of(terse.plan, TRIAGE, "classify", CompiledLlmNode)

    assert written_node.inference == "classify"
    assert terse_node.inference.startswith("classify_p")
    assert TERSE_MARKER in template_of(terse.plan, terse_node.inference)
    assert TERSE_MARKER not in template_of(written.plan, written_node.inference)
    origin = written.plan.inference(written_node.inference)
    assert terse.plan.inference(terse_node.inference).output_schema == origin.output_schema
    assert terse.plan.inference(terse_node.inference).origin == "classify"
    assert terse.record.changes == (VariantChange(node_id=NodeId("classify"), what=FactorKind.PROMPT, value="terse"),)
    assert [(item.node_id, item.agent_id, item.overridden) for item in terse.record.assignments] == [
        ("classify", "writer", False)
    ]
    assert written.record.flow_hash != terse.record.flow_hash


def test_a_use_variant_runs_the_alternative_under_the_slot_id(project_root: Path) -> None:
    variants = by_id(planned(project_root, "triage_use"))

    written = node_of(variants["as_written"].plan, TRIAGE, "tidy", CompiledCodeNode)
    shout = node_of(variants["shout"].plan, TRIAGE, "tidy", CompiledCodeNode)

    assert written.run.endswith(":tidy")
    assert shout.run.endswith(":shout")
    assert "triage_use" in shout.run
    assert variants["shout"].record.changes == (
        VariantChange(node_id=NodeId("tidy"), what=FactorKind.USE, value="shout"),
    )
    assert variants["shout"].record.flow_id == TRIAGE


def test_a_flow_variant_calls_the_local_flow_and_compiles_only_the_closure_of_the_subject(project_root: Path) -> None:
    series = planned(project_root, "desk_flows")
    variants = by_id(series)
    full, quick = variants["full"], variants["quick"]

    assert node_of(full.plan, DESK, "sort", CompiledCallNode).flow == "triage"
    assert node_of(quick.plan, DESK, "sort", CompiledCallNode).flow == "quick"
    assert set(full.plan.flows) == {"desk", "triage"}
    assert set(quick.plan.flows) == {"desk", "quick"}
    assert quick.record.changes == (VariantChange(node_id=NodeId("sort"), what=FactorKind.FLOW, value="quick"),)
    assert (series.draft.subject.flow_id, series.draft.subject.local_flow) == (DESK, False)
    assert series.draft.flow_id == DESK
    assert full.record.flow_hash != quick.record.flow_hash


@pytest.mark.parametrize(
    ("experiment_id", "relative", "old", "new", "changed"),
    [
        ("triage_prompts", TERSE_FILE, "one word label", "single word label", "terse"),
        ("triage_use", SHOUT_FILE, "Shout the label", "Shout the label loudly", "shout"),
        ("desk_flows", QUICK_FILE, "Guess a label in one cheap step", "Guess a label cheaply", "quick"),
    ],
)
def test_editing_the_value_of_a_variant_makes_only_that_variant_stale(
    project_root: Path, experiment_id: str, relative: str, old: str, new: str, changed: str
) -> None:
    before = hashes(planned(project_root, experiment_id))
    edit(project_root, relative, old, new)
    after = hashes(planned(project_root, experiment_id))

    assert {variant for variant in before if before[variant] != after[variant]} == {changed}


UNKNOWN_ALTERNATIVE: Final = diagnostic(
    DiagnosticCode.E_ALTERNATIVE_UNKNOWN, "experiments/triage_use/experiment.yaml", ("variants",), "no such node"
)


@dataclass(frozen=True, slots=True)
class BrokenAssembler:
    def subject(self) -> VariantAssembly:
        return AssemblyFailure(VariantId("subject"), (UNKNOWN_ALTERNATIVE,))

    def variant(self, variant: VariantSpec) -> VariantAssembly:
        return AssemblyFailure(variant.id, (UNKNOWN_ALTERNATIVE,))


def test_a_variant_that_does_not_assemble_stops_the_plan_with_its_diagnostics() -> None:
    draft = VariantDraft(
        variant_id=VariantId("broken"),
        role=VariantRole.OTHER,
        spec=VariantSpec.model_validate({"id": "broken"}),
    )

    with pytest.raises(VariantNotBuilt) as refused:
        compiled_series(BrokenAssembler(), (draft,))

    assert str(refused.value) == "variant subject does not assemble"
    assert refused.value.diagnostics == (UNKNOWN_ALTERNATIVE,)
