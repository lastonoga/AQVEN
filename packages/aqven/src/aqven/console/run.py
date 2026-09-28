import sys
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Protocol, TextIO

from pydantic import BaseModel, TypeAdapter, ValidationError

from aqven.app.locations import ProjectState, StudioState, studio_data_dir
from aqven.app.prices import LazyPriceLookup
from aqven.app.runtime_file import ServerRecord
from aqven.app.settings_store import open_settings_store
from aqven.app.workers import configured_workers
from aqven.console.command import EXIT_USAGE, PROGRAM
from aqven.console.formats import EventFormat
from aqven.console.run_server import ProjectServers, ServerLookup, ServerRunner
from aqven.console.run_watch import EXIT_FAILED, event_printer, watch_run
from aqven.diagnostics import format_text
from aqven.engine import configure_local_engines, shutdown_local_engines
from aqven.engine.assembly import standard_engine_setup
from aqven.ports.engine import EngineError
from aqven.runtime import (
    CassetteConfig,
    CassetteMode,
    FlowHandle,
    FlowNotFound,
    Project,
    ProjectInvalid,
    Run,
    RunContext,
    RunOptions,
    RunStartRequest,
    ScriptedAnswer,
)
from aqven.spec import AgentId, NodeId

COMMAND: Final = "run"
ANSWERS_ADAPTER: Final[TypeAdapter[tuple[ScriptedAnswer, ...]]] = TypeAdapter(tuple[ScriptedAnswer, ...])


@dataclass(frozen=True, slots=True)
class FlowRunRequest:
    root: Path
    flow_id: str
    input_file: Path
    context: tuple[tuple[str, str], ...] = ()
    agents: tuple[tuple[str, str], ...] = ()
    answers_file: Path | None = None
    cassettes: Path | None = None
    cassette_mode: CassetteMode = CassetteMode.REPLAY_STRICT
    event_format: EventFormat = EventFormat.TEXT
    data_dir: Path | None = None
    max_parallel: int | None = None


def run_context(entries: Sequence[tuple[str, str]]) -> RunContext | None:
    if not entries:
        return None
    return RunContext.model_validate(dict(entries))


def run_options(request: FlowRunRequest) -> RunOptions:
    answers = () if request.answers_file is None else ANSWERS_ADAPTER.validate_json(request.answers_file.read_bytes())
    cassettes = (
        None if request.cassettes is None else CassetteConfig(directory=request.cassettes, mode=request.cassette_mode)
    )
    mode = "replay" if cassettes is not None and cassettes.mode == CassetteMode.REPLAY_STRICT else "live"
    return RunOptions(
        mode=mode,
        context=run_context(request.context),
        human_answers=answers,
        cassettes=cassettes,
        agent_overrides={NodeId(node): AgentId(agent) for node, agent in request.agents},
    )


async def start_flow(flow: FlowHandle[BaseModel, BaseModel], request: FlowRunRequest) -> Run[BaseModel]:
    flow_input = flow.input_model.model_validate_json(request.input_file.read_bytes())
    return await flow.start(flow_input, run_options(request))


def server_start(flow: FlowHandle[BaseModel, BaseModel], request: FlowRunRequest) -> RunStartRequest:
    flow_input = flow.input_model.model_validate_json(request.input_file.read_bytes())
    options = run_options(request)
    return RunStartRequest(
        flow_id=flow.flow_id,
        mode=options.mode,
        context=options.context,
        input=flow_input.model_dump(mode="json", by_alias=True),
        human_answers=options.human_answers or None,
        agent_overrides=dict(options.agent_overrides),
    )


def engine_only_options(request: FlowRunRequest) -> tuple[str, ...]:
    given = (("--max-parallel", request.max_parallel is not None), ("--data-dir", request.data_dir is not None))
    return tuple(option for option, present in given if present)


class FlowLauncher(Protocol):
    async def launch(
        self, flow: FlowHandle[BaseModel, BaseModel], request: FlowRunRequest, out: TextIO, err: TextIO
    ) -> int: ...


@dataclass(frozen=True, slots=True)
class LocalLauncher:
    async def launch(
        self, flow: FlowHandle[BaseModel, BaseModel], request: FlowRunRequest, out: TextIO, err: TextIO
    ) -> int:
        studio = StudioState(studio_data_dir(request.data_dir))
        studio.ensure()
        state = ProjectState(flow.project.root)
        state.ensure()
        settings = open_settings_store(state, studio)
        workers = request.max_parallel if request.max_parallel is not None else await configured_workers(settings)
        configure_local_engines(
            standard_engine_setup(settings=settings, max_parallel=workers, prices=LazyPriceLookup())
        )
        try:
            run = await start_flow(flow, request)
            print(f"run {run.run_id}", file=err, flush=True)
            return await watch_run(run, event_printer(request.event_format, out))
        except (ValidationError, OSError, EngineError) as error:
            print(str(error), file=err)
            return EXIT_FAILED
        finally:
            shutdown_local_engines()


@dataclass(frozen=True, slots=True)
class ServerLauncher:
    record: ServerRecord

    async def launch(
        self, flow: FlowHandle[BaseModel, BaseModel], request: FlowRunRequest, out: TextIO, err: TextIO
    ) -> int:
        if request.cassettes is not None:
            print(
                f"{PROGRAM} {COMMAND}: --cassettes replays on an engine of its own, and the project server "
                f"{self.record.url} runs on this root: stop the server first, or run without --cassettes",
                file=err,
            )
            return EXIT_USAGE
        ignored = engine_only_options(request)
        if ignored:
            print(f"{PROGRAM} {COMMAND}: {', '.join(ignored)} left out: the project server uses its settings", file=err)
        try:
            start = server_start(flow, request)
        except (ValidationError, OSError) as error:
            print(str(error), file=err)
            return EXIT_FAILED
        return await ServerRunner(self.record, err).run(start, event_printer(request.event_format, out))


def launcher_for(record: ServerRecord | None) -> FlowLauncher:
    if record is None:
        return LocalLauncher()
    return ServerLauncher(record)


async def run_flow(
    request: FlowRunRequest,
    out: TextIO = sys.stdout,
    err: TextIO = sys.stderr,
    servers: ServerLookup | None = None,
) -> int:
    try:
        project = Project.load(request.root)
        flow = project.flow(request.flow_id)
    except ProjectInvalid as error:
        print(format_text(error.report.diagnostics), file=err)
        return EXIT_FAILED
    except FlowNotFound as error:
        print(str(error), file=err)
        return EXIT_FAILED
    record = await (servers or ProjectServers()).live(request.root)
    return await launcher_for(record).launch(flow, request, out, err)
