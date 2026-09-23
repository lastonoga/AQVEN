from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass, replace
from typing import Final, Protocol

from pydantic import JsonValue

from aqven.compiler import compile_project
from aqven.engine.selection import range_order
from aqven.ir import (
    CompiledFlow,
    CompiledLlmNode,
    CompiledNode,
    CompiledProject,
    IrHash,
    JudgeEvaluator,
    RefBinding,
    canonical_json,
    flow_hash,
)
from aqven.loader import LoadedExperiment, LoadedFlow, LoadedProject, file_hash
from aqven.series.model import (
    Assignment,
    CaseSnapshot,
    JudgePlan,
    SeriesSnapshot,
    SubjectRecord,
    VariantPlanRecord,
    VariantRole,
)
from aqven.server.workspace import TreeSnapshot
from aqven.spec import AgentId, ArmId, ExperimentId, FlowId, InferenceId, NodeId, TypeId, VariantId

JUDGE_NODE: Final = NodeId("subject")
JUDGE_OUTPUT: Final = "output"
JUDGE_PREFIX: Final = "aqven_judge"
JUDGE_INPUT_TYPE: Final = "JudgeCaseIn"
JUDGE_OUTPUT_TYPE: Final = "JudgeCaseOut"
UNIQUE_SUFFIX: Final = "_x"
UNREGISTERED: Final = IrHash("")
PYTHON_SUFFIX: Final = ".py"


class PlanRegistrar(Protocol):
    def register(self, plan: CompiledProject) -> IrHash: ...


@dataclass(frozen=True, slots=True)
class VariantDraft:
    variant_id: VariantId
    role: VariantRole
    arm_id: ArmId | None
    flow_id: FlowId
    agents: Mapping[NodeId, AgentId]


@dataclass(frozen=True, slots=True)
class JudgeDraft:
    check_id: str
    evaluator: JudgeEvaluator
    validated_by: ExperimentId | None


@dataclass(frozen=True, slots=True)
class VariantBuild:
    record: VariantPlanRecord
    plan: CompiledProject


@dataclass(frozen=True, slots=True)
class JudgeBuild:
    plan: CompiledProject | None
    judges: Mapping[str, JudgePlan]


def arm_flows(experiment: LoadedExperiment | None) -> Mapping[FlowId, LoadedFlow]:
    if experiment is None:
        return {}
    return {FlowId(arm_id): flow for arm_id, flow in experiment.arms.items()}


def base_plan(project: LoadedProject, experiment: LoadedExperiment | None) -> CompiledProject:
    flows = {**project.flows, **arm_flows(experiment)}
    return compile_project(replace(project, flows=flows, experiments={}, datasets={}))


def top_level(flow: CompiledFlow, node_id: NodeId) -> NodeId:
    current = node_id
    while (parent := flow.node(current).parent) is not None:
        current = parent
    return current


def scope_nodes(flow: CompiledFlow, subject: SubjectRecord) -> frozenset[NodeId]:
    if subject.start_node is None or subject.end_node is None:
        return frozenset(flow.order)
    return frozenset(range_order(flow, subject.start_node, subject.end_node))


def swapped_node(plan: CompiledProject, node: CompiledNode, agent_id: AgentId | None) -> CompiledNode:
    if agent_id is None or not isinstance(node, CompiledLlmNode):
        return node
    return node.model_copy(update={"agent": agent_id, "output_mode": plan.agent(agent_id).output.mode})


def swapped_flow(plan: CompiledProject, flow: CompiledFlow, agents: Mapping[NodeId, AgentId]) -> CompiledFlow:
    nodes = {node_id: swapped_node(plan, node, agents.get(node_id)) for node_id, node in flow.nodes.items()}
    return flow.model_copy(update={"nodes": nodes})


def revalidated(plan: CompiledProject) -> CompiledProject:
    return CompiledProject.model_validate(plan.model_dump(mode="json"))


def with_flows(plan: CompiledProject, flows: Mapping[FlowId, CompiledFlow]) -> CompiledProject:
    return revalidated(plan.model_copy(update={"flows": {**plan.flows, **flows}}))


def variant_plan(base: CompiledProject, flow_id: FlowId, agents: Mapping[NodeId, AgentId]) -> CompiledProject:
    return with_flows(base, {flow_id: swapped_flow(base, base.flow(flow_id), agents)})


def llm_nodes(flow: CompiledFlow, scope: frozenset[NodeId]) -> Iterator[CompiledLlmNode]:
    for node in flow.nodes.values():
        if isinstance(node, CompiledLlmNode) and top_level(flow, node.node_id) in scope:
            yield node


def assignments(
    plan: CompiledProject, flow: CompiledFlow, scope: frozenset[NodeId], agents: Mapping[NodeId, AgentId]
) -> tuple[Assignment, ...]:
    return tuple(
        Assignment(
            node_id=node.node_id,
            agent_id=node.agent,
            model=plan.agent(node.agent).primary.model,
            overridden=node.node_id in agents,
        )
        for node in llm_nodes(flow, scope)
    )


def output_type(flow: CompiledFlow, subject: SubjectRecord) -> TypeId | None:
    return None if subject.start_node is not None else TypeId(flow.output_type)


def build_variant(
    base: CompiledProject, subject: SubjectRecord, draft: VariantDraft, registrar: PlanRegistrar | None
) -> VariantBuild:
    plan = variant_plan(base, draft.flow_id, draft.agents)
    flow = plan.flow(draft.flow_id)
    ir_hash = registrar.register(plan) if registrar is not None else UNREGISTERED
    record = VariantPlanRecord(
        variant_id=draft.variant_id,
        role=draft.role,
        arm_id=draft.arm_id,
        flow_id=draft.flow_id,
        ir_hash=ir_hash,
        flow_hash=flow_hash(plan, draft.flow_id),
        input_type=TypeId(flow.input_type),
        output_type=output_type(flow, subject),
        assignments=assignments(plan, flow, scope_nodes(flow, subject), draft.agents),
    )
    return VariantBuild(record=record, plan=plan)


def unique_flow_id(taken: Mapping[FlowId, object], check_id: str) -> FlowId:
    candidate = f"{JUDGE_PREFIX}_{check_id}"
    while candidate in taken:
        candidate = f"{candidate}{UNIQUE_SUFFIX}"
    return FlowId(candidate)


def judge_flow(plan: CompiledProject, flow_id: FlowId, inference_id: InferenceId, agent_id: AgentId) -> CompiledFlow:
    inference = plan.inference(inference_id)
    node = CompiledLlmNode(
        node_id=JUDGE_NODE,
        description=f"series judge: inference {inference_id} with agent {agent_id}",
        output_schema=inference.output_schema,
        inputs=tuple(RefBinding(name=field.name, ref=f"$input.{field.name}") for field in inference.input_fields),
        input_schema=inference.input_schema,
        agent=agent_id,
        inference=inference_id,
        output_mode=plan.agent(agent_id).output.mode,
    )
    return CompiledFlow(
        flow_id=flow_id,
        description=f"series judge harness for inference {inference_id}",
        input_type=JUDGE_INPUT_TYPE,
        output_type=JUDGE_OUTPUT_TYPE,
        input_schema=inference.input_schema,
        output_schema=inference.output_schema,
        returns=(RefBinding(name=JUDGE_OUTPUT, ref=f"${JUDGE_NODE}.out"),),
        order=(JUDGE_NODE,),
        nodes={JUDGE_NODE: node},
    )


def judge_plan(plan: CompiledProject, flow: CompiledFlow, draft: JudgeDraft) -> JudgePlan:
    inference = plan.inference(draft.evaluator.inference)
    return JudgePlan(
        flow_id=flow.flow_id,
        inference=draft.evaluator.inference,
        agent=draft.evaluator.agent,
        input_fields=tuple(field.name for field in inference.input_fields),
        validated_by=draft.validated_by,
    )


def judge_flows(base: CompiledProject, drafts: Sequence[JudgeDraft]) -> dict[str, CompiledFlow]:
    flows: dict[str, CompiledFlow] = {}
    taken: dict[FlowId, object] = dict(base.flows)
    for draft in drafts:
        flow_id = unique_flow_id(taken, draft.check_id)
        taken[flow_id] = draft
        flows[draft.check_id] = judge_flow(base, flow_id, draft.evaluator.inference, draft.evaluator.agent)
    return flows


def build_judges(base: CompiledProject, drafts: Sequence[JudgeDraft]) -> JudgeBuild:
    if not drafts:
        return JudgeBuild(plan=None, judges={})
    flows = judge_flows(base, drafts)
    plan = with_flows(base, {flow.flow_id: flow for flow in flows.values()})
    judges = {draft.check_id: judge_plan(plan, flows[draft.check_id], draft) for draft in drafts}
    return JudgeBuild(plan=plan, judges=judges)


def judge_hashes(build: JudgeBuild) -> dict[str, str]:
    plan = build.plan
    if plan is None:
        return {}
    return {check_id: flow_hash(plan, judge.flow_id) for check_id, judge in build.judges.items()}


def code_sha256(tree: TreeSnapshot) -> str:
    listing: dict[str, JsonValue] = {
        path: stat.file_hash for path, stat in sorted(tree.files.items()) if path.endswith(PYTHON_SUFFIX)
    }
    return file_hash(canonical_json(listing))


def cases_sha256(cases: Sequence[CaseSnapshot]) -> str:
    documents: list[JsonValue] = [case.model_dump(mode="json") for case in cases]
    return file_hash(canonical_json(documents))


def case_names_sha256(names: Sequence[str]) -> str:
    documents: list[JsonValue] = list(names)
    return file_hash(canonical_json(documents))


@dataclass(frozen=True, slots=True)
class SnapshotSources:
    experiment_sha256: str | None
    dataset_sha256: str
    tree: TreeSnapshot
    engine_version: str


def series_snapshot(
    sources: SnapshotSources,
    cases: Sequence[CaseSnapshot],
    variants: Sequence[VariantBuild],
    judges: JudgeBuild,
) -> SeriesSnapshot:
    return SeriesSnapshot(
        experiment_sha256=sources.experiment_sha256,
        dataset_sha256=sources.dataset_sha256,
        cases_sha256=cases_sha256(cases),
        flows={build.record.variant_id: build.record.flow_hash for build in variants},
        judges=judge_hashes(judges),
        code_sha256=code_sha256(sources.tree),
        engine_version=sources.engine_version,
    )
