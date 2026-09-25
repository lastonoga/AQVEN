from collections.abc import Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field, replace
from typing import Final, Protocol

from pydantic import JsonValue

from aqven.compiler import compile_project
from aqven.compiler.errors import CompileError
from aqven.diagnostics import Diagnostic
from aqven.engine.selection import range_order
from aqven.factors import (
    AssembledVariant,
    AssemblyFailure,
    FactorChange,
    VariantAssembly,
    assemble_subject,
    assemble_variant,
    called_flows,
)
from aqven.ir import (
    CompiledFlow,
    CompiledLlmNode,
    CompiledProject,
    IrHash,
    JudgeEvaluator,
    RefBinding,
    canonical_json,
    flow_hash,
)
from aqven.loader import LoadedExperiment, LoadedProject, file_hash, local_node_id
from aqven.series.model import (
    Assignment,
    CaseSnapshot,
    JudgePlan,
    SeriesSnapshot,
    SubjectRecord,
    VariantChange,
    VariantPlanRecord,
    VariantRole,
)
from aqven.server.workspace import TreeSnapshot
from aqven.spec import (
    AgentId,
    ExperimentId,
    FactorKind,
    FlowId,
    InferenceId,
    NodeId,
    TypeId,
    VariantId,
    VariantSpec,
)

JUDGE_NODE: Final = NodeId("subject")
JUDGE_OUTPUT: Final = "output"
JUDGE_PREFIX: Final = "aqven_judge"
JUDGE_INPUT_TYPE: Final = "JudgeCaseIn"
JUDGE_OUTPUT_TYPE: Final = "JudgeCaseOut"
UNIQUE_SUFFIX: Final = "_x"
UNREGISTERED: Final = IrHash("")
PYTHON_SUFFIX: Final = ".py"
SUBJECT_VARIANT: Final = VariantId("subject")
NOT_ASSEMBLED: Final = "does not assemble"
NOT_COMPILED: Final = "does not compile"


class PlanRegistrar(Protocol):
    def register(self, plan: CompiledProject) -> IrHash: ...


class VariantNotBuilt(ValueError):
    def __init__(self, variant_id: VariantId, reason: str, diagnostics: Sequence[Diagnostic]) -> None:
        super().__init__(f"variant {variant_id} {reason}")
        self.variant_id = variant_id
        self.reason = reason
        self.diagnostics = tuple(diagnostics)


class VariantAssembler(Protocol):
    def subject(self) -> VariantAssembly: ...

    def variant(self, variant: VariantSpec) -> VariantAssembly: ...


@dataclass(frozen=True, slots=True)
class ExperimentAssembler:
    project: LoadedProject
    experiment: LoadedExperiment

    def subject(self) -> VariantAssembly:
        return assemble_subject(self.project, self.experiment, SUBJECT_VARIANT)

    def variant(self, variant: VariantSpec) -> VariantAssembly:
        return assemble_variant(self.project, self.experiment, variant)


@dataclass(frozen=True, slots=True)
class FlowAssembler:
    project: LoadedProject
    flow_id: FlowId

    def subject(self) -> VariantAssembly:
        return self._as_written(SUBJECT_VARIANT)

    def variant(self, variant: VariantSpec) -> VariantAssembly:
        return self._as_written(variant.id)

    def _as_written(self, variant_id: VariantId) -> VariantAssembly:
        return AssembledVariant(variant_id, self.flow_id, closure_project(self.project, self.flow_id), ())


def closure_project(project: LoadedProject, flow_id: FlowId) -> LoadedProject:
    reached = called_flows(project.flows, (flow_id,))
    flows = {reached_id: project.flows[reached_id] for reached_id in reached}
    return replace(project, flows=flows, experiments={}, datasets={})


@dataclass(frozen=True, slots=True)
class VariantDraft:
    variant_id: VariantId
    role: VariantRole
    spec: VariantSpec


@dataclass(frozen=True, slots=True)
class JudgeDraft:
    check_id: str
    evaluator: JudgeEvaluator
    validated_by: ExperimentId | None


@dataclass(frozen=True, slots=True)
class CompiledVariant:
    flow_id: FlowId
    changes: tuple[FactorChange, ...]
    plan: CompiledProject


@dataclass(frozen=True, slots=True)
class VariantBuild:
    record: VariantPlanRecord
    plan: CompiledProject


@dataclass(frozen=True, slots=True)
class JudgeBuild:
    plan: CompiledProject | None
    judges: Mapping[str, JudgePlan]


@dataclass(frozen=True, slots=True)
class CompiledSeries:
    subject: CompiledVariant
    variants: tuple[tuple[VariantDraft, CompiledVariant], ...]


def assembled(assembly: VariantAssembly) -> AssembledVariant:
    if isinstance(assembly, AssemblyFailure):
        raise VariantNotBuilt(assembly.variant_id, NOT_ASSEMBLED, assembly.diagnostics)
    return assembly


@dataclass(slots=True)
class VariantCompiler:
    assembler: VariantAssembler
    plans: dict[tuple[FlowId, tuple[FactorChange, ...]], CompiledProject] = field(
        default_factory=dict[tuple[FlowId, tuple[FactorChange, ...]], CompiledProject]
    )

    def subject(self) -> CompiledVariant:
        return self._compiled(self.assembler.subject())

    def variant(self, variant: VariantSpec) -> CompiledVariant:
        return self._compiled(self.assembler.variant(variant))

    def _compiled(self, assembly: VariantAssembly) -> CompiledVariant:
        built = assembled(assembly)
        key = (built.flow_id, built.changes)
        plan = self.plans.get(key)
        if plan is None:
            plan = self._compile(built)
            self.plans[key] = plan
        return CompiledVariant(flow_id=built.flow_id, changes=built.changes, plan=plan)

    def _compile(self, built: AssembledVariant) -> CompiledProject:
        try:
            return compile_project(built.project)
        except CompileError as error:
            raise VariantNotBuilt(built.variant_id, NOT_COMPILED, error.diagnostics) from error


def compiled_series(assembler: VariantAssembler, drafts: Sequence[VariantDraft]) -> CompiledSeries:
    compiler = VariantCompiler(assembler)
    subject = compiler.subject()
    variants = tuple((draft, compiler.variant(draft.spec)) for draft in drafts)
    return CompiledSeries(subject=subject, variants=variants)


def top_level(flow: CompiledFlow, node_id: NodeId) -> NodeId:
    current = node_id
    while (parent := flow.node(current).parent) is not None:
        current = parent
    return current


def scope_nodes(flow: CompiledFlow, subject: SubjectRecord) -> frozenset[NodeId]:
    if subject.start_node is None or subject.end_node is None:
        return frozenset(flow.order)
    return frozenset(range_order(flow, subject.start_node, subject.end_node))


def revalidated(plan: CompiledProject) -> CompiledProject:
    return CompiledProject.model_validate(plan.model_dump(mode="json"))


def with_flows(plan: CompiledProject, flows: Mapping[FlowId, CompiledFlow]) -> CompiledProject:
    return revalidated(plan.model_copy(update={"flows": {**plan.flows, **flows}}))


def llm_nodes(flow: CompiledFlow, scope: frozenset[NodeId]) -> Iterator[CompiledLlmNode]:
    for node in flow.nodes.values():
        if isinstance(node, CompiledLlmNode) and top_level(flow, node.node_id) in scope:
            yield node


def agent_nodes(changes: Iterable[FactorChange]) -> frozenset[NodeId]:
    return frozenset(change.node_id for change in changes if change.what is FactorKind.AGENT)


def assignments(
    plan: CompiledProject, flow: CompiledFlow, scope: frozenset[NodeId], overridden: frozenset[NodeId]
) -> tuple[Assignment, ...]:
    return tuple(
        Assignment(
            node_id=node.node_id,
            agent_id=node.agent,
            model=plan.agent(node.agent).primary.model,
            overridden=local_node_id(node.node_id) in overridden,
        )
        for node in llm_nodes(flow, scope)
    )


def variant_change(change: FactorChange) -> VariantChange:
    return VariantChange(node_id=change.node_id, what=change.what, value=change.value)


def output_type(flow: CompiledFlow, subject: SubjectRecord) -> TypeId | None:
    return None if subject.start_node is not None else TypeId(flow.output_type)


def build_variant(
    compiled: CompiledVariant, subject: SubjectRecord, draft: VariantDraft, registrar: PlanRegistrar | None
) -> VariantBuild:
    plan = compiled.plan
    flow = plan.flow(compiled.flow_id)
    ir_hash = registrar.register(plan) if registrar is not None else UNREGISTERED
    record = VariantPlanRecord(
        variant_id=draft.variant_id,
        role=draft.role,
        changes=tuple(variant_change(change) for change in compiled.changes),
        flow_id=compiled.flow_id,
        ir_hash=ir_hash,
        flow_hash=flow_hash(plan, compiled.flow_id),
        input_type=TypeId(flow.input_type),
        output_type=output_type(flow, subject),
        assignments=assignments(plan, flow, scope_nodes(flow, subject), agent_nodes(compiled.changes)),
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
