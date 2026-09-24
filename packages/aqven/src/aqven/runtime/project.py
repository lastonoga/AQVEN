import asyncio
from collections.abc import AsyncIterator, Mapping
from dataclasses import dataclass
from importlib.resources import files
from pathlib import Path
from typing import TYPE_CHECKING, Literal, Self

from pydantic import BaseModel, JsonValue

from aqven.diagnostics import format_text
from aqven.runtime.address import ExecutionAddress, RunId
from aqven.runtime.events import RunEvent
from aqven.runtime.human import HumanWait, HumanWaitDetail, ResumeRequest, ResumeResult
from aqven.runtime.options import RunOptions, RunResult
from aqven.runtime.runs import CancelRequest, ForkRequest
from aqven.runtime.vocabulary import RunStatus
from aqven.spec import FlowId, TypeId, TypeModels, TypeSpec, build_type_models, normalized_schema, parse_type_ref

if TYPE_CHECKING:
    from aqven.check import CheckReport
    from aqven.engine.local import LocalEngine
    from aqven.engine.request import RunRecord
    from aqven.ir import CompiledProject
    from aqven.loader import LoadedFlow, LoadedProject

type FlowSide = Literal["input", "output"]


class ProjectInvalid(Exception):
    def __init__(self, report: CheckReport) -> None:
        super().__init__(format_text(report.diagnostics))
        self.report = report


class PackageNotOnDisk(Exception):
    def __init__(self, package: str) -> None:
        super().__init__(f"package {package} is not a directory on disk")
        self.package = package


class FlowNotFound(LookupError):
    def __init__(self, flow_id: str) -> None:
        super().__init__(f"flow {flow_id} is not in the project")
        self.flow_id = flow_id


class FlowSignatureMismatch(TypeError):
    def __init__(self, flow_id: str, sides: tuple[FlowSide, ...]) -> None:
        super().__init__(f"models of flow {flow_id} do not match the schema: {', '.join(sides)}")
        self.flow_id = flow_id
        self.sides = sides


def typed_output[O: BaseModel](model: type[O], record: RunRecord) -> O | None:
    if record.status != "completed" or record.output is None:
        return None
    return model.model_validate(record.output)


@dataclass(frozen=True, slots=True)
class Run[O: BaseModel]:
    run_id: RunId
    output_model: type[O]
    engine: LocalEngine

    async def status(self) -> RunStatus:
        return (await self.engine.facade.get_run(self.run_id)).status

    async def waits(self) -> tuple[HumanWait, ...]:
        return await self.engine.facade.waits(self.run_id)

    async def wait_detail(self, address: ExecutionAddress) -> HumanWaitDetail:
        return await self.engine.facade.wait_detail(self.run_id, address)

    async def resume(self, request: ResumeRequest) -> ResumeResult:
        return await self.engine.facade.resume(self.run_id, request)

    def events(self, after_seq: int = 0) -> AsyncIterator[RunEvent]:
        return self.engine.facade.run_events(self.run_id, after_seq)

    async def result(self) -> RunResult[O]:
        record = await self.engine.result(self.run_id)
        return RunResult(
            run_id=self.run_id,
            status=record.status,
            output=typed_output(self.output_model, record),
            error=record.error,
            cost_usd=record.usage.cost_usd,
            tokens_in=record.usage.tokens_in,
            tokens_out=record.usage.tokens_out,
        )

    async def cancel(self, reason: str) -> RunStatus:
        return (await self.engine.facade.cancel(self.run_id, CancelRequest(reason=reason))).status

    async def fork(self, from_address: ExecutionAddress) -> Run[O]:
        forked = await self.engine.facade.fork(self.run_id, ForkRequest(from_=from_address))
        return Run(run_id=forked.run_id, output_model=self.output_model, engine=self.engine)


@dataclass(frozen=True, slots=True)
class FlowHandle[I: BaseModel, O: BaseModel]:
    flow_id: FlowId
    input_model: type[I]
    output_model: type[O]
    project: Project

    async def run(self, input: I, options: RunOptions | None = None) -> RunResult[O]:
        started = await self.start(input, options)
        return await started.result()

    async def start(self, input: I, options: RunOptions | None = None) -> Run[O]:
        engine = self.project.engine()
        started = await engine.start(self.project.compiled(), self.flow_id, input, options or RunOptions())
        return Run(run_id=started.run_id, output_model=self.output_model, engine=engine)


def record_model(models: TypeModels, type_ref: str) -> type[BaseModel]:
    annotation = models.annotation(parse_type_ref(type_ref))
    if isinstance(annotation, type) and issubclass(annotation, BaseModel):
        return annotation
    return BaseModel


def registry_models(project: LoadedProject) -> TypeModels:
    specs: Mapping[TypeId, TypeSpec] = {type_id: source.spec for type_id, source in project.types.items()}
    return build_type_models(specs)


def registry_schema(models: TypeModels, type_ref: str) -> JsonValue:
    return normalized_schema(models.annotation(parse_type_ref(type_ref)))


@dataclass(frozen=True, slots=True)
class Project:
    root: Path
    report: CheckReport

    @classmethod
    def from_report(cls, report: CheckReport) -> Self:
        project = report.project
        if project is None or not report.ok:
            raise ProjectInvalid(report)
        return cls(root=project.root, report=report)

    @classmethod
    def load(cls, root: Path) -> Self:
        from aqven.check import check_project

        return cls.from_report(check_project(root))

    @classmethod
    def from_package(cls, package: str) -> Self:
        location = files(package)
        if not isinstance(location, Path):
            raise PackageNotOnDisk(package)
        return cls.load(location)

    def flow(self, flow_id: str) -> FlowHandle[BaseModel, BaseModel]:
        source = self.loaded_flow(flow_id).source
        if source is None:
            return FlowHandle(flow_id=FlowId(flow_id), input_model=BaseModel, output_model=BaseModel, project=self)
        models = registry_models(self.loaded_project())
        return FlowHandle(
            flow_id=FlowId(flow_id),
            input_model=record_model(models, source.spec.input),
            output_model=record_model(models, source.spec.output),
            project=self,
        )

    def flow_typed[I: BaseModel, O: BaseModel](
        self,
        flow_id: str,
        input_model: type[I],
        output_model: type[O],
    ) -> FlowHandle[I, O]:
        handle = FlowHandle(flow_id=FlowId(flow_id), input_model=input_model, output_model=output_model, project=self)
        source = self.loaded_flow(flow_id).source
        if source is None:
            return handle
        models = registry_models(self.loaded_project())
        sides: tuple[tuple[FlowSide, type[BaseModel], str], ...] = (
            ("input", input_model, source.spec.input),
            ("output", output_model, source.spec.output),
        )
        mismatched: tuple[FlowSide, ...] = tuple(
            side for side, model, type_ref in sides if normalized_schema(model) != registry_schema(models, type_ref)
        )
        if mismatched:
            raise FlowSignatureMismatch(flow_id, mismatched)
        return handle

    def loaded_project(self) -> LoadedProject:
        project = self.report.project
        if project is None:
            raise ProjectInvalid(self.report)
        return project

    def engine(self) -> LocalEngine:
        from aqven.engine.local import local_engine

        engine = local_engine(self.root)
        if engine.plan_source is None:
            engine.plan_source = ProjectPlanSource(self.root)
        return engine

    def compiled(self) -> CompiledProject:
        from aqven.compiler import compile_project

        return compile_project(self.report)

    def loaded_flow(self, flow_id: str) -> LoadedFlow:
        loaded = self.loaded_project().flows.get(FlowId(flow_id))
        if loaded is None:
            raise FlowNotFound(flow_id)
        return loaded


@dataclass(frozen=True, slots=True)
class ProjectPlanSource:
    root: Path

    async def current(self) -> CompiledProject:
        from aqven.compiler import compile_root

        return await asyncio.to_thread(compile_root, self.root)
