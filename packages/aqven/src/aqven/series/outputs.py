import asyncio
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Final

from pydantic import JsonValue

from aqven.engine.reader import RunEventLog
from aqven.runtime.address import RunId
from aqven.runtime.events import NodeFinished, RunEvent, RunFinished
from aqven.runtime.values import InlineValue
from aqven.series.briefs import invalid, page_start
from aqven.series.model import AttemptOutcome, AttemptRecord, AttemptState, SeriesRecord, SeriesStatus
from aqven.series.ports import RunOutputRecord, RunOutputs
from aqven.series.presenter import attempt_outcome
from aqven.series.read_views import SeriesOutputRow, SeriesOutputsPage, SeriesOutputsRequest

POINTER_ROOT: Final = "/"
NODE_SEPARATOR: Final = "/"
OK_STATUS: Final = "ok"
PARALLEL_READS: Final = 8
STOPPED: Final = frozenset({SeriesStatus.CANCELLED, SeriesStatus.FAILED})
ESCAPES: Final = (("~1", "/"), ("~0", "~"))


NO_OUTPUT: Final = RunOutputRecord()


def inline(event: NodeFinished | RunFinished) -> JsonValue:
    reference = event.output_ref
    return reference.value if isinstance(reference, InlineValue) else None


def top_level(event: NodeFinished) -> bool:
    address = event.address
    return address.branch_key is None and address.iteration is None and address.item_index is None


def recorded_outputs(events: Iterable[RunEvent]) -> RunOutputRecord:
    ordered = tuple(events)
    finished = [event for event in ordered if isinstance(event, RunFinished)]
    nodes = {
        event.address.node_id: inline(event)
        for event in ordered
        if isinstance(event, NodeFinished) and event.status == OK_STATUS and top_level(event)
    }
    return RunOutputRecord(output=inline(finished[-1]) if finished else None, nodes=nodes)


@dataclass(frozen=True, slots=True)
class EventLogOutputs:
    log: RunEventLog = field(default_factory=RunEventLog)

    async def outputs(self, run_id: RunId) -> RunOutputRecord:
        return recorded_outputs(await self.log.snapshot(run_id))


def unescaped(token: str) -> str:
    text = token
    for escape, value in ESCAPES:
        text = text.replace(escape, value)
    return text


def step(value: JsonValue, token: str) -> JsonValue:
    if isinstance(value, dict):
        return value.get(token)
    if isinstance(value, list) and token.isdigit() and int(token) < len(value):
        return value[int(token)]
    return None


def pointed(value: JsonValue, pointer: str) -> JsonValue:
    if not pointer:
        return value
    current = value
    for token in pointer.removeprefix(POINTER_ROOT).split(POINTER_ROOT):
        current = step(current, unescaped(token))
    return current


@dataclass(frozen=True, slots=True)
class NodeField:
    text: str
    node_id: str
    pointer: str


def node_field(text: str) -> NodeField:
    node_id, separator, rest = text.partition(NODE_SEPARATOR)
    return NodeField(text=text, node_id=node_id, pointer=f"{POINTER_ROOT}{rest}" if separator and rest else "")


@dataclass(frozen=True, slots=True)
class OutputFields:
    whole: bool
    pointers: tuple[str, ...]
    nodes: tuple[NodeField, ...]

    def output(self, value: JsonValue) -> JsonValue:
        if self.whole:
            return value
        if not self.pointers:
            return None
        return {pointer: pointed(value, pointer) for pointer in self.pointers}

    def node_outputs(self, nodes: Mapping[str, JsonValue]) -> dict[str, JsonValue]:
        return {item.text: pointed(nodes.get(item.node_id), item.pointer) for item in self.nodes}


EVERYTHING: Final = OutputFields(whole=True, pointers=(), nodes=())


def output_fields(fields: Sequence[str] | None) -> OutputFields:
    if fields is None:
        return EVERYTHING
    empty = [text for text in fields if not text.strip(POINTER_ROOT)]
    if empty:
        raise invalid("a field names a pointer into the flow output such as /label, or a node id such as triage")
    return OutputFields(
        whole=False,
        pointers=tuple(text for text in fields if text.startswith(POINTER_ROOT)),
        nodes=tuple(node_field(text) for text in fields if not text.startswith(POINTER_ROOT)),
    )


@dataclass(frozen=True, slots=True)
class JudgedRow:
    row: AttemptRecord
    outcome: AttemptOutcome


def wanted(judged: JudgedRow, request: SeriesOutputsRequest) -> bool:
    row = judged.row
    checks = (
        request.split is None or row.split is request.split,
        request.variant is None or row.variant_id == request.variant,
        request.case is None or row.case_name == request.case,
        request.outcome is None or judged.outcome is request.outcome,
    )
    return all(checks)


def output_row(judged: JudgedRow, recorded: RunOutputRecord, fields: OutputFields) -> SeriesOutputRow:
    row = judged.row
    return SeriesOutputRow(
        case=row.case_name,
        variant=row.variant_id,
        repeat=row.repeat,
        split=row.split,
        outcome=judged.outcome,
        error_code=row.error_code,
        cost_usd=row.cost_usd,
        latency_ms=row.latency_ms,
        run_id=row.run_id,
        output=fields.output(recorded.output),
        node_outputs=fields.node_outputs(recorded.nodes),
        checks={check.check_id: check.value for check in row.checks},
    )


def after_cursor(rows: Sequence[JudgedRow], cursor: str | None) -> list[JudgedRow]:
    if cursor is None:
        return list(rows)
    last = page_start(cursor)
    return [judged for judged in rows if judged.row.ordinal > last]


@dataclass(frozen=True, slots=True)
class SeriesOutputsReader:
    runs: RunOutputs
    parallel: int = PARALLEL_READS

    async def page(
        self,
        record: SeriesRecord,
        attempts: Sequence[AttemptRecord],
        waiting: frozenset[RunId],
        request: SeriesOutputsRequest,
    ) -> SeriesOutputsPage:
        fields = output_fields(request.fields)
        stopped = record.status in STOPPED
        judged = [JudgedRow(row=row, outcome=attempt_outcome(row, waiting, stopped)) for row in attempts]
        matching = [item for item in judged if wanted(item, request)]
        remaining = after_cursor(matching, request.cursor)
        shown = remaining[: request.page_size]
        recorded = await self._recorded(shown)
        rows = tuple(output_row(item, outputs, fields) for item, outputs in zip(shown, recorded, strict=True))
        more = len(remaining) > len(shown)
        return SeriesOutputsPage(
            series_id=record.series_id,
            rows=rows,
            total=len(matching),
            next_cursor=str(shown[-1].row.ordinal) if more and shown else None,
        )

    async def _recorded(self, shown: Sequence[JudgedRow]) -> list[RunOutputRecord]:
        gate = asyncio.Semaphore(self.parallel)
        return list(await asyncio.gather(*(self._read(gate, item.row) for item in shown)))

    async def _read(self, gate: asyncio.Semaphore, row: AttemptRecord) -> RunOutputRecord:
        if row.state is not AttemptState.FINISHED:
            return NO_OUTPUT
        async with gate:
            return await self.runs.outputs(row.run_id)
