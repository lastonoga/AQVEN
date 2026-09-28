import csv
import io
import json
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Final

import httpx2
import pytest
from console_support import copy_fixture
from pydantic import JsonValue

from aqven.app.background import BackgroundStartFailed
from aqven.app.runtime_file import ServerRecord, server_record
from aqven.cli import build_parser, main
from aqven.console.series import export_request
from aqven.console.series_export import ExportFormat, SeriesExportRequest, run_series_export
from aqven.console.series_wait import EXIT_UNREACHABLE, RetryPolicy
from aqven.runtime.address import RunId
from aqven.series.model import AttemptOutcome, SeriesId
from aqven.series.read_views import SeriesOutputRow, SeriesOutputsPage
from aqven.spec import SeriesSplit, VariantId

SERIES: Final = SeriesId("01999f2e-4b1c-7a3d-9e21-5c7d8f0a1b2c")
TOKEN: Final = "series-token-0123456789"
PAGE_SIZE: Final = 2
NO_PATIENCE: Final = RetryPolicy(budget_seconds=0.0)
QUICK_RETRY: Final = RetryPolicy(first_pause_seconds=0.0, longest_pause_seconds=0.0)


def output_row(ordinal: int, fields: bool) -> SeriesOutputRow:
    label = "acne" if ordinal % 2 == 0 else "rosacea"
    output: JsonValue = {"/label": label} if fields else {"label": label, "candidates": [label]}
    return SeriesOutputRow(
        case=f"case_{ordinal}",
        variant=VariantId("gemini" if ordinal < 3 else "glm"),
        repeat=1,
        split=SeriesSplit.DEV,
        outcome=AttemptOutcome.PASSED if ordinal % 2 == 0 else AttemptOutcome.FAILED,
        error_code=None if ordinal % 2 == 0 else "check_failed",
        cost_usd=Decimal("0.0012"),
        latency_ms=900 + ordinal,
        run_id=RunId(f"run-{ordinal}"),
        output=output,
        node_outputs={"triage": {"summary": f"note {ordinal}"}} if fields else {},
        checks={"top1": 1.0 if ordinal % 2 == 0 else 0.0},
    )


@dataclass(slots=True)
class OutputsServer:
    rows: int = 5
    requests: list[httpx2.Request] = field(default_factory=list[httpx2.Request])
    status: int = 200

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        self.requests.append(request)
        if self.status != 200:
            body: dict[str, JsonValue] = {"ok": False, "op": "series_outputs", "code": "NOT_FOUND", "message": "gone"}
            return httpx2.Response(self.status, json=body)
        start = int(request.url.params.get("cursor", "-1")) + 1
        fields = bool(request.url.params.get_list("fields"))
        shown = tuple(output_row(ordinal, fields) for ordinal in range(start, min(start + PAGE_SIZE, self.rows)))
        more = start + PAGE_SIZE < self.rows
        page = SeriesOutputsPage(
            series_id=SERIES,
            rows=shown,
            total=self.rows,
            next_cursor=str(start + PAGE_SIZE - 1) if more else None,
        )
        return httpx2.Response(200, json=page.model_dump(mode="json"))


@dataclass(frozen=True, slots=True)
class KnownServer:
    async def ensure(self, root: Path) -> ServerRecord:
        return server_record(host="127.0.0.1", port=5199, token=TOKEN, pid=1, root=root)


@dataclass(frozen=True, slots=True)
class FailingServer:
    async def ensure(self, root: Path) -> ServerRecord:
        raise BackgroundStartFailed(root, "process exited with code 1", "")


async def exported(
    server: OutputsServer,
    request: SeriesExportRequest,
    transport: httpx2.AsyncBaseTransport | None = None,
    retry: RetryPolicy = NO_PATIENCE,
) -> tuple[int, str, str]:
    out, err = io.StringIO(), io.StringIO()
    chosen = transport or httpx2.MockTransport(server)
    code = await run_series_export(request, KnownServer(), out, err, chosen, retry)
    return code, out.getvalue(), err.getvalue()


@pytest.mark.asyncio
async def test_jsonl_export_follows_every_page_with_the_server_token(tmp_path: Path) -> None:
    server = OutputsServer()

    code, out, err = await exported(server, SeriesExportRequest(root=tmp_path, series_id=SERIES))

    rows = [SeriesOutputRow.model_validate(json.loads(line)) for line in out.splitlines()]
    assert code == 0
    assert [row.case for row in rows] == [f"case_{ordinal}" for ordinal in range(5)]
    assert [request.url.params.get("cursor") for request in server.requests] == [None, "1", "3"]
    assert {request.url.path for request in server.requests} == {f"/api/series/{SERIES}/outputs"}
    assert all(request.url.params.get("page_size") == "200" for request in server.requests)
    assert server.requests[0].headers["Authorization"] == f"Bearer {TOKEN}"
    assert f"exported 5 rows of series {SERIES} to stdout" in err


@pytest.mark.asyncio
async def test_csv_export_writes_a_column_per_field_node_and_check(tmp_path: Path) -> None:
    server = OutputsServer(rows=3)
    target = tmp_path / "rows.csv"
    request = SeriesExportRequest(
        root=tmp_path,
        series_id=SERIES,
        format=ExportFormat.CSV,
        fields=("/label", "triage"),
        variant="gemini",
        outcome=AttemptOutcome.PASSED,
        out=target,
    )

    code, out, _ = await exported(server, request)

    header, *lines = list(csv.reader(io.StringIO(target.read_text(encoding="utf-8"))))
    assert code == 0 and out == ""
    assert header[-3:] == ["/label", "triage", "check:top1"]
    assert lines[0][header.index("/label")] == "acne"
    assert json.loads(lines[0][header.index("triage")]) == {"summary": "note 0"}
    assert lines[1][header.index("error_code")] == "check_failed"
    params = server.requests[0].url.params
    assert (params.get_list("fields"), params.get("variant"), params.get("outcome")) == (
        ["/label", "triage"],
        "gemini",
        "passed",
    )


@pytest.mark.asyncio
async def test_csv_without_fields_keeps_the_whole_output_in_one_column(tmp_path: Path) -> None:
    code, out, _ = await exported(
        OutputsServer(rows=1), SeriesExportRequest(root=tmp_path, series_id=SERIES, format=ExportFormat.CSV)
    )

    header, first = list(csv.reader(io.StringIO(out)))
    assert code == 0
    assert "output" in header
    assert json.loads(first[header.index("output")]) == {"label": "acne", "candidates": ["acne"]}


@pytest.mark.asyncio
async def test_a_refused_export_names_the_code_and_exits_two(tmp_path: Path) -> None:
    code, out, err = await exported(OutputsServer(status=404), SeriesExportRequest(root=tmp_path, series_id=SERIES))

    assert (code, out) == (2, "")
    assert "NOT_FOUND: gone" in err


@pytest.mark.asyncio
async def test_a_lost_server_is_named_even_when_the_error_has_no_text(tmp_path: Path) -> None:
    def silent(request: httpx2.Request) -> httpx2.Response:
        raise httpx2.ReadTimeout("", request=request)

    code, _, err = await exported(
        OutputsServer(), SeriesExportRequest(root=tmp_path, series_id=SERIES), httpx2.MockTransport(silent)
    )

    assert code == EXIT_UNREACHABLE
    assert "did not answer for 0s: ReadTimeout; nothing was written" in err


@pytest.mark.asyncio
async def test_the_export_rides_through_a_short_server_outage(tmp_path: Path) -> None:
    server = OutputsServer(rows=3)
    lost: list[httpx2.Request] = []

    def flaky(request: httpx2.Request) -> httpx2.Response:
        if request.url.params.get("cursor") == "1" and not lost:
            lost.append(request)
            raise httpx2.ReadTimeout("", request=request)
        return server(request)

    code, out, err = await exported(
        server, SeriesExportRequest(root=tmp_path, series_id=SERIES), httpx2.MockTransport(flaky), QUICK_RETRY
    )

    assert code == 0
    assert len(out.splitlines()) == 3
    assert "lost contact with the project server (ReadTimeout), retrying" in err


@pytest.mark.asyncio
async def test_the_export_exits_one_when_the_server_does_not_start(tmp_path: Path) -> None:
    err = io.StringIO()

    code = await run_series_export(SeriesExportRequest(root=tmp_path, series_id=SERIES), FailingServer(), err=err)

    assert code == 1
    assert "did not start" in err.getvalue()


def test_the_export_arguments_become_an_export_request(tmp_path: Path) -> None:
    arguments = build_parser().parse_args(
        [
            "series",
            "export",
            SERIES,
            "--format",
            "csv",
            "--fields",
            "/label",
            "triage",
            "--variant",
            "glm",
            "--outcome",
            "failed",
            "--split",
            "dev",
            "--out",
            "rows.csv",
        ]
    )

    request = export_request(tmp_path, arguments)

    assert request == SeriesExportRequest(
        root=tmp_path,
        series_id=SERIES,
        format=ExportFormat.CSV,
        fields=("/label", "triage"),
        variant="glm",
        outcome=AttemptOutcome.FAILED,
        split=SeriesSplit.DEV,
        out=Path("rows.csv"),
    )


def test_export_without_a_series_and_a_stray_series_id_are_usage_errors(tmp_path: Path) -> None:
    project = copy_fixture("standard_shop", tmp_path)

    assert main(["series", "export", "--path", str(project)]) == 2
    assert main(["series", "reply_quality", SERIES, "--path", str(project)]) == 2
