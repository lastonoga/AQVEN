import asyncio
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Final
from uuid import uuid7

from pydantic import Field

from aqven.app.locations import ProjectState
from aqven.engine.facade import DbosEngineFacade
from aqven.engine.request import RunRecord, run_spec_of
from aqven.engine.runtime import NO_OVERRIDES
from aqven.evals import (
    DatasetNotFound,
    DatasetSummary,
    EvalNotFound,
    EvalOptions,
    EvalPlan,
    EvalRunId,
    EvalRunRecord,
    EvalSummary,
    FlowLauncher,
    SqliteEvalStore,
    build_eval_plan,
    run_eval,
)
from aqven.evals.gate import GateReport
from aqven.evals.store import EvalStore
from aqven.ir import CompiledProject
from aqven.loader import LoadedProject
from aqven.runtime import Project, ProjectInvalid, RunOptions
from aqven.runtime.address import JsonObject, RequestModel, RunId
from aqven.runtime.runs import RunStarted
from aqven.server.context import ServerContext
from aqven.server.errors import ApiFailure, not_found
from aqven.server.views.common import loaded_project
from aqven.server.workspace import WorkspaceState
from aqven.spec import DatasetId, EvalId, FlowId

SPLIT_KEY: Final = "split"
UNKNOWN_SPLIT: Final = "unassigned"
POLL_PATH: Final = "/api/eval-runs/"


class EvalRunRequest(RequestModel):
    eval_id: EvalId
    dataset_id: DatasetId | None = None
    baseline_run_id: EvalRunId | None = None
    repeats: Annotated[int, Field(ge=1, le=20)] | None = None


class EvalRunAccepted(RequestModel):
    eval_run_id: EvalRunId
    eval_id: EvalId
    status: str
    poll: str


@dataclass(frozen=True, slots=True)
class FacadeLauncher:
    facade: DbosEngineFacade

    async def start(
        self, plan: CompiledProject, flow_id: FlowId, flow_input: JsonObject, options: RunOptions
    ) -> RunStarted:
        return await self.facade.launch(plan, run_spec_of(flow_id, options), flow_input, NO_OVERRIDES)

    async def result(self, run_id: RunId) -> RunRecord:
        return await self.facade.result(run_id)


def eval_summaries(state: WorkspaceState) -> tuple[EvalSummary, ...]:
    project = loaded_project(state)
    return tuple(
        EvalSummary(
            eval_id=eval_id,
            path=source.path,
            file_hash=source.file_hash,
            description=source.spec.description,
            inference=source.spec.inference,
            agent=source.spec.agent,
            dataset=source.spec.dataset,
            scorers=tuple(scorer.id for scorer in source.spec.scorers),
            has_gate=source.spec.gate is not None,
            has_optimization=source.spec.optimization is not None,
        )
        for eval_id, source in sorted(project.evals.items())
    )


def eval_summary(state: WorkspaceState, eval_id: str) -> EvalSummary:
    found = next((row for row in eval_summaries(state) if row.eval_id == eval_id), None)
    if found is None:
        raise not_found(f"eval {eval_id} is not in the project")
    return found


def split_counts(project: LoadedProject, dataset_id: DatasetId) -> dict[str, int]:
    source = project.datasets[dataset_id]
    counts: dict[str, int] = {}
    for case in source.spec.cases:
        metadata = case.metadata or {}
        split = metadata.get(SPLIT_KEY)
        name = split if isinstance(split, str) else UNKNOWN_SPLIT
        counts[name] = counts.get(name, 0) + 1
    return counts


def dataset_users(project: LoadedProject) -> Mapping[DatasetId, tuple[EvalId, ...]]:
    found: dict[DatasetId, list[EvalId]] = {}
    for eval_id, source in sorted(project.evals.items()):
        found.setdefault(source.spec.dataset, []).append(eval_id)
    return {dataset_id: tuple(items) for dataset_id, items in found.items()}


def dataset_summaries(state: WorkspaceState) -> tuple[DatasetSummary, ...]:
    project = loaded_project(state)
    users = dataset_users(project)
    return tuple(
        DatasetSummary(
            dataset_id=dataset_id,
            flow_id=source.spec.flow,
            path=source.path,
            file_hash=source.file_hash,
            cases=len(source.spec.cases),
            splits=split_counts(project, dataset_id),
            used_by=users.get(dataset_id, ()),
        )
        for dataset_id, source in sorted(project.datasets.items())
    )


def dataset_summary(state: WorkspaceState, dataset_id: str) -> DatasetSummary:
    found = next((row for row in dataset_summaries(state) if row.dataset_id == dataset_id), None)
    if found is None:
        raise not_found(f"dataset {dataset_id} is not in the project")
    return found


def project_store(root: Path) -> EvalStore:
    state = ProjectState(root)
    state.ensure()
    return SqliteEvalStore.open(state.database)


def launcher_of(context: ServerContext) -> FlowLauncher:
    facade = context.facade
    if not isinstance(facade, DbosEngineFacade):
        raise ApiFailure("NOT_RUNNABLE", "this engine cannot run evals: no durable flow launcher")
    return FacadeLauncher(facade)


def loaded_eval_project(state: WorkspaceState) -> Project:
    try:
        return Project.from_report(state.report)
    except ProjectInvalid as invalid:
        raise ApiFailure("BLOCKING_PROBLEMS", "the project does not compile: run aqven check") from invalid


def accepted(record: EvalRunRecord) -> EvalRunAccepted:
    return EvalRunAccepted(
        eval_run_id=record.eval_run_id,
        eval_id=record.eval_id,
        status=record.status,
        poll=f"{POLL_PATH}{record.eval_run_id}",
    )


@dataclass(slots=True)
class EvalJobs:
    context: ServerContext
    store: EvalStore | None = None
    tasks: set[asyncio.Task[None]] = field(default_factory=set[asyncio.Task[None]])

    def opened(self) -> EvalStore:
        if self.store is None:
            self.store = project_store(self.context.workspace.root)
        return self.store

    async def run(self, eval_run_id: EvalRunId) -> EvalRunRecord:
        record = await self.opened().run(eval_run_id)
        if record is None:
            raise not_found(f"eval run {eval_run_id} is not in the project database")
        return record

    async def gate(self, eval_run_id: EvalRunId) -> GateReport:
        record = await self.run(eval_run_id)
        if record.gate is None:
            raise not_found(f"eval run {eval_run_id} has no gate report: it ran without a baseline")
        return record.gate

    async def start(self, request: EvalRunRequest) -> EvalRunRecord:
        state = await self.context.workspace.state()
        project = loaded_eval_project(state)
        plan = self._plan(project, request)
        record = EvalRunRecord(
            eval_run_id=EvalRunId(str(uuid7())),
            eval_id=plan.eval_id,
            dataset_id=plan.dataset_id,
            inference=plan.spec.inference,
            agent=plan.spec.agent,
            status="running",
            started_at=datetime.now(UTC),
            repeats=request.repeats or plan.repeats,
            baseline_run_id=request.baseline_run_id,
        )
        store = self.opened()
        await store.save_run(record)
        task = asyncio.create_task(self._run(project, record, request))
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)
        return record

    def _plan(self, project: Project, request: EvalRunRequest) -> EvalPlan:
        try:
            return build_eval_plan(project, request.eval_id, request.dataset_id)
        except (EvalNotFound, DatasetNotFound) as missing:
            raise not_found(str(missing)) from missing

    async def _run(self, project: Project, record: EvalRunRecord, request: EvalRunRequest) -> None:
        store = self.opened()
        try:
            await run_eval(project, record.eval_id, self._options(record, request, store))
        except Exception as error:
            update = {
                "status": "failed",
                "error": f"{type(error).__name__}: {error}",
                "finished_at": datetime.now(UTC),
            }
            await store.save_run(record.model_copy(update=update))

    def _options(self, record: EvalRunRecord, request: EvalRunRequest, store: EvalStore) -> EvalOptions:
        return EvalOptions(
            dataset_id=request.dataset_id,
            baseline_run_id=request.baseline_run_id,
            repeats=request.repeats,
            store=store,
            eval_run_id=record.eval_run_id,
            launcher=launcher_of(self.context),
        )
