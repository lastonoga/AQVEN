import io
import json
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Final

import httpx2
import pytest
from pydantic import JsonValue

from aqven.app.background import BackgroundStartFailed
from aqven.app.runtime_file import ServerRecord, server_record
from aqven.cli import main
from aqven.client import AqvenClient
from aqven.console.series import (
    EXIT_APPROVAL,
    EXIT_HUMAN,
    SeriesCommandRequest,
    SeriesRunner,
    approval_reason,
    done_lines,
    failed_lines,
    progress_line,
    run_series_command,
    started_line,
    started_lines,
    studio_link,
)
from aqven.series import (
    ApprovalReason,
    ExperimentOrigin,
    LaunchPlan,
    QuestionView,
    Recommendation,
    RecommendationReason,
    SeriesDetailView,
    SeriesGetResult,
    SeriesId,
    SeriesMatrix,
    SeriesPause,
    SeriesProgress,
    SeriesSpend,
    SeriesStarted,
    SeriesStatus,
    SeriesSummaryView,
    SeriesVerdict,
    VariantAggregates,
    VariantRole,
)
from aqven.spec import DatasetId, ExperimentId, FlowId, SeriesSplit, VariantId, VerdictReason, VerdictState

SERIES: Final = SeriesId("01999f2e-4b1c-7a3d-9e21-5c7d8f0a1b2c")
MOMENT: Final = datetime(2026, 9, 24, 10, 0, tzinfo=UTC)
BASE: Final = "http://127.0.0.1:5199"
TOKEN: Final = "series-token-0123456789"
VERDICT: Final = "Signal on dev, not a finding: alt answers as often as base."


def launch_plan() -> LaunchPlan:
    return LaunchPlan(
        on=SeriesSplit.DEV,
        cases=4,
        repeats=2,
        variants=2,
        attempts=16,
        available=4,
        half_width=None,
        mde=None,
        margin=0.05,
        spread=None,
        spread_source="none",
        icc=0.3,
        recommended=Recommendation(cases=4, repeats=2, reason=RecommendationReason.NO_HISTORY, text="no history"),
        below_recommended=False,
        needs_approval=False,
        project_cap_usd=Decimal("1.00"),
        cap_usd=Decimal("3.00"),
    )


def detail(status: SeriesStatus, done: int) -> SeriesDetailView:
    verdict = SeriesVerdict(state=VerdictState.SIGNAL, reason=None, text=VERDICT)
    return SeriesDetailView(
        series_id=SERIES,
        origin=ExperimentOrigin(experiment_id=ExperimentId("reply_quality")),
        flow_id=FlowId("intake"),
        dataset_id=DatasetId("intake_cases"),
        question="compare",
        on=SeriesSplit.DEV,
        cases=4,
        repeats=2,
        variants=(VariantId("base"), VariantId("alt")),
        status=status,
        progress=SeriesProgress(done=done, total=16),
        spend=SeriesSpend(usd=Decimal("0.05") * done, cap_usd=Decimal("3.00")),
        verdict=verdict if status is SeriesStatus.DONE else None,
        waits=1 if status is SeriesStatus.WAITING_HUMAN else 0,
        started_at=MOMENT,
        finished_at=None,
        question_detail=QuestionView(kind="compare"),
        checks=(),
        matrix=SeriesMatrix(columns=(), rows=()),
        stability=(),
        contrasts=(),
        thresholds=(),
        aggregates=(),
        launch=launch_plan(),
        needs_approval=status is SeriesStatus.AWAITING_APPROVAL,
        approved_by=None,
        finding_path=None,
        error="the engine stopped" if status is SeriesStatus.FAILED else None,
    )


def started(status: SeriesStatus) -> SeriesStarted:
    summary = SeriesSummaryView.model_validate(detail(status, 0).model_dump())
    return SeriesStarted.model_validate({**summary.model_dump(), "launch": launch_plan()})


def error_body(code: str, status: int) -> httpx2.Response:
    body: dict[str, JsonValue] = {"ok": False, "op": "series_start", "code": code, "message": f"{code} happened"}
    return httpx2.Response(status, json=body)


@dataclass(slots=True)
class FakeServer:
    first: SeriesStatus
    states: Iterator[tuple[SeriesStatus, int]]
    start_error: tuple[str, int] | None = None
    requests: list[httpx2.Request] = field(default_factory=list[httpx2.Request])

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        self.requests.append(request)
        if request.method == "POST" and self.start_error is not None:
            return error_body(*self.start_error)
        if request.method == "POST":
            return httpx2.Response(201, json=started(self.first).model_dump(mode="json"))
        status, done = next(self.states)
        include = request.url.params.get("include_cases") == "true"
        result = SeriesGetResult(series=detail(status, done), cases=() if include else None, hidden_cases=0)
        return httpx2.Response(200, json=result.model_dump(mode="json"))


def record() -> ServerRecord:
    return server_record(host="127.0.0.1", port=5199, token=TOKEN, pid=1, root=Path("/tmp/project"))


async def drive(server: FakeServer, as_json: bool = False) -> tuple[int, str, str]:
    out, err = io.StringIO(), io.StringIO()
    request = SeriesCommandRequest(root=Path("/tmp/project"), experiment_id="reply_quality", as_json=as_json)
    async with httpx2.AsyncClient(transport=httpx2.MockTransport(server)) as http:
        runner = SeriesRunner(AqvenClient(BASE, http=http), lambda series: studio_link(record(), series), out, err)
        code = await runner.run(request)
    return code, out.getvalue(), err.getvalue()


@pytest.mark.asyncio
async def test_a_done_series_exits_zero_and_prints_progress_and_the_verdict() -> None:
    server = FakeServer(SeriesStatus.RUNNING, iter(((SeriesStatus.RUNNING, 6), (SeriesStatus.DONE, 16))))

    code, out, _ = await drive(server)

    assert code == 0
    assert f"series {SERIES} started on dev: 16 attempts (4 cases × 2 repeats × 2 variants)" in out
    assert "6/16 attempts" in out
    assert "infrastructure errors" not in out
    assert f"verdict signal: {VERDICT}" in out
    waits = [request.url.params.get("wait_seconds") for request in server.requests if request.method == "GET"]
    assert waits == ["50", "50"]


@pytest.mark.parametrize(
    ("status", "expected"),
    [
        (SeriesStatus.FAILED, 1),
        (SeriesStatus.CANCELLED, 1),
        (SeriesStatus.AWAITING_APPROVAL, EXIT_APPROVAL),
        (SeriesStatus.WAITING_HUMAN, EXIT_HUMAN),
    ],
)
@pytest.mark.asyncio
async def test_settled_states_map_to_exit_codes(status: SeriesStatus, expected: int) -> None:
    code, _, _ = await drive(FakeServer(status, iter(((status, 3),))))

    assert code == expected


@pytest.mark.asyncio
async def test_approval_and_a_waiting_human_print_the_studio_link() -> None:
    _, approval, _ = await drive(
        FakeServer(SeriesStatus.AWAITING_APPROVAL, iter(((SeriesStatus.AWAITING_APPROVAL, 0),)))
    )
    _, human, _ = await drive(FakeServer(SeriesStatus.RUNNING, iter(((SeriesStatus.WAITING_HUMAN, 2),))))

    link = f"{BASE}/research/series/{SERIES}?access_token={TOKEN}"
    assert "the series cap $3.00 is above the project spend cap $1.00" in approval
    assert link in approval
    assert f"waits for a human answer in 1 attempt: {link}" in human


def test_a_series_paused_near_its_cap_names_what_it_spent() -> None:
    pause = SeriesPause(reason=ApprovalReason.SPEND_NEAR_CAP, spent_usd=Decimal("2.71"))
    paused = detail(SeriesStatus.AWAITING_APPROVAL, 9).model_copy(update={"pause": pause})

    assert approval_reason(paused) == "it spent $2.71 of its $3.00 cap and paused before its next attempts"


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        (("NOT_FOUND", 404), 2),
        (("NOT_RUNNABLE", 409), 2),
        (("INPUT_INVALID", 422), 2),
        (("REQUEST_INVALID", 422), 2),
        (("INTERNAL", 500), 1),
    ],
)
@pytest.mark.asyncio
async def test_refusals_map_to_exit_codes(error: tuple[str, int], expected: int) -> None:
    code, _, err = await drive(FakeServer(SeriesStatus.RUNNING, iter(()), start_error=error))

    assert code == expected
    assert f"{error[0]}: {error[0]} happened" in err


@pytest.mark.asyncio
async def test_an_unreachable_server_exits_one() -> None:
    def refuse(request: httpx2.Request) -> httpx2.Response:
        raise httpx2.ConnectError("connection refused", request=request)

    out, err = io.StringIO(), io.StringIO()
    request = SeriesCommandRequest(root=Path("/tmp/project"), experiment_id="reply_quality")
    async with httpx2.AsyncClient(transport=httpx2.MockTransport(refuse)) as http:
        runner = SeriesRunner(AqvenClient(BASE, http=http), lambda series: series, out, err)
        code = await runner.run(request)

    assert code == 1
    assert "did not answer" in err.getvalue()


@pytest.mark.asyncio
async def test_json_prints_the_last_state_with_case_rows_as_one_line() -> None:
    states = iter(((SeriesStatus.DONE, 16), (SeriesStatus.DONE, 16)))

    code, out, err = await drive(FakeServer(SeriesStatus.RUNNING, states), as_json=True)

    [line] = out.splitlines()
    result = SeriesGetResult.model_validate(json.loads(line))
    assert code == 0
    assert result.cases == ()
    assert "started on dev" in err


@dataclass(frozen=True, slots=True)
class FailingServer:
    async def ensure(self, root: Path) -> ServerRecord:
        raise BackgroundStartFailed(root, "process exited with code 1", "")


@dataclass(frozen=True, slots=True)
class KnownServer:
    async def ensure(self, root: Path) -> ServerRecord:
        return record()


@pytest.mark.asyncio
async def test_the_command_exits_one_when_the_server_does_not_start(tmp_path: Path) -> None:
    err = io.StringIO()
    request = SeriesCommandRequest(root=tmp_path, experiment_id="reply_quality")

    code = await run_series_command(request, FailingServer(), io.StringIO(), err)

    assert code == 1
    assert "did not start" in err.getvalue()


@pytest.mark.asyncio
async def test_the_command_talks_to_the_project_server_with_its_token(tmp_path: Path) -> None:
    server = FakeServer(SeriesStatus.RUNNING, iter(((SeriesStatus.DONE, 16),)))
    request = SeriesCommandRequest(
        root=tmp_path,
        experiment_id="reply_quality",
        on=SeriesSplit.HOLDOUT,
        cases=3,
        repeats=2,
        cap_usd=Decimal("0.5"),
    )

    code = await run_series_command(request, KnownServer(), io.StringIO(), io.StringIO(), httpx2.MockTransport(server))

    assert code == 0
    start = server.requests[0]
    assert start.headers["Authorization"] == f"Bearer {TOKEN}"
    body = json.loads(start.content)
    assert (body["experiment_id"], body["on"], body["cases"], body["repeats"], body["cap_usd"]) == (
        "reply_quality",
        "holdout",
        3,
        2,
        "0.5",
    )
    assert len(body["client_op_id"]) == 26


@pytest.mark.parametrize(
    "arguments",
    [
        ("--cases", "0"),
        ("--repeats", "21"),
        ("--cap", "-1"),
        ("--cap", "lots"),
        ("--on", "test"),
    ],
)
def test_invalid_arguments_exit_two(arguments: tuple[str, ...]) -> None:
    assert main(["series", "reply_quality", *arguments]) == 2


def test_a_path_without_a_project_exits_two(tmp_path: Path) -> None:
    assert main(["series", "reply_quality", "--path", str(tmp_path)]) == 2


def test_a_done_series_names_its_infrastructure_errors() -> None:
    tally = VariantAggregates(
        variant_id=VariantId("base"),
        role=VariantRole.BASELINE,
        cases=4,
        attempts=16,
        counted=12,
        infra_errors=4,
        spend_usd=Decimal(0),
        pass_k=None,
        icc=None,
        stability=None,
        metrics={},
        runtime_checks={},
        models=(),
    )
    series = detail(SeriesStatus.DONE, 16).model_copy(update={"aggregates": (tally,)})

    lines = list(done_lines(series, "link"))

    assert lines[1] == (
        "4 attempts of 16 hit infrastructure errors, such as a missing provider key: each attempt run names its error"
    )


INFRA_FAILURE: Final = (
    "every attempt hit an infrastructure error (16 of 16); the first one: provider_key_missing: no key"
)
INFRA_VERDICT: Final = "No finding: 16 of 16 attempts hit infrastructure errors."


def infra_failed() -> SeriesDetailView:
    verdict = SeriesVerdict(state=VerdictState.INVALID, reason=VerdictReason.INFRA_ERRORS, text=INFRA_VERDICT)
    failed = detail(SeriesStatus.FAILED, 16)
    return failed.model_copy(update={"verdict": verdict, "error": INFRA_FAILURE})


def test_a_series_failed_by_infrastructure_errors_names_the_error_the_verdict_and_studio() -> None:
    lines = list(failed_lines(infra_failed(), "link"))

    assert lines == [
        f"series {SERIES} failed: {INFRA_FAILURE}",
        f"verdict invalid: {INFRA_VERDICT}",
        "each attempt run names its error in Studio: link",
    ]


@pytest.mark.asyncio
async def test_a_series_failed_by_infrastructure_errors_exits_one() -> None:
    server = FakeServer(SeriesStatus.RUNNING, iter(((SeriesStatus.FAILED, 16),)))

    code, out, _ = await drive(server)

    assert code == 1
    assert f"series {SERIES} failed: the engine stopped" in out
    assert f"each attempt run names its error in Studio: {BASE}/research/series/{SERIES}" in out


def test_the_started_line_names_the_plan_and_the_cap_without_a_price() -> None:
    line = started_line(started(SeriesStatus.RUNNING))

    assert line == (
        f"series {SERIES} started on dev: 16 attempts (4 cases × 2 repeats × 2 variants), cap $3.00, status running"
    )


def test_a_launch_below_the_recommended_cases_says_so() -> None:
    running = started(SeriesStatus.RUNNING)
    recommended = Recommendation(cases=60, repeats=2, reason=RecommendationReason.WIDE, text="about 60 cases")
    short = running.launch.model_copy(update={"recommended": recommended, "below_recommended": True})

    assert list(started_lines(running)) == [started_line(running)]
    assert list(started_lines(running.model_copy(update={"launch": short}))) == [
        started_line(running),
        "below the recommended 60 cases: about 60 cases",
    ]


def test_the_progress_line_calls_a_spend_with_unpriced_attempts_a_lower_bound() -> None:
    running = detail(SeriesStatus.RUNNING, 4)
    bounded = running.model_copy(
        update={"spend": SeriesSpend(usd=Decimal("0.20"), cap_usd=Decimal("3.00"), unpriced_attempts=3)}
    )

    assert progress_line(running) == "4/16 attempts, $0.20 of $3.00, status running"
    assert progress_line(bounded) == (
        "4/16 attempts, at least $0.20 (3 attempts on a model without a known price) of $3.00, status running"
    )
