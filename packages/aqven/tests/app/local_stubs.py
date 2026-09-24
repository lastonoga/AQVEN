from collections.abc import AsyncIterator, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final, NoReturn

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, PlainTextResponse, Response
from starlette.routing import Route
from starlette.types import ASGIApp

from aqven.app.engine_host import EngineLaunch
from aqven.app.runtime import ApplicationLaunch
from aqven.ports.engine import EngineFacade, EventLogQuery, ExecutionQuery, RunListQuery
from aqven.runtime.address import ExecutionAddress, RunId
from aqven.runtime.events import RunEvent
from aqven.runtime.executions import ExecutionDetail, NodeExecution
from aqven.runtime.human import HumanWait, HumanWaitDetail, ResumeRequest, ResumeResult
from aqven.runtime.presentation import PresentationRequest, PresentationResponse
from aqven.runtime.runs import (
    CancelRequest,
    CancelResult,
    ForkRequest,
    Page,
    RunForked,
    RunSnapshot,
    RunStarted,
    RunStartRequest,
    RunSummary,
)
from aqven.runtime.vocabulary import IncludePayloads
from aqven.spec import FlowId

ENGINE_LOG: Final = "engine-events.log"
PROJECT_FILE: Final = "aqven.yaml"


def unused() -> NoReturn:
    raise NotImplementedError("engine is not called in server tests")


class UnusedEngineFacade:
    async def start_run(self, request: RunStartRequest, *, dataset_item_id: str | None = None) -> RunStarted:
        unused()

    async def get_run(self, run_id: RunId) -> RunSnapshot:
        unused()

    async def list_runs(self, query: RunListQuery) -> Page[RunSummary]:
        unused()

    async def latest_runs(self, flow_ids: Sequence[FlowId]) -> Mapping[FlowId, RunSummary]:
        unused()

    def run_events(self, run_id: RunId, after_seq: int = 0) -> AsyncIterator[RunEvent]:
        unused()

    async def event_log(self, run_id: RunId, query: EventLogQuery) -> Page[RunEvent]:
        unused()

    async def list_executions(self, run_id: RunId, query: ExecutionQuery) -> tuple[NodeExecution, ...]:
        unused()

    async def get_execution(
        self,
        run_id: RunId,
        address: ExecutionAddress,
        include_payloads: IncludePayloads = "truncated",
    ) -> ExecutionDetail:
        unused()

    async def present_run(self, run_id: RunId, request: PresentationRequest) -> PresentationResponse:
        unused()

    async def resume(self, run_id: RunId, request: ResumeRequest) -> ResumeResult:
        unused()

    async def fork(self, run_id: RunId, request: ForkRequest) -> RunForked:
        unused()

    async def cancel(self, run_id: RunId, request: CancelRequest) -> CancelResult:
        unused()

    async def waits(self, run_id: RunId) -> tuple[HumanWait, ...]:
        unused()

    async def wait_detail(self, run_id: RunId, address: ExecutionAddress) -> HumanWaitDetail:
        unused()


@dataclass(slots=True)
class RecordingEngineHost:
    log_path: Path | None = None
    events: list[str] = field(default_factory=list[str])
    launches: list[EngineLaunch] = field(default_factory=list[EngineLaunch])

    async def start(self, launch: EngineLaunch) -> EngineFacade:
        self.launches.append(launch)
        self._record("start", launch.project_root)
        return UnusedEngineFacade()

    async def stop(self) -> None:
        root = self.launches[-1].project_root
        self._record("stop", root)

    def _record(self, event: str, root: Path) -> None:
        self.events.append(event)
        target = self.log_path or root / ENGINE_LOG
        with target.open("a", encoding="utf-8") as stream:
            stream.write(f"{event}\n")


@dataclass(slots=True)
class EchoApplicationFactory:
    launches: list[ApplicationLaunch] = field(default_factory=list[ApplicationLaunch])

    def build(self, launch: ApplicationLaunch) -> ASGIApp:
        self.launches.append(launch)
        return echo_application(launch)


def echo_application(launch: ApplicationLaunch) -> ASGIApp:
    async def echo(request: Request) -> Response:
        return JSONResponse({"root": str(launch.project_root), "headless": launch.headless})

    async def page(request: Request) -> Response:
        return PlainTextResponse("studio")

    return Starlette(
        routes=[
            Route("/api/echo", echo, methods=["GET", "POST"]),
            Route("/mcp/", echo, methods=["GET", "POST"]),
            Route("/{path:path}", page),
        ]
    )


@dataclass(slots=True)
class RecordingBrowser:
    opened: list[str] = field(default_factory=list[str])

    def open(self, url: str) -> None:
        self.opened.append(url)


@dataclass(slots=True)
class RecordingAnnouncer:
    messages: list[str] = field(default_factory=list[str])

    def announce(self, message: str) -> None:
        self.messages.append(message)


def make_project(folder: Path) -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    (folder / PROJECT_FILE).write_text("package: demo\n", encoding="utf-8")
    return folder.resolve()
