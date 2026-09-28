import csv
import json
import sys
from collections.abc import AsyncIterator, Callable, Mapping, Sequence
from contextlib import AbstractContextManager, nullcontext
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import Final, Protocol, TextIO

import httpx2
from pydantic import JsonValue

from aqven.app.background import BackgroundServer, BackgroundStartFailed
from aqven.app.runtime_file import ServerRecord
from aqven.client import ApiErrorResponse, AqvenClient, UnexpectedResponse
from aqven.console.command import EXIT_FAILED, EXIT_OK, EXIT_USAGE, PROGRAM
from aqven.console.series_wait import EXIT_UNREACHABLE, PatientCalls, RetryPolicy, ServerUnreachable, failure_reason
from aqven.series.model import AttemptOutcome, SeriesId
from aqven.series.read_views import SeriesOutputRow, SeriesOutputsPage, SeriesOutputsRequest
from aqven.spec import SeriesSplit, VariantId

COMMAND: Final = "series export"
EXPORT_ACTION: Final = "export"
EXPORT_PAGE: Final = 200
HTTP_TIMEOUT_SECONDS: Final = 120.0
POINTER_ROOT: Final = "/"
OUTPUT_COLUMN: Final = "output"
CHECK_PREFIX: Final = "check:"
USAGE_CODES: Final = frozenset({"NOT_FOUND", "NOT_RUNNABLE", "REQUEST_INVALID"})
NOTHING_WRITTEN: Final = "nothing was written; run the export again"
PATIENCE: Final = RetryPolicy()
FIXED_COLUMNS: Final = (
    "case",
    "variant",
    "repeat",
    "split",
    "outcome",
    "error_code",
    "cost_usd",
    "latency_ms",
    "run_id",
)


class ExportFormat(StrEnum):
    JSONL = "jsonl"
    CSV = "csv"


@dataclass(frozen=True, slots=True)
class SeriesExportRequest:
    root: Path
    series_id: str
    format: ExportFormat = ExportFormat.JSONL
    fields: tuple[str, ...] | None = None
    variant: str | None = None
    outcome: AttemptOutcome | None = None
    split: SeriesSplit | None = None
    out: Path | None = None
    include_holdout: bool = False

    def outputs_request(self) -> SeriesOutputsRequest:
        return SeriesOutputsRequest(
            series_id=SeriesId(self.series_id),
            fields=self.fields,
            variant=None if self.variant is None else VariantId(self.variant),
            outcome=self.outcome,
            split=self.split,
            page_size=EXPORT_PAGE,
        )


def cell(value: JsonValue) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def fixed_cells(row: SeriesOutputRow) -> tuple[str, ...]:
    return (
        row.case,
        row.variant,
        str(row.repeat),
        row.split.value,
        row.outcome.value,
        row.error_code or "",
        str(row.cost_usd),
        "" if row.latency_ms is None else str(row.latency_ms),
        row.run_id,
    )


@dataclass(frozen=True, slots=True)
class CsvColumns:
    pointers: tuple[str, ...]
    nodes: tuple[str, ...]
    checks: tuple[str, ...]
    whole_output: bool

    def header(self) -> tuple[str, ...]:
        output = (OUTPUT_COLUMN,) if self.whole_output else self.pointers
        return (*FIXED_COLUMNS, *output, *self.nodes, *(f"{CHECK_PREFIX}{check}" for check in self.checks))

    def cells(self, row: SeriesOutputRow) -> tuple[str, ...]:
        output = row.output if isinstance(row.output, dict) else {}
        shown = (cell(row.output),) if self.whole_output else tuple(cell(output.get(item)) for item in self.pointers)
        nodes = tuple(cell(row.node_outputs.get(item)) for item in self.nodes)
        checks = tuple(cell(row.checks.get(check)) for check in self.checks)
        return (*fixed_cells(row), *shown, *nodes, *checks)


def csv_columns(fields: Sequence[str] | None, rows: Sequence[SeriesOutputRow]) -> CsvColumns:
    chosen = tuple(fields or ())
    return CsvColumns(
        pointers=tuple(item for item in chosen if item.startswith(POINTER_ROOT)),
        nodes=tuple(item for item in chosen if not item.startswith(POINTER_ROOT)),
        checks=tuple(dict.fromkeys(check for row in rows for check in row.checks)),
        whole_output=fields is None,
    )


def write_jsonl(rows: Sequence[SeriesOutputRow], fields: Sequence[str] | None, sink: TextIO) -> None:
    sink.writelines(f"{row.model_dump_json()}\n" for row in rows)


def write_csv(rows: Sequence[SeriesOutputRow], fields: Sequence[str] | None, sink: TextIO) -> None:
    columns = csv_columns(fields, rows)
    writer = csv.writer(sink)
    writer.writerow(columns.header())
    writer.writerows(columns.cells(row) for row in rows)


type RowWriter = Callable[[Sequence[SeriesOutputRow], Sequence[str] | None, TextIO], None]

WRITERS: Final[Mapping[ExportFormat, RowWriter]] = {
    ExportFormat.JSONL: write_jsonl,
    ExportFormat.CSV: write_csv,
}


class OutputsSource(Protocol):
    async def series_outputs(
        self, request: SeriesOutputsRequest, *, include_holdout: bool = False
    ) -> SeriesOutputsPage: ...


@dataclass(frozen=True, slots=True)
class PatientOutputs:
    source: OutputsSource
    calls: PatientCalls

    async def series_outputs(
        self, request: SeriesOutputsRequest, *, include_holdout: bool = False
    ) -> SeriesOutputsPage:
        return await self.calls.call(
            lambda: self.source.series_outputs(request, include_holdout=include_holdout), NOTHING_WRITTEN
        )


async def output_pages(
    source: OutputsSource, request: SeriesOutputsRequest, include_holdout: bool
) -> AsyncIterator[SeriesOutputsPage]:
    page = await source.series_outputs(request, include_holdout=include_holdout)
    yield page
    while page.next_cursor is not None:
        following = request.model_copy(update={"cursor": page.next_cursor})
        page = await source.series_outputs(following, include_holdout=include_holdout)
        yield page


def opened(target: Path | None, fallback: TextIO) -> AbstractContextManager[TextIO]:
    if target is None:
        return nullcontext(fallback)
    return target.open("w", encoding="utf-8", newline="")


@dataclass(frozen=True, slots=True)
class SeriesExporter:
    source: OutputsSource
    out: TextIO
    err: TextIO
    retry: RetryPolicy = PATIENCE

    async def run(self, request: SeriesExportRequest) -> int:
        try:
            rows = await self._rows(request)
        except ApiErrorResponse as failure:
            return self._refused(failure)
        except ServerUnreachable as failure:
            print(f"{PROGRAM} {COMMAND}: {failure}", file=self.err)
            return EXIT_UNREACHABLE
        except (httpx2.TransportError, UnexpectedResponse) as failure:
            print(f"{PROGRAM} {COMMAND}: the project server did not answer: {failure_reason(failure)}", file=self.err)
            return EXIT_UNREACHABLE
        with opened(request.out, self.out) as sink:
            WRITERS[request.format](rows, request.fields, sink)
        target = "stdout" if request.out is None else str(request.out)
        print(f"exported {len(rows)} rows of series {request.series_id} to {target}", file=self.err)
        return EXIT_OK

    async def _rows(self, request: SeriesExportRequest) -> list[SeriesOutputRow]:
        patient = PatientOutputs(self.source, PatientCalls(self.retry, self._notice))
        pages = output_pages(patient, request.outputs_request(), request.include_holdout)
        return [row async for page in pages for row in page.rows]

    def _notice(self, line: str) -> None:
        print(f"{PROGRAM} {COMMAND}: {line}", file=self.err)

    def _refused(self, failure: ApiErrorResponse) -> int:
        error = failure.error
        print(f"{PROGRAM} {COMMAND}: {error.code}: {error.message}", file=self.err)
        return EXIT_USAGE if error.code in USAGE_CODES else EXIT_FAILED


class ServerSource(Protocol):
    async def ensure(self, root: Path) -> ServerRecord: ...


async def run_series_export(
    request: SeriesExportRequest,
    server: ServerSource | None = None,
    out: TextIO = sys.stdout,
    err: TextIO = sys.stderr,
    transport: httpx2.AsyncBaseTransport | None = None,
    retry: RetryPolicy = PATIENCE,
) -> int:
    try:
        record = await (server or BackgroundServer()).ensure(request.root)
    except BackgroundStartFailed as failure:
        print(f"{PROGRAM} {COMMAND}: {failure}", file=err)
        return EXIT_FAILED
    async with httpx2.AsyncClient(
        headers=record.authorization(), timeout=HTTP_TIMEOUT_SECONDS, trust_env=False, transport=transport
    ) as http:
        return await SeriesExporter(AqvenClient(record.url, http=http), out, err, retry).run(request)
