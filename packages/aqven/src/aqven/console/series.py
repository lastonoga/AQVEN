import argparse
import asyncio
import sys
from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from functools import partial
from pathlib import Path
from typing import Final, Protocol, TextIO
from urllib.parse import urlencode

import httpx2

from aqven.app.access import ACCESS_TOKEN_PARAMETER
from aqven.app.background import BackgroundServer, BackgroundStartFailed
from aqven.app.runtime_file import ServerRecord
from aqven.client import ApiErrorResponse, AqvenClient, UnexpectedResponse, new_client_op_id
from aqven.console.command import EXIT_FAILED, EXIT_OK, EXIT_USAGE, PATH_HELP, PROGRAM, OutputFormat
from aqven.console.project_env import open_project
from aqven.series.model import SETTLED_STATUSES, MatrixRow, MetricCell, MetricColumn, MetricRole, SeriesId, SeriesStatus
from aqven.series.protocol import MAX_WAIT_SECONDS
from aqven.series.views import SeriesDetailView, SeriesGetResult, SeriesStarted, SeriesStartRequest
from aqven.spec import CellVerdict, ExperimentId, SeriesMetric, SeriesSplit
from aqven.spec.experiments import MAX_REPEATS

COMMAND: Final = "series"
EXIT_APPROVAL: Final = 3
EXIT_HUMAN: Final = 4
HTTP_TIMEOUT_SECONDS: Final = 30.0
STUDIO_SERIES_PATH: Final = "research/series"
NUMBER_FORMAT: Final = ".4g"
CENT: Final = Decimal("0.01")
STATUS_EXITS: Final[Mapping[SeriesStatus, int]] = {
    SeriesStatus.DONE: EXIT_OK,
    SeriesStatus.CANCELLED: EXIT_FAILED,
    SeriesStatus.FAILED: EXIT_FAILED,
    SeriesStatus.AWAITING_APPROVAL: EXIT_APPROVAL,
    SeriesStatus.WAITING_HUMAN: EXIT_HUMAN,
}
USAGE_CODES: Final = frozenset({"NOT_FOUND", "NOT_RUNNABLE", "INPUT_INVALID", "REQUEST_INVALID"})
SHOWN_ROLES: Final = frozenset({MetricRole.PRIMARY, MetricRole.GUARDRAIL, MetricRole.CHECK})
ALWAYS_SHOWN: Final = frozenset({SeriesMetric.SUCCESS_RATE.value})


def positive_int(text: str) -> int:
    try:
        value = int(text)
    except ValueError as error:
        raise argparse.ArgumentTypeError(f"expected a whole number, got {text}") from error
    if value < 1:
        raise argparse.ArgumentTypeError(f"expected a number of at least 1, got {text}")
    return value


def repeat_count(text: str) -> int:
    value = positive_int(text)
    if value > MAX_REPEATS:
        raise argparse.ArgumentTypeError(f"expected at most {MAX_REPEATS} repeats, got {text}")
    return value


def positive_usd(text: str) -> Decimal:
    try:
        value = Decimal(text)
    except InvalidOperation as error:
        raise argparse.ArgumentTypeError(f"expected an amount of dollars, got {text}") from error
    if not value.is_finite() or value <= 0:
        raise argparse.ArgumentTypeError(f"expected an amount of dollars above 0, got {text}")
    return value


@dataclass(frozen=True, slots=True)
class SeriesCommandRequest:
    root: Path
    experiment_id: str
    on: SeriesSplit = SeriesSplit.DEV
    cases: int | None = None
    repeats: int | None = None
    cap_usd: Decimal | None = None
    as_json: bool = False

    def start_request(self) -> SeriesStartRequest:
        return SeriesStartRequest(
            experiment_id=ExperimentId(self.experiment_id),
            on=self.on,
            cases=self.cases,
            repeats=self.repeats,
            cap_usd=self.cap_usd,
            client_op_id=new_client_op_id(),
        )


class ServerSource(Protocol):
    async def ensure(self, root: Path) -> ServerRecord: ...


def studio_link(record: ServerRecord, series_id: SeriesId) -> str:
    query = urlencode({ACCESS_TOKEN_PARAMETER: record.token})
    return f"{record.url.rstrip('/')}/{STUDIO_SERIES_PATH}/{series_id}?{query}"


def usd(value: Decimal | None) -> str:
    if value is None:
        return "unknown"
    cents = value.quantize(CENT)
    return f"${cents:f}" if cents == value else f"${value.normalize():f}"


def number(value: float | None) -> str:
    return "n/a" if value is None else format(value, NUMBER_FORMAT)


def counted(count: int, noun: str) -> str:
    return f"{count} {noun}" if count == 1 else f"{count} {noun}s"


def started_line(started: SeriesStarted) -> str:
    estimate = started.estimate
    shape = " × ".join(
        (counted(estimate.cases, "case"), counted(estimate.repeats, "repeat"), counted(estimate.variants, "variant"))
    )
    return (
        f"series {started.series_id} started on {started.on}: {counted(estimate.attempts, 'attempt')} ({shape}), "
        f"estimate {usd(estimate.usd)}, cap {usd(started.spend.cap_usd)}, status {started.status}"
    )


def progress_line(series: SeriesDetailView) -> str:
    return (
        f"{series.progress.done}/{series.progress.total} attempts, "
        f"{usd(series.spend.usd)} of {usd(series.spend.cap_usd)}, status {series.status}"
    )


def shown(column: MetricColumn) -> bool:
    return column.role in SHOWN_ROLES or column.metric in ALWAYS_SHOWN


def cell_text(cell: MetricCell) -> str:
    interval = "" if cell.low is None or cell.high is None else f" [{number(cell.low)}, {number(cell.high)}]"
    verdict = "" if cell.verdict is CellVerdict.NONE else f" {cell.verdict}"
    return f"{cell.metric} {number(cell.value)}{interval}{verdict}"


def row_line(row: MatrixRow, columns: Sequence[MetricColumn]) -> str:
    wanted = {column.metric for column in columns if shown(column)}
    cells = "; ".join(cell_text(cell) for cell in row.cells if cell.metric in wanted)
    return f"  {row.variant_id} ({row.role}): {cells}"


def verdict_lines(series: SeriesDetailView) -> Iterator[str]:
    if series.verdict is not None:
        yield f"verdict {series.verdict.state}: {series.verdict.text}"
    columns = series.matrix.columns
    yield from (row_line(row, columns) for row in series.matrix.rows)
    if series.finding_path is not None:
        yield f"finding: {series.finding_path}"


def infra_lines(series: SeriesDetailView) -> Iterator[str]:
    errors = sum(variant.infra_errors for variant in series.aggregates)
    if errors:
        yield (
            f"{counted(errors, 'attempt')} of {series.progress.done} hit infrastructure errors, "
            "such as a missing provider key: each attempt run names its error"
        )


def done_lines(series: SeriesDetailView, link: str) -> Iterator[str]:
    yield f"series {series.series_id} done: {progress_line(series)}"
    yield from infra_lines(series)
    yield from verdict_lines(series)


def cancelled_lines(series: SeriesDetailView, link: str) -> Iterator[str]:
    yield f"series {series.series_id} was cancelled after {progress_line(series)}; no finding is written"


def failed_lines(series: SeriesDetailView, link: str) -> Iterator[str]:
    yield f"series {series.series_id} failed: {series.error or 'no error text'}"


def approval_reason(series: SeriesDetailView) -> str:
    estimate = series.estimate
    project_cap = usd(estimate.project_cap_usd)
    if estimate.usd is None:
        return f"there is no cost estimate, and the series may spend up to {usd(series.spend.cap_usd)}"
    if estimate.usd > estimate.project_cap_usd:
        return f"the estimate {usd(estimate.usd)} is above the project spend cap {project_cap}"
    return f"the series cap {usd(series.spend.cap_usd)} is above the project spend cap {project_cap}"


def approval_lines(series: SeriesDetailView, link: str) -> Iterator[str]:
    yield f"series {series.series_id} awaits approval: {approval_reason(series)}; approve it in Studio: {link}"


def human_lines(series: SeriesDetailView, link: str) -> Iterator[str]:
    yield f"series {series.series_id} waits for a human answer in {counted(series.waits, 'attempt')}: {link}"


type ReportLines = Callable[[SeriesDetailView, str], Iterator[str]]

REPORTS: Final[Mapping[SeriesStatus, ReportLines]] = {
    SeriesStatus.DONE: done_lines,
    SeriesStatus.CANCELLED: cancelled_lines,
    SeriesStatus.FAILED: failed_lines,
    SeriesStatus.AWAITING_APPROVAL: approval_lines,
    SeriesStatus.WAITING_HUMAN: human_lines,
}


@dataclass(frozen=True, slots=True)
class SeriesRunner:
    client: AqvenClient
    link: Callable[[SeriesId], str]
    out: TextIO
    err: TextIO

    async def run(self, request: SeriesCommandRequest) -> int:
        try:
            return await self._run(request)
        except ApiErrorResponse as failure:
            return self._refused(failure)
        except (httpx2.TransportError, UnexpectedResponse) as failure:
            print(f"{PROGRAM} {COMMAND}: the project server did not answer: {failure}", file=self.err)
            return EXIT_FAILED

    async def _run(self, request: SeriesCommandRequest) -> int:
        started = await self.client.series_start(request.start_request())
        self._say(request, started_line(started))
        settled = await self._settled(request, started.series_id)
        final = await self._final(request, settled)
        self._publish(request, final)
        self._report(request, final.series)
        return STATUS_EXITS.get(settled.series.status, EXIT_FAILED)

    async def _settled(self, request: SeriesCommandRequest, series_id: SeriesId) -> SeriesGetResult:
        result = await self.client.series_get(series_id, MAX_WAIT_SECONDS)
        while result.series.status not in SETTLED_STATUSES:
            self._say(request, progress_line(result.series))
            result = await self.client.series_get(series_id, MAX_WAIT_SECONDS)
        return result

    async def _final(self, request: SeriesCommandRequest, settled: SeriesGetResult) -> SeriesGetResult:
        if not request.as_json:
            return settled
        return await self.client.series_get(settled.series.series_id, include_cases=True)

    def _publish(self, request: SeriesCommandRequest, final: SeriesGetResult) -> None:
        if request.as_json:
            print(final.model_dump_json(), file=self.out, flush=True)

    def _report(self, request: SeriesCommandRequest, series: SeriesDetailView) -> None:
        report = REPORTS.get(series.status)
        lines = () if report is None else report(series, self.link(series.series_id))
        for line in lines:
            self._say(request, line)

    def _say(self, request: SeriesCommandRequest, line: str) -> None:
        print(line, file=self.err if request.as_json else self.out, flush=True)

    def _refused(self, failure: ApiErrorResponse) -> int:
        error = failure.error
        print(f"{PROGRAM} {COMMAND}: {error.code}: {error.message}", file=self.err)
        for problem in error.problems:
            print(f"  {'.'.join(str(part) for part in problem.path)}: {problem.message}", file=self.err)
        return EXIT_USAGE if error.code in USAGE_CODES else EXIT_FAILED


async def run_series_command(
    request: SeriesCommandRequest,
    server: ServerSource | None = None,
    out: TextIO = sys.stdout,
    err: TextIO = sys.stderr,
    transport: httpx2.AsyncBaseTransport | None = None,
) -> int:
    try:
        record = await (server or BackgroundServer()).ensure(request.root)
    except BackgroundStartFailed as failure:
        print(f"{PROGRAM} {COMMAND}: {failure}", file=err)
        return EXIT_FAILED
    async with httpx2.AsyncClient(
        headers=record.authorization(), timeout=HTTP_TIMEOUT_SECONDS, trust_env=False, transport=transport
    ) as http:
        runner = SeriesRunner(AqvenClient(record.url, http=http), partial(studio_link, record), out, err)
        return await runner.run(request)


@dataclass(frozen=True, slots=True)
class SeriesCommand:
    help: str = "run a series of an experiment on the project server and wait for its verdict"

    def configure(self, parser: argparse.ArgumentParser) -> None:
        parser.add_argument("experiment", metavar="EXPERIMENT_ID", help="experiment id")
        parser.add_argument(
            "--on",
            choices=[split.value for split in SeriesSplit],
            default=SeriesSplit.DEV.value,
            help="dev cases to explore, holdout cases for a finding",
        )
        parser.add_argument("--cases", type=positive_int, default=None, metavar="N", help="number of cases")
        parser.add_argument("--repeats", type=repeat_count, default=None, metavar="R", help="repeats per case")
        parser.add_argument("--cap", type=positive_usd, default=None, metavar="USD", help="spend cap of this series")
        parser.add_argument("--json", action="store_true", help="print the last series state as one JSON line")
        parser.add_argument("--path", default=".", help=PATH_HELP)

    def execute(self, arguments: argparse.Namespace) -> int:
        root = open_project(Path(str(arguments.path)), OutputFormat.TEXT)
        if root is None:
            return EXIT_USAGE
        request = SeriesCommandRequest(
            root=root,
            experiment_id=str(arguments.experiment),
            on=SeriesSplit(str(arguments.on)),
            cases=_optional_int(arguments.cases),
            repeats=_optional_int(arguments.repeats),
            cap_usd=arguments.cap if isinstance(arguments.cap, Decimal) else None,
            as_json=bool(arguments.json),
        )
        return asyncio.run(run_series_command(request))


def _optional_int(value: object) -> int | None:
    return value if isinstance(value, int) else None
