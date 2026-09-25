import asyncio
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Final

from aqven.check import CheckReport, CodeResolver, build_context
from aqven.check.datasets import selected_cases
from aqven.compiler.bindings import evaluator
from aqven.compiler.context import CompileContext
from aqven.compiler.errors import CompileError
from aqven.datasets import CaseMediaResolver
from aqven.engine.runtime import engine_blob_store
from aqven.factors import is_local_subject
from aqven.ir import BuiltinEvaluator, CompiledEvaluator, CompiledProject, JudgeEvaluator
from aqven.loader import LoadedExperiment, LoadedProject, SourceSpec, dataset_media_folder
from aqven.runtime.address import Problem
from aqven.series.model import (
    CaseSnapshot,
    CheckPlan,
    ExperimentOrigin,
    LookOrigin,
    SeriesOrigin,
    SeriesRecord,
    SeriesSnapshot,
    SubjectRecord,
    VariantRole,
)
from aqven.series.plans import (
    CompiledSeries,
    CompiledVariant,
    ExperimentAssembler,
    FlowAssembler,
    JudgeBuild,
    JudgeDraft,
    PlanRegistrar,
    SnapshotSources,
    VariantAssembler,
    VariantBuild,
    VariantDraft,
    VariantNotBuilt,
    build_judges,
    build_variant,
    compiled_series,
    series_snapshot,
)
from aqven.series.protocol import MAX_ATTEMPTS
from aqven.series.split import FixedPackage, SplitAssigner
from aqven.series.subjects import SubjectBinding, TypeSource, subject_kind, subject_strategy
from aqven.series.views import SeriesStartRequest
from aqven.server.case_media import BlobWriters, case_media_resolver, case_with_media
from aqven.server.errors import ApiFailure, diagnostic_problem
from aqven.server.workspace import TreeSnapshot
from aqven.spec import (
    CompareQuestion,
    DatasetCase,
    DatasetFile,
    DatasetId,
    ExperimentId,
    ExperimentSubject,
    FlowId,
    LookQuestion,
    MetricKind,
    NodeId,
    NoninferiorQuestion,
    Question,
    SeriesSplit,
    ThresholdQuestion,
    VariantId,
    VariantSpec,
)

LOOK_VARIANT: Final = VariantId("current")
LOOK_CHECK: Final = "expected"
EXPECTED_USE: Final = "expected"
CHECKS_KEY: Final = "checks"
CASES_KEY: Final = "cases"
CASE_PROBLEM: Final = "CASE_NOT_RUNNABLE"
SHORT_OF_CASES: Final = "short_of_cases"
LOOK_REPEATS: Final = 1

type RoleRule = Callable[[Question, VariantId], VariantRole]


@dataclass(frozen=True, slots=True)
class PlanningState:
    report: CheckReport
    tree: TreeSnapshot


@dataclass(frozen=True, slots=True)
class PlanRequest:
    experiment_id: ExperimentId | None
    look_flow: FlowId | None
    look_dataset: DatasetId | None
    look_cases: tuple[str, ...]
    start_node: NodeId | None
    end_node: NodeId | None
    on: SeriesSplit
    cases: int | None
    repeats: int | None


@dataclass(frozen=True, slots=True)
class CheckDraft:
    check_id: str
    kind: MetricKind
    evaluator: CompiledEvaluator
    threshold: float | None
    validated_by: ExperimentId | None
    only_with_expected: bool

    def plan(self, judges: JudgeBuild) -> CheckPlan:
        return CheckPlan(
            check_id=self.check_id,
            kind=self.kind,
            evaluator=self.evaluator.model_dump(mode="json"),
            threshold=self.threshold,
            judge=judges.judges.get(self.check_id),
            only_with_expected=self.only_with_expected,
        )

    def judge(self) -> JudgeDraft | None:
        if not isinstance(self.evaluator, JudgeEvaluator):
            return None
        return JudgeDraft(check_id=self.check_id, evaluator=self.evaluator, validated_by=self.validated_by)


@dataclass(frozen=True, slots=True)
class SeriesDraft:
    origin: SeriesOrigin
    subject: SubjectRecord
    assembler: VariantAssembler
    question: Question
    experiment: LoadedExperiment | None
    flow_id: FlowId | None
    dataset_id: DatasetId
    dataset: SourceSpec[DatasetFile]
    variants: tuple[VariantDraft, ...]
    checks: tuple[CheckDraft, ...]
    on: SeriesSplit
    repeats: int
    wanted: int | None
    tags: Mapping[str, str] | None
    names: tuple[str, ...] | None

    @property
    def experiment_id(self) -> ExperimentId | None:
        return self.experiment.experiment_id if self.experiment is not None else None

    @property
    def experiment_sha256(self) -> str | None:
        return self.experiment.source.file_hash if self.experiment is not None else None


@dataclass(frozen=True, slots=True)
class CaseChoice:
    cases: tuple[CaseSnapshot, ...]
    available: int
    warnings: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class PlannedSeries:
    draft: SeriesDraft
    choice: CaseChoice
    subject: CompiledVariant
    variants: tuple[VariantBuild, ...]
    judges: JudgeBuild
    checks: tuple[CheckPlan, ...]
    snapshot: SeriesSnapshot
    package: str
    judge_ir_hash: str | None

    @property
    def cases(self) -> tuple[CaseSnapshot, ...]:
        return self.choice.cases

    @property
    def attempts(self) -> int:
        return len(self.cases) * self.draft.repeats * len(self.variants)


def not_runnable(message: str, problems: tuple[Problem, ...] = ()) -> ApiFailure:
    return ApiFailure("NOT_RUNNABLE", message, problems=problems)


def loaded_project(report: CheckReport) -> LoadedProject:
    if report.project is None or not report.ok:
        problems = tuple(diagnostic_problem(item) for item in report.errors)
        raise not_runnable("the working copy has errors: a series starts only after aqven check passes", problems)
    return report.project


def neutral_role(question: Question, variant_id: VariantId) -> VariantRole:
    return VariantRole.OTHER


def threshold_role(question: Question, variant_id: VariantId) -> VariantRole:
    if not isinstance(question, ThresholdQuestion):
        return VariantRole.OTHER
    tested = question.variant is None or question.variant == variant_id
    return VariantRole.CANDIDATE if tested else VariantRole.OTHER


def pair_role(question: Question, variant_id: VariantId) -> VariantRole:
    if not isinstance(question, CompareQuestion | NoninferiorQuestion):
        return VariantRole.OTHER
    roles = {question.baseline: VariantRole.BASELINE, question.candidate: VariantRole.CANDIDATE}
    return roles.get(variant_id, VariantRole.OTHER)


ROLE_RULES: Final[Mapping[str, RoleRule]] = {
    "look": neutral_role,
    "threshold": threshold_role,
    "compare": pair_role,
    "noninferior": pair_role,
}


def role_of(question: Question, variant_id: VariantId) -> VariantRole:
    return ROLE_RULES[question.kind](question, variant_id)


def subject_record(subject: ExperimentSubject, local_flow: bool) -> SubjectRecord:
    return SubjectRecord(
        kind=subject_kind(subject),
        flow_id=subject.flow,
        local_flow=local_flow,
        start_node=subject.from_,
        end_node=subject.to,
    )


def variant_draft(question: Question, variant: VariantSpec) -> VariantDraft:
    return VariantDraft(variant_id=variant.id, role=role_of(question, variant.id), spec=variant)


def project_flow(subject: ExperimentSubject, local_flow: bool) -> FlowId | None:
    return None if local_flow else subject.flow


def compile_context(project: LoadedProject) -> CompileContext:
    return CompileContext(build_context(project, CodeResolver(project.root)))


def experiment_checks(project: LoadedProject, loaded: LoadedExperiment) -> tuple[CheckDraft, ...]:
    context = compile_context(project)
    source = loaded.source
    try:
        return tuple(
            CheckDraft(
                check_id=check.id,
                kind=check.kind,
                evaluator=evaluator(context, check, source.path, (CHECKS_KEY, index)),
                threshold=None,
                validated_by=check.validated_by,
                only_with_expected=False,
            )
            for index, check in enumerate(source.spec.checks or ())
        )
    except CompileError as error:
        problems = tuple(diagnostic_problem(item) for item in error.diagnostics)
        raise not_runnable(f"experiment {loaded.experiment_id} has a check that does not compile", problems) from error


def dataset_of(project: LoadedProject, dataset_id: DatasetId) -> SourceSpec[DatasetFile]:
    source = project.datasets.get(dataset_id)
    if source is None:
        raise ApiFailure("NOT_FOUND", f"dataset {dataset_id} is not in the project")
    return source


def from_experiment(project: LoadedProject, request: PlanRequest) -> SeriesDraft:
    experiment_id = request.experiment_id
    loaded = None if experiment_id is None else project.experiments.get(experiment_id)
    if experiment_id is None or loaded is None:
        raise ApiFailure("NOT_FOUND", f"experiment {experiment_id} is not in the project")
    spec = loaded.source.spec
    subject = spec.subject
    local_flow = is_local_subject(loaded)
    return SeriesDraft(
        origin=ExperimentOrigin(experiment_id=experiment_id),
        subject=subject_record(subject, local_flow),
        assembler=ExperimentAssembler(project, loaded),
        question=spec.question,
        experiment=loaded,
        flow_id=project_flow(subject, local_flow),
        dataset_id=spec.cases.dataset,
        dataset=dataset_of(project, spec.cases.dataset),
        variants=tuple(variant_draft(spec.question, variant) for variant in spec.variants),
        checks=experiment_checks(project, loaded),
        on=request.on,
        repeats=request.repeats or spec.plan.repeats,
        wanted=request.cases or spec.plan.cases,
        tags=spec.cases.tags,
        names=None,
    )


def look_check() -> CheckDraft:
    return CheckDraft(
        check_id=LOOK_CHECK,
        kind=MetricKind.BINARY,
        evaluator=BuiltinEvaluator(use=EXPECTED_USE),
        threshold=None,
        validated_by=None,
        only_with_expected=True,
    )


def from_look(project: LoadedProject, request: PlanRequest) -> SeriesDraft:
    flow_id, dataset_id = request.look_flow, request.look_dataset
    if flow_id is None or dataset_id is None or flow_id not in project.flows:
        raise ApiFailure("NOT_FOUND", f"flow {flow_id} is not in the project")
    dataset = dataset_of(project, dataset_id)
    if dataset.spec.flow != flow_id:
        raise not_runnable(f"dataset {dataset_id} is not a dataset of flow {flow_id}")
    subject = ExperimentSubject.model_validate({"flow": flow_id, "from": request.start_node, "to": request.end_node})
    question = LookQuestion.model_validate({"kind": "look"})
    variant = VariantSpec.model_validate({"id": LOOK_VARIANT})
    return SeriesDraft(
        origin=LookOrigin(
            flow_id=flow_id,
            dataset_id=dataset_id,
            case_names=request.look_cases,
            start_node=subject.from_,
            end_node=subject.to,
        ),
        subject=subject_record(subject, local_flow=False),
        assembler=FlowAssembler(project, flow_id),
        question=question,
        experiment=None,
        flow_id=flow_id,
        dataset_id=dataset_id,
        dataset=dataset,
        variants=(variant_draft(question, variant),),
        checks=(look_check(),),
        on=SeriesSplit.DEV,
        repeats=request.repeats or LOOK_REPEATS,
        wanted=len(request.look_cases),
        tags=None,
        names=request.look_cases,
    )


ORIGINS: Final[Mapping[bool, Callable[[LoadedProject, PlanRequest], SeriesDraft]]] = {
    True: from_experiment,
    False: from_look,
}


def case_snapshot(index: int, case: DatasetCase, split: SeriesSplit) -> CaseSnapshot:
    return CaseSnapshot(
        case_index=index,
        name=case.name,
        split=split,
        tags=dict(case.tags or {}),
        inputs=case.inputs,
        context=case.context,
        node_outputs=dict(case.node_outputs or {}),
        expected_output=case.expected_output,
    )


async def case_snapshots(
    media: CaseMediaResolver, draft: SeriesDraft, chosen: Sequence[tuple[DatasetCase, SeriesSplit]]
) -> tuple[CaseSnapshot, ...]:
    return tuple(
        [
            case_snapshot(index, await case_with_media(media, case, draft.dataset.path), split)
            for index, (case, split) in enumerate(chosen)
        ]
    )


async def tagged_choice(draft: SeriesDraft, splits: SplitAssigner, media: CaseMediaResolver) -> CaseChoice:
    cases = draft.dataset.spec.cases
    selected = [cases[index] for index in selected_cases(draft.dataset.spec, draft.tags)]
    assigned = await splits.assign(draft.dataset_id, [case.name for case in selected])
    available = [case for case in selected if assigned[case.name] is draft.on]
    if not available:
        raise not_runnable(f"dataset {draft.dataset_id} has no selected cases on the {draft.on.value} split")
    wanted = draft.wanted or len(available)
    warnings = (SHORT_OF_CASES,) if wanted > len(available) else ()
    chosen = [(case, draft.on) for case in available[:wanted]]
    snapshots = await case_snapshots(media, draft, chosen)
    return CaseChoice(cases=snapshots, available=len(available), warnings=warnings)


async def named_choice(draft: SeriesDraft, splits: SplitAssigner, media: CaseMediaResolver) -> CaseChoice:
    names = draft.names or ()
    if len(set(names)) != len(names):
        raise ApiFailure("REQUEST_INVALID", "case_names must be unique")
    known = {case.name: case for case in draft.dataset.spec.cases}
    missing = [name for name in names if name not in known]
    if missing:
        raise ApiFailure("NOT_FOUND", f"cases not in dataset {draft.dataset_id}: {', '.join(missing)}")
    assigned = await splits.assign(draft.dataset_id, names)
    snapshots = await case_snapshots(media, draft, [(known[name], assigned[name]) for name in names])
    return CaseChoice(cases=snapshots, available=len(snapshots), warnings=())


async def case_choice(draft: SeriesDraft, splits: SplitAssigner, media: CaseMediaResolver) -> CaseChoice:
    if draft.names is None:
        return await tagged_choice(draft, splits, media)
    return await named_choice(draft, splits, media)


def attempt_limit(choice: CaseChoice, draft: SeriesDraft) -> None:
    attempts = len(choice.cases) * draft.repeats * len(draft.variants)
    if attempts > MAX_ATTEMPTS:
        message = f"the series would run {attempts} attempts, more than the limit of {MAX_ATTEMPTS}"
        raise ApiFailure("INPUT_INVALID", message)


def case_problems(
    compiled: CompiledSeries, cases: Sequence[CaseSnapshot], binding: SubjectBinding
) -> tuple[Problem, ...]:
    strategy = subject_strategy(binding)
    return tuple(
        Problem(path=(CASES_KEY, case.name, draft.variant_id), code=CASE_PROBLEM, message=message)
        for case in cases
        for draft, variant in compiled.variants
        for message in strategy.problems(variant.plan, variant.flow_id, case)
    )


def media_folders(project: LoadedProject) -> frozenset[str]:
    return frozenset(dataset_media_folder(source.path) for source in project.datasets.values())


def registered(registrar: PlanRegistrar | None, plan: CompiledProject | None) -> str | None:
    if registrar is None or plan is None:
        return None
    return registrar.register(plan)


def built_series(draft: SeriesDraft) -> CompiledSeries:
    try:
        return compiled_series(draft.assembler, draft.variants)
    except VariantNotBuilt as error:
        problems = tuple(diagnostic_problem(item) for item in error.diagnostics)
        raise not_runnable(str(error), problems) from error


def plan_request(request: SeriesStartRequest) -> PlanRequest:
    look = request.look
    return PlanRequest(
        experiment_id=request.experiment_id,
        look_flow=None if look is None else look.flow_id,
        look_dataset=None if look is None else look.dataset_id,
        look_cases=() if look is None else look.case_names,
        start_node=None if look is None else look.start_node,
        end_node=None if look is None else look.end_node,
        on=request.on,
        cases=request.cases,
        repeats=request.repeats,
    )


def rebuild_request(record: SeriesRecord) -> PlanRequest:
    origin = record.origin
    look = origin if isinstance(origin, LookOrigin) else None
    return PlanRequest(
        experiment_id=origin.experiment_id if isinstance(origin, ExperimentOrigin) else None,
        look_flow=None if look is None else look.flow_id,
        look_dataset=None if look is None else look.dataset_id,
        look_cases=() if look is None else look.case_names,
        start_node=None if look is None else look.start_node,
        end_node=None if look is None else look.end_node,
        on=record.on,
        cases=record.plan.case_count,
        repeats=record.plan.repeats,
    )


@dataclass(frozen=True, slots=True)
class SeriesPlanner:
    types: TypeSource
    engine_version: str
    holdout_share: float
    blobs: BlobWriters = engine_blob_store

    async def draft(self, request: PlanRequest, state: PlanningState) -> tuple[SeriesDraft, CaseChoice, str]:
        project = loaded_project(state.report)
        draft = ORIGINS[request.experiment_id is not None](project, request)
        package = project.project.spec.package
        splits = SplitAssigner(FixedPackage(package), self.holdout_share)
        choice = await case_choice(draft, splits, case_media_resolver(project.root, self.blobs))
        attempt_limit(choice, draft)
        return draft, choice, package

    async def plan(self, request: PlanRequest, state: PlanningState, registrar: PlanRegistrar | None) -> PlannedSeries:
        draft, choice, package = await self.draft(request, state)
        compiled = await asyncio.to_thread(built_series, draft)
        binding = SubjectBinding(subject=draft.subject, types=self.types, package=package)
        problems = case_problems(compiled, choice.cases, binding)
        if problems:
            raise not_runnable("some cases cannot run on the subject: nothing was started", problems)
        variants = tuple(
            build_variant(variant, draft.subject, drafted, registrar) for drafted, variant in compiled.variants
        )
        base = compiled.subject.plan
        judges = build_judges(base, [judge for check in draft.checks if (judge := check.judge()) is not None])
        judge_ir_hash = registered(registrar, judges.plan)
        sources = SnapshotSources(
            experiment_sha256=draft.experiment_sha256,
            dataset_sha256=draft.dataset.file_hash,
            tree=state.tree,
            media_folders=media_folders(loaded_project(state.report)),
            engine_version=self.engine_version,
        )
        return PlannedSeries(
            draft=draft,
            choice=choice,
            subject=compiled.subject,
            variants=variants,
            judges=judges,
            checks=tuple(check.plan(judges) for check in draft.checks),
            snapshot=series_snapshot(sources, choice.cases, variants, judges),
            package=package,
            judge_ir_hash=judge_ir_hash,
        )
