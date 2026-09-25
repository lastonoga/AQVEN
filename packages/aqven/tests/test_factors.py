import re
from pathlib import Path
from typing import Final

import pytest
from factor_lab import (
    DESK,
    FAST_FLOW,
    PROMPTS,
    ROUTE_DIRECT,
    ROUTES,
    SHORT_PROMPT,
    checked,
    experiment,
    factor_lab,
    replace,
    variant,
    write,
)

from aqven.compiler import compile_project
from aqven.diagnostics import DiagnosticCode
from aqven.factors import (
    AssembledVariant,
    AssemblyFailure,
    FactorChange,
    VariantAssembly,
    assemble_subject,
    assemble_variant,
    derived_inference_id,
    experiment_usage,
    subject_flow,
    variant_changes,
)
from aqven.ir import CompiledLlmNode, TemplatePrompt, flow_hash
from aqven.loader import LoadedProject
from aqven.spec import (
    NAME_PATTERN,
    AgentId,
    CallNodeSpec,
    ExperimentSpec,
    FactorKind,
    FlowId,
    InferenceId,
    LlmNodeSpec,
    NodeId,
    VariantId,
    VariantSpec,
)

NAME: Final = re.compile(NAME_PATTERN)
TRIAGE: Final = FlowId("triage")


@pytest.fixture
def lab(tmp_path: Path) -> Path:
    return factor_lab(tmp_path)


def assembled(assembly: VariantAssembly) -> AssembledVariant:
    assert isinstance(assembly, AssembledVariant), assembly
    return assembly


def failed(assembly: VariantAssembly) -> AssemblyFailure:
    assert isinstance(assembly, AssemblyFailure), assembly
    return assembly


def assemble(root: Path, name: str, variant_id: str) -> tuple[LoadedProject, VariantAssembly]:
    _, project = checked(root)
    loaded = experiment(project, name)
    return project, assemble_variant(project, loaded, variant(loaded, variant_id))


def hash_of(item: AssembledVariant) -> str:
    return flow_hash(compile_project(item.project), item.flow_id)


def as_written_hash(root: Path, name: str) -> str:
    _, project = checked(root)
    return hash_of(assembled(assemble_subject(project, experiment(project, name), VariantId("as_is"))))


def problems(assembly: VariantAssembly) -> list[tuple[DiagnosticCode, tuple[str | int, ...]]]:
    return [(item.code, item.path) for item in failed(assembly).diagnostics]


def test_agent_factor_answers_the_node_with_another_agent(lab: Path) -> None:
    _, assembly = assemble(lab, "triage_agents", "mini")

    item = assembled(assembly)
    node = item.project.flows[TRIAGE].nodes[NodeId("classify")].spec
    compiled = compile_project(item.project).flow(TRIAGE).node(NodeId("classify"))

    assert item.changes == (FactorChange(NodeId("classify"), FactorKind.AGENT, "mini"),)
    assert isinstance(node, LlmNodeSpec) and node.agent == AgentId("mini")
    assert isinstance(compiled, CompiledLlmNode) and compiled.agent == AgentId("mini")
    assert hash_of(item) != as_written_hash(lab, "triage_agents")


def test_variant_project_keeps_the_closure_and_the_registries_only(lab: Path) -> None:
    project, assembly = assemble(lab, "triage_agents", "mini")

    item = assembled(assembly)

    assert set(item.project.flows) == {TRIAGE}
    assert (item.project.experiments, item.project.datasets) == ({}, {})
    assert item.project.agents == project.agents
    assert set(item.project.inferences) == set(project.inferences)


def test_agent_factor_rejects_an_unknown_agent(lab: Path) -> None:
    replace(lab, "experiments/triage_agents/experiment.yaml", 'classify: "mini"', 'classify: "ghost"')

    _, assembly = assemble(lab, "triage_agents", "mini")

    assert problems(assembly) == [(DiagnosticCode.E_AGENT_UNKNOWN, ("variants", 1, "nodes", "classify"))]


def test_prompt_factor_gives_the_node_its_own_inference_with_the_prompt_file(lab: Path) -> None:
    project, assembly = assemble(lab, "triage_prompts", "short")

    item = assembled(assembly)
    node = item.project.flows[TRIAGE].nodes[NodeId("classify")].spec
    assert isinstance(node, LlmNodeSpec) and node.inference is not None
    derived = item.project.inferences[node.inference]
    compiled = compile_project(item.project)
    prompt = compiled.inference(node.inference).prompt

    assert node.inference != InferenceId("classify") and NAME.fullmatch(node.inference) is not None
    assert (derived.origin, derived.folder, derived.stem) == ("classify", "triage", "triage/classify")
    written = project.inferences[InferenceId("classify")].source
    assert derived.source is not None and written is not None
    assert derived.source.spec.out == written.spec.out
    assert isinstance(prompt, TemplatePrompt)
    assert prompt.template == (lab / SHORT_PROMPT).read_text(encoding="utf-8")
    assert compiled.inference(InferenceId("classify")).prompt != prompt


def test_prompt_file_changes_the_flow_hash_of_the_variant(lab: Path) -> None:
    before = hash_of(assembled(assemble(lab, "triage_prompts", "short")[1]))
    replace(lab, SHORT_PROMPT, "one sentence rationale", "two sentence rationale")

    after = hash_of(assembled(assemble(lab, "triage_prompts", "short")[1]))

    assert before != after
    assert before != as_written_hash(lab, "triage_prompts")


def test_prompt_factor_needs_the_prompt_file(lab: Path) -> None:
    replace(lab, PROMPTS, 'classify: "short"', 'classify: "long"')

    _, assembly = assemble(lab, "triage_prompts", "short")

    (problem,) = failed(assembly).diagnostics
    assert (problem.code, problem.path) == (DiagnosticCode.E_PROMPT_MISSING, ("variants", 1, "nodes", "classify"))
    assert "experiments/triage_prompts/prompts/long.md" in problem.message


def test_use_factor_replaces_the_slot_and_drops_the_unreachable_subject_nodes(lab: Path) -> None:
    _, assembly = assemble(lab, "triage_routes", "direct")

    item = assembled(assembly)
    nodes = item.project.flows[TRIAGE].nodes

    assert set(nodes) == {NodeId("classify"), NodeId("route"), NodeId("summarize")}
    assert nodes[NodeId("route")].path == ROUTE_DIRECT
    assert TRIAGE in compile_project(item.project).flows


def test_use_factor_brings_the_children_of_the_alternative(lab: Path) -> None:
    _, assembly = assemble(lab, "triage_routes", "senior")

    nodes = assembled(assembly).project.flows[TRIAGE].nodes

    assert set(nodes) == {NodeId("classify"), NodeId("route"), NodeId("route__review"), NodeId("summarize")}
    assert nodes[NodeId("route__review")].path == "experiments/triage_routes/nodes/review.node.yaml"


def test_alternative_file_changes_the_flow_hash_of_the_variant(lab: Path) -> None:
    before = hash_of(assembled(assemble(lab, "triage_routes", "direct")[1]))
    replace(lab, ROUTE_DIRECT, "Every queue goes straight on", "Every queue goes on at once")

    after = hash_of(assembled(assemble(lab, "triage_routes", "direct")[1]))

    assert before != after


def test_use_factor_needs_an_alternative_of_the_experiment(lab: Path) -> None:
    replace(lab, ROUTES, 'route: "route_direct"', 'route: "route_fast"')

    _, assembly = assemble(lab, "triage_routes", "direct")

    assert problems(assembly) == [(DiagnosticCode.E_ALTERNATIVE_UNKNOWN, ("variants", 1, "nodes", "route"))]


def test_flow_factor_calls_a_local_flow_and_compiles_the_closure(lab: Path) -> None:
    _, assembly = assemble(lab, "desk_flows", "fast")

    item = assembled(assembly)
    sort = item.project.flows[FlowId("desk")].nodes[NodeId("sort")].spec

    assert isinstance(sort, CallNodeSpec) and sort.flow == FlowId("triage_fast")
    assert set(item.project.flows) == {FlowId("desk"), FlowId("triage_fast")}
    assert set(compile_project(item.project).flows) == {FlowId("desk"), FlowId("triage_fast")}


def test_local_flow_changes_the_flow_hash_of_the_variant(lab: Path) -> None:
    before = hash_of(assembled(assemble(lab, "desk_flows", "fast")[1]))
    replace(lab, FAST_FLOW, "Sorting without the operator", "Sorting with no operator")
    replace(lab, FAST_FLOW, 'from: "$summarize.out.summary"', 'from: "$classify.out.rationale"')

    after = hash_of(assembled(assemble(lab, "desk_flows", "fast")[1]))

    assert before != after


def test_flow_factor_keeps_the_contract_of_the_slot(lab: Path) -> None:
    replace(lab, FAST_FLOW, 'output: "TriageResult"', 'output: "TriageReview"')

    _, assembly = assemble(lab, "desk_flows", "fast")

    (problem,) = failed(assembly).diagnostics
    assert (problem.code, problem.path) == (DiagnosticCode.E_FACTOR_FLOW_CONTRACT, ("variants", 1, "nodes", "sort"))
    assert problem.message == (
        "experiment desk_flows: variant fast calls flow triage_fast at sort, whose output TriageReview differs "
        "from output TriageResult of flow triage"
    )


def test_flow_factor_needs_a_known_flow(lab: Path) -> None:
    replace(lab, DESK, 'sort: "triage_fast"', 'sort: "triage_slow"')

    _, assembly = assemble(lab, "desk_flows", "fast")

    assert problems(assembly) == [(DiagnosticCode.E_FLOW_UNKNOWN, ("variants", 1, "nodes", "sort"))]


def test_a_factor_on_the_wrong_node_kind_fails_the_assembly(lab: Path) -> None:
    replace(lab, "experiments/triage_agents/experiment.yaml", '  - "classify"\n', '  - "summarize"\n')
    replace(lab, "experiments/triage_agents/experiment.yaml", 'classify: "mini"', 'summarize: "mini"')

    _, assembly = assemble(lab, "triage_agents", "mini")

    assert problems(assembly) == [(DiagnosticCode.E_FACTOR_KIND, ("variants", 1, "nodes", "summarize"))]


def test_local_subject_is_found_before_a_project_flow(lab: Path) -> None:
    write(lab, "experiments/desk_flows/flows/desk/flow.yaml", (lab / FAST_FLOW).read_text(encoding="utf-8"))
    _, project = checked(lab)

    subject = subject_flow(project, experiment(project, "desk_flows"))

    assert subject is not None and subject.folder == "experiments/desk_flows/flows/desk"


def test_variant_changes_follow_the_factor_order() -> None:
    spec = ExperimentSpec.model_validate(
        {
            "apiVersion": "aqven/v1",
            "kind": "Experiment",
            "description": "d",
            "subject": {"flow": "triage"},
            "varies": {"what": "agent", "nodes": ["b", "a"]},
            "cases": {"dataset": "cases"},
            "variants": [{"id": "x", "nodes": {"a": "mini", "c": "mini", "b": "cheap"}}],
            "question": {"kind": "look"},
        }
    )

    changes = variant_changes(spec, spec.variants[0])

    assert [change.node_id for change in changes] == ["b", "a", "c"]
    assert variant_changes(spec, VariantSpec.model_validate({"id": "y"})) == ()


def test_derived_inference_id_is_short_deterministic_and_free() -> None:
    origin = InferenceId("x" * 63)
    first = derived_inference_id(origin, "experiments/e/prompts/p.md", lambda _: False)
    taken = derived_inference_id(origin, "experiments/e/prompts/p.md", lambda candidate: candidate == first)

    assert first == derived_inference_id(origin, "experiments/e/prompts/p.md", lambda _: False)
    assert len(first) <= 63 and NAME.fullmatch(first) is not None
    assert taken != first and len(taken) <= 63 and NAME.fullmatch(taken) is not None


def test_usage_counts_values_children_and_the_local_subject(lab: Path) -> None:
    _, project = checked(lab)

    routes = experiment_usage(experiment(project, "triage_routes"))
    desk = experiment_usage(experiment(project, "desk_flows"))

    assert routes.alternatives == {NodeId("route_direct"), NodeId("route_review"), NodeId("review")}
    assert desk.flows == {FlowId("triage_fast")}
    assert experiment_usage(experiment(project, "triage_prompts")).prompts == {"short"}
