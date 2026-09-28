import asyncio
from collections.abc import AsyncIterator, Callable, Mapping
from dataclasses import dataclass
from typing import Final, Protocol, TextIO

from aqven.console.formats import EventFormat
from aqven.console.llm_errors import cause_lines, error_lines
from aqven.runtime import (
    HumanWait,
    MapItemRecovered,
    NodeAttemptFailed,
    NodeFinished,
    NodeOutputDelta,
    NodeStarted,
    NodeSuspended,
    RunEvent,
    RunFinished,
)

EXIT_OK: Final = 0
EXIT_FAILED: Final = 1
EXIT_SUSPENDED: Final = 3
SUSPENSION_POLL_SECONDS: Final = 0.5
SUSPENSION_CONFIRMATIONS: Final = 2
COMPLETED: Final = "completed"


type AddressedEvent = (
    NodeStarted | NodeFinished | NodeOutputDelta | NodeSuspended | NodeAttemptFailed | MapItemRecovered
)


def address_label(event: AddressedEvent) -> str:
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


def render_item_recovered(event: RunEvent) -> str | None:
    if not isinstance(event, MapItemRecovered):
        return None
    recovery = event.recovery
    error = f"{recovery.error.code}: {recovery.error.message}"
    return f"↷ {address_label(event)} item {recovery.item_index} {recovery.decision} by {recovery.policy} after {error}"


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
    render_item_recovered,
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


class WatchedRun(Protocol):
    def events(self) -> AsyncIterator[RunEvent]: ...

    async def waits(self) -> tuple[HumanWait, ...]: ...


@dataclass(slots=True)
class EventPrinter:
    line: Callable[[RunEvent], str]
    out: TextIO

    async def follow(self, run: WatchedRun) -> RunFinished | None:
        async for event in run.events():
            print(self.line(event), file=self.out, flush=True)
            if isinstance(event, RunFinished):
                return event
        return None


def event_printer(event_format: EventFormat, out: TextIO) -> EventPrinter:
    return EventPrinter(EVENT_LINES[event_format], out)


async def open_waits(run: WatchedRun) -> tuple[HumanWait, ...]:
    return tuple(wait for wait in await run.waits() if wait.state == "waiting")


async def settled_suspension(run: WatchedRun) -> tuple[HumanWait, ...]:
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


def finished_code(finished: RunFinished | None) -> int:
    return EXIT_OK if finished is not None and finished.status == COMPLETED else EXIT_FAILED


async def watch_run(run: WatchedRun, printer: EventPrinter) -> int:
    following = asyncio.create_task(printer.follow(run))
    suspension = asyncio.create_task(settled_suspension(run))
    done, _ = await asyncio.wait((following, suspension), return_when=asyncio.FIRST_COMPLETED)
    following.cancel()
    suspension.cancel()
    if following in done:
        return finished_code(following.result())
    print_waits(suspension.result(), printer.out)
    return EXIT_SUSPENDED
