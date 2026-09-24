import asyncio
import logging
from collections.abc import AsyncGenerator, AsyncIterator, Callable, Coroutine, Mapping, Sequence
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from functools import partial
from typing import Final, Protocol

from fastapi import FastAPI

from aqven.app.console_log.events import publish
from aqven.app.console_log.run_lines import RunTranscript, run_line
from aqven.app.console_log.series_lines import SeriesTranscript, series_line, series_started_line
from aqven.app.console_log.spec_lines import spec_line
from aqven.ports.engine import EngineFacade, EventLogQuery, ExecutionQuery, RunListQuery
from aqven.runtime.address import ExecutionAddress, RunId
from aqven.runtime.events import NodeAttemptFailed, RunEvent
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
from aqven.series.model import LaunchPlan, SeriesId
from aqven.series.ports import SeriesJobs
from aqven.series.views import (
    LaunchRequest,
    SeriesCancelRequest,
    SeriesCaseRow,
    SeriesCasesQuery,
    SeriesEvent,
    SeriesFinishedEvent,
    SeriesGetRequest,
    SeriesGetResult,
    SeriesListQuery,
    SeriesStarted,
    SeriesStartRequest,
    SeriesSummaryView,
)
from aqven.server.app import server_context
from aqven.server.spec_channel import SpecEventHub
from aqven.server.workspace import ProjectWorkspace
from aqven.spec import AgentId, ExperimentId, FlowId
from aqven.write.model import WriteActor

LOGGER: Final = logging.getLogger("aqven.dev")

type FollowWork = Callable[[], Coroutine[object, object, None]]


def utc_now() -> datetime:
    return datetime.now(UTC)


class AgentFiles(Protocol):
    async def file_of(self, agent: str) -> str | None: ...


@dataclass(frozen=True, slots=True)
class NoAgentFiles:
    async def file_of(self, agent: str) -> str | None:
        return None


@dataclass(frozen=True, slots=True)
class WorkspaceAgentFiles:
    workspace: ProjectWorkspace

    async def file_of(self, agent: str) -> str | None:
        compiled = (await self.workspace.state()).compiled
        found = None if compiled is None else compiled.agents.get(AgentId(agent))
        return None if found is None else found.file


@dataclass(slots=True)
class Followers:
    tasks: set[asyncio.Task[None]] = field(default_factory=set[asyncio.Task[None]])
    keys: set[str] = field(default_factory=set[str])

    def spawn(self, key: str, work: FollowWork) -> None:
        if key in self.keys:
            return
        self.keys.add(key)
        task = asyncio.get_running_loop().create_task(work())
        self.tasks.add(task)
        task.add_done_callback(partial(self.finished, key))

    def finished(self, key: str, task: asyncio.Task[None]) -> None:
        self.tasks.discard(task)
        self.keys.discard(key)

    async def close(self) -> None:
        pending = tuple(self.tasks)
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)


@dataclass(frozen=True, slots=True)
class RunWatch:
    engine: EngineFacade
    followers: Followers
    agent_files: AgentFiles = field(default_factory=NoAgentFiles)
    studio_url: str | None = None

    def follow(self, run_id: RunId, quiet_until: datetime | None = None) -> None:
        transcript = RunTranscript(run_id=run_id, studio_url=self.run_url(run_id), quiet_until=quiet_until)
        self.followers.spawn(f"run:{run_id}", partial(self.print_run, transcript))

    def run_url(self, run_id: RunId) -> str | None:
        return None if self.studio_url is None else f"{self.studio_url.rstrip('/')}/runs/{run_id}"

    async def print_run(self, transcript: RunTranscript) -> None:
        try:
            async for event in self.engine.run_events(transcript.run_id, 0):
                await self.note_agent_file(event, transcript)
                line = run_line(event, transcript)
                if line is not None:
                    publish(line)
        except Exception as error:
            LOGGER.debug("stopped following run %s: %s", transcript.run_id, error)

    async def note_agent_file(self, event: RunEvent, transcript: RunTranscript) -> None:
        if not isinstance(event, NodeAttemptFailed):
            return
        agent = transcript.agent_at(event.address, event.cause.details)
        if agent is None or agent in transcript.agent_files:
            return
        found = await self.agent_files.file_of(agent)
        if found is not None:
            transcript.agent_files[agent] = found


@dataclass(frozen=True, slots=True)
class ObservedEngineFacade:
    inner: EngineFacade
    watch: RunWatch

    async def start_run(self, request: RunStartRequest, *, dataset_item_id: str | None = None) -> RunStarted:
        started = await self.inner.start_run(request, dataset_item_id=dataset_item_id)
        self.watch.follow(started.run_id)
        return started

    async def get_run(self, run_id: RunId) -> RunSnapshot:
        return await self.inner.get_run(run_id)

    async def list_runs(self, query: RunListQuery) -> Page[RunSummary]:
        return await self.inner.list_runs(query)

    async def latest_runs(self, flow_ids: Sequence[FlowId]) -> Mapping[FlowId, RunSummary]:
        return await self.inner.latest_runs(flow_ids)

    def run_events(self, run_id: RunId, after_seq: int = 0) -> AsyncIterator[RunEvent]:
        return self.inner.run_events(run_id, after_seq)

    async def event_log(self, run_id: RunId, query: EventLogQuery) -> Page[RunEvent]:
        return await self.inner.event_log(run_id, query)

    async def list_executions(self, run_id: RunId, query: ExecutionQuery) -> tuple[NodeExecution, ...]:
        return await self.inner.list_executions(run_id, query)

    async def get_execution(
        self,
        run_id: RunId,
        address: ExecutionAddress,
        include_payloads: IncludePayloads = "truncated",
    ) -> ExecutionDetail:
        return await self.inner.get_execution(run_id, address, include_payloads)

    async def present_run(self, run_id: RunId, request: PresentationRequest) -> PresentationResponse:
        return await self.inner.present_run(run_id, request)

    async def resume(self, run_id: RunId, request: ResumeRequest) -> ResumeResult:
        since = utc_now()
        result = await self.inner.resume(run_id, request)
        self.watch.follow(run_id, quiet_until=since)
        return result

    async def fork(self, run_id: RunId, request: ForkRequest) -> RunForked:
        forked = await self.inner.fork(run_id, request)
        self.watch.follow(forked.run_id)
        return forked

    async def cancel(self, run_id: RunId, request: CancelRequest) -> CancelResult:
        return await self.inner.cancel(run_id, request)

    async def waits(self, run_id: RunId) -> tuple[HumanWait, ...]:
        return await self.inner.waits(run_id)

    async def wait_detail(self, run_id: RunId, address: ExecutionAddress) -> HumanWaitDetail:
        return await self.inner.wait_detail(run_id, address)


@dataclass(frozen=True, slots=True)
class SeriesWatch:
    jobs: SeriesJobs
    followers: Followers
    studio_url: str | None = None

    def series_url(self, series_id: SeriesId) -> str | None:
        return None if self.studio_url is None else f"{self.studio_url.rstrip('/')}/research/series/{series_id}"

    def follow(self, started: SeriesStarted) -> None:
        transcript = SeriesTranscript(series_id=started.series_id, studio_url=self.series_url(started.series_id))
        key = f"series:{started.series_id}"
        if key in self.followers.keys:
            return
        publish(series_started_line(started, transcript))
        self.followers.spawn(key, partial(self.print_series, transcript))

    async def print_series(self, transcript: SeriesTranscript) -> None:
        try:
            async for event in self.jobs.events(transcript.series_id, 0):
                await self.note_verdict(event, transcript)
                line = series_line(event, transcript)
                if line is not None:
                    publish(line)
        except Exception as error:
            LOGGER.debug("stopped following series %s: %s", transcript.series_id, error)

    async def note_verdict(self, event: SeriesEvent, transcript: SeriesTranscript) -> None:
        if not isinstance(event, SeriesFinishedEvent):
            return
        try:
            result = await self.jobs.get(SeriesGetRequest(series_id=transcript.series_id))
        except Exception as error:
            LOGGER.debug("no verdict text for series %s: %s", transcript.series_id, error)
            return
        verdict = result.series.verdict
        transcript.verdict_text = None if verdict is None else verdict.text


@dataclass(frozen=True, slots=True)
class ObservedSeriesJobs:
    inner: SeriesJobs
    watch: SeriesWatch

    async def launch_plan(self, experiment_id: ExperimentId, request: LaunchRequest) -> LaunchPlan:
        return await self.inner.launch_plan(experiment_id, request)

    async def start(self, request: SeriesStartRequest, actor: WriteActor) -> SeriesStarted:
        started = await self.inner.start(request, actor)
        self.watch.follow(started)
        return started

    async def get(self, request: SeriesGetRequest) -> SeriesGetResult:
        return await self.inner.get(request)

    async def list(self, query: SeriesListQuery) -> Page[SeriesSummaryView]:
        return await self.inner.list(query)

    async def cases(self, series_id: SeriesId, query: SeriesCasesQuery) -> tuple[SeriesCaseRow, ...]:
        return await self.inner.cases(series_id, query)

    async def approve(
        self, series_id: SeriesId, actor: WriteActor, cap_usd: Decimal | None = None
    ) -> SeriesSummaryView:
        return await self.inner.approve(series_id, actor, cap_usd)

    async def cancel(self, request: SeriesCancelRequest) -> SeriesSummaryView:
        return await self.inner.cancel(request)

    def events(self, series_id: SeriesId, after_seq: int) -> AsyncIterator[SeriesEvent]:
        return self.inner.events(series_id, after_seq)


async def print_spec_changes(hub: SpecEventHub) -> None:
    try:
        async for event in hub.follow(hub.seq):
            line = spec_line(event)
            if line is not None:
                publish(line)
    except Exception as error:
        LOGGER.debug("stopped following spec changes: %s", error)


@asynccontextmanager
async def console_lifespan(followers: Followers, app: FastAPI) -> AsyncGenerator[None]:
    followers.spawn("spec", partial(print_spec_changes, server_context(app).hub))
    try:
        yield
    finally:
        await followers.close()
