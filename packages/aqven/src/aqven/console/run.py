import asyncio
import sys
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Final, TextIO

from pydantic import BaseModel, TypeAdapter, ValidationError

from aqven.app.locations import ProjectState, StudioState, studio_data_dir
from aqven.app.settings_store import open_settings_store
from aqven.console.formats import EventFormat
from aqven.console.llm_errors import cause_lines, error_lines
from aqven.diagnostics import format_text
from aqven.engine import configure_local_engines, shutdown_local_engines
from aqven.engine.assembly import standard_engine_setup
from aqven.ports.engine import EngineError
from aqven.runtime import (
    CassetteConfig,
    CassetteMode,
    FlowHandle,
    FlowNotFound,
    HumanWait,
    NodeAttemptFailed,
    NodeFinished,
    NodeOutputDelta,
    NodeStarted,
    NodeSuspended,
    Project,
    ProjectInvalid,
    Run,
    RunContext,
    RunEvent,
    RunFinished,
    RunOptions,
    ScriptedAnswer,
)

EXIT_OK: Final = 0
EXIT_FAILED: Final = 1
EXIT_SUSPENDED: Final = 3
SUSPENSION_POLL_SECONDS: Final = 0.5
SUSPENSION_CONFIRMATIONS: Final = 2
ANSWERS_ADAPTER: Final[TypeAdapter[tuple[ScriptedAnswer, ...]]] = TypeAdapter(tuple[ScriptedAnswer, ...])


@dataclass(frozen=True, slots=True)
class FlowRunRequest:
    root: Path
    flow_id: str
    input_file: Path
    context: tuple[tuple[str, str], ...] = ()
    answers_file: Path | None = None
    cassettes: Path | None = None
    cassette_mode: CassetteMode = CassetteMode.REPLAY_STRICT
    event_format: EventFormat = EventFormat.TEXT
    data_dir: Path | None = None


def address_label(event: NodeStarted | NodeFinished | NodeOutputDelta | NodeSuspended | NodeAttemptFailed) -> str:
    address = event.address
    context = [
        f"{name}={value}"
        for name, value in (
            ("branch", address.branch_key),
            ("iteration", address.iteration),
            ("item", address.item_index),
        )
        if value is not None
    ]
    return f"{address.node_id}[{', '.join(context)}]" if context else address.node_id


def render_started(event: RunEvent) -> str | None:
    if not isinstance(event, NodeStarted):
        return None
    return f"▶ {address_label(event)}"


def render_finished(event: RunEvent) -> str | None:
    if not isinstance(event, NodeFinished):
        return None
    model = f" {event.model}" if event.model else ""
    head = f"■ {address_label(event)} {event.status}{model} {event.latency_ms} ms"
    if event.error is None:
        return head
    return "\n".join((f"{head} {event.error.code}: {event.error.message}", *error_lines(event.error)))


def render_attempt_failed(event: RunEvent) -> str | None:
    if not isinstance(event, NodeAttemptFailed):
        return None
    cause = event.cause
    head = f"↻ {address_label(event)} attempt {event.attempt} {cause.code or cause.kind}: {cause.message}"
    return "\n".join((f"{head} (next: {event.action})", *cause_lines(cause)))


def render_delta(event: RunEvent) -> str | None:
    if not isinstance(event, NodeOutputDelta):
        return None
    return f"  {address_label(event)} {event.part_kind}: {event.delta}"


def render_suspended(event: RunEvent) -> str | None:
    if not isinstance(event, NodeSuspended):
        return None
    return f"⏸ {address_label(event)} waits for {event.wait_kind} {event.form_type_id} ({event.assignee})"


def render_run_finished(event: RunEvent) -> str | None:
    if not isinstance(event, RunFinished):
        return None
    error = f" {event.error.code}: {event.error.message}" if event.error is not None else ""
    head = f"● run {event.status}{error} cost ${event.cost_usd} tokens {event.tokens_in}/{event.tokens_out}"
    if event.error is None:
        return head
    return "\n".join((head, *error_lines(event.error)))


def render_other(event: RunEvent) -> str | None:
    return f"· {event.type}"


TEXT_RENDERERS: Final[tuple[Callable[[RunEvent], str | None], ...]] = (
    render_started,
    render_finished,
    render_attempt_failed,
    render_delta,
    render_suspended,
    render_run_finished,
    render_other,
)


def text_line(event: RunEvent) -> str:
    return next(line for line in (renderer(event) for renderer in TEXT_RENDERERS) if line is not None)


def json_line(event: RunEvent) -> str:
    return event.model_dump_json(by_alias=True)


EVENT_LINES: Final[Mapping[EventFormat, Callable[[RunEvent], str]]] = {
    EventFormat.TEXT: text_line,
    EventFormat.JSON: json_line,
}


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
    )


@dataclass(slots=True)
class EventPrinter:
    line: Callable[[RunEvent], str]
    out: TextIO

    async def follow(self, run: Run[BaseModel]) -> RunFinished | None:
        async for event in run.events():
            print(self.line(event), file=self.out, flush=True)
            if isinstance(event, RunFinished):
                return event
        return None


async def open_waits(run: Run[BaseModel]) -> tuple[HumanWait, ...]:
    return tuple(wait for wait in await run.waits() if wait.state == "waiting")


async def settled_suspension(run: Run[BaseModel]) -> tuple[HumanWait, ...]:
    confirmations = 0
    while confirmations < SUSPENSION_CONFIRMATIONS:
        await asyncio.sleep(SUSPENSION_POLL_SECONDS)
        waits = await open_waits(run)
        confirmations = confirmations + 1 if waits else 0
    return await open_waits(run)


def print_waits(waits: tuple[HumanWait, ...], out: TextIO) -> None:
    for wait in waits:
        address = wait.address.model_dump_json()
        print(f"run is waiting for an answer: {address} attempt {wait.attempt} form {wait.form_type_id}", file=out)


async def watch_run(run: Run[BaseModel], printer: EventPrinter) -> int:
    following = asyncio.create_task(printer.follow(run))
    suspension = asyncio.create_task(settled_suspension(run))
    done, _ = await asyncio.wait((following, suspension), return_when=asyncio.FIRST_COMPLETED)
    following.cancel()
    suspension.cancel()
    if following in done and following.exception() is None:
        finished = following.result()
        return EXIT_OK if finished is not None and finished.status == "completed" else EXIT_FAILED
    print_waits(suspension.result() if suspension in done else (), printer.out)
    return EXIT_SUSPENDED


async def start_flow(flow: FlowHandle[BaseModel, BaseModel], request: FlowRunRequest) -> Run[BaseModel]:
    flow_input = flow.input_model.model_validate_json(request.input_file.read_bytes())
    return await flow.start(flow_input, run_options(request))


async def run_flow(request: FlowRunRequest, out: TextIO = sys.stdout, err: TextIO = sys.stderr) -> int:
    try:
        project = Project.load(request.root)
        flow = project.flow(request.flow_id)
    except ProjectInvalid as error:
        print(format_text(error.report.diagnostics), file=err)
        return EXIT_FAILED
    except FlowNotFound as error:
        print(str(error), file=err)
        return EXIT_FAILED
    studio = StudioState(studio_data_dir(request.data_dir))
    studio.ensure()
    state = ProjectState(project.root)
    state.ensure()
    configure_local_engines(standard_engine_setup(settings=open_settings_store(state, studio)))
    try:
        run = await start_flow(flow, request)
        print(f"run {run.run_id}", file=err, flush=True)
        return await watch_run(run, EventPrinter(EVENT_LINES[request.event_format], out))
    except (ValidationError, OSError, EngineError) as error:
        print(str(error), file=err)
        return EXIT_FAILED
    finally:
        shutdown_local_engines()
