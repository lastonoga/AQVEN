from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from typing import Final

from aqven.runtime.address import RunId
from aqven.runtime.runs import Page
from aqven.series import (
    TERMINAL_STATUSES,
    AttemptFinishedEvent,
    AttemptId,
    ExperimentOrigin,
    LaunchPlan,
    LaunchRequest,
    OutcomeClass,
    QuestionView,
    Recommendation,
    RecommendationReason,
    SeriesCancelRequest,
    SeriesCaseRow,
    SeriesCasesQuery,
    SeriesDetailView,
    SeriesEvent,
    SeriesFinishedEvent,
    SeriesGetRequest,
    SeriesGetResult,
    SeriesId,
    SeriesListQuery,
    SeriesMatrix,
    SeriesProgress,
    SeriesSpend,
    SeriesStarted,
    SeriesStartRequest,
    SeriesStatus,
    SeriesStatusEvent,
    SeriesSummaryView,
    SeriesVerdict,
)
from aqven.server.errors import ApiFailure
from aqven.spec import DatasetId, ExperimentId, FlowId, SeriesSplit, VariantId, VerdictState
from aqven.write.model import WriteActor

MOMENT: Final = datetime(2026, 9, 24, 10, 0, tzinfo=UTC)
SERIES_ID: Final = SeriesId("01999f2e-4b1c-7a3d-9e21-5c7d8f0a1b2c")
DONE_ID: Final = SeriesId("01999f2f-0000-7000-8000-000000000001")
KNOWN_EXPERIMENT: Final = ExperimentId("reply_quality")
CAP: Final = Decimal("0.53")


def launch_plan(on: SeriesSplit = SeriesSplit.DEV) -> LaunchPlan:
    return LaunchPlan(
        on=on,
        cases=4,
        repeats=2,
        variants=2,
        attempts=16,
        available=4,
        half_width=0.2,
        mde=0.3,
        margin=0.05,
        spread=0.5,
        spread_source="prior",
        icc=0.3,
        recommended=Recommendation(cases=60, repeats=2, reason=RecommendationReason.WIDE, text="about 60 cases"),
        below_recommended=True,
        needs_approval=False,
        project_cap_usd=Decimal("1.00"),
        cap_usd=CAP,
    )


def detail(
    series_id: SeriesId,
    status: SeriesStatus,
    experiment_id: ExperimentId = KNOWN_EXPERIMENT,
    done: int = 0,
    spend: Decimal = Decimal(0),
) -> SeriesDetailView:
    verdict = (
        SeriesVerdict(state=VerdictState.SIGNAL, reason=None, text="Signal on dev, not a finding: gpt is ahead.")
        if status is SeriesStatus.DONE
        else None
    )
    return SeriesDetailView(
        series_id=series_id,
        origin=ExperimentOrigin(experiment_id=experiment_id),
        flow_id=FlowId("intake"),
        dataset_id=DatasetId("intake_cases"),
        question="compare",
        on=SeriesSplit.DEV,
        cases=4,
        repeats=2,
        variants=(VariantId("base"), VariantId("alt")),
        status=status,
        progress=SeriesProgress(done=done, total=16),
        spend=SeriesSpend(usd=spend, cap_usd=CAP),
        verdict=verdict,
        waits=1 if status is SeriesStatus.WAITING_HUMAN else 0,
        started_at=MOMENT,
        finished_at=MOMENT if status in TERMINAL_STATUSES else None,
        question_detail=QuestionView(kind="compare", metric="success_rate", baseline=VariantId("base")),
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


def summary(view: SeriesDetailView) -> SeriesSummaryView:
    return SeriesSummaryView.model_validate(view.model_dump())


def started(view: SeriesDetailView) -> SeriesStarted:
    return SeriesStarted.model_validate({**summary(view).model_dump(), "launch": view.launch})


def series_events(series_id: SeriesId) -> tuple[SeriesEvent, ...]:
    return (
        SeriesStatusEvent(seq=1, at=MOMENT, series_id=series_id, status=SeriesStatus.RUNNING),
        AttemptFinishedEvent(
            seq=2,
            at=MOMENT,
            series_id=series_id,
            attempt_id=AttemptId("0cf98137-2d99-5695-8fe4-983a861383ab"),
            ordinal=0,
            variant_id=VariantId("base"),
            case_name="question",
            repeat=1,
            run_id=RunId("689d28f5-41a5-5e36-9978-fb028ec88b4f"),
            outcome=OutcomeClass.OK,
            passed=True,
            cost_usd=Decimal("0.004"),
            done=1,
            total=16,
            spend_usd=Decimal("0.004"),
        ),
        SeriesFinishedEvent(
            seq=3, at=MOMENT, series_id=series_id, status=SeriesStatus.DONE, verdict=VerdictState.SIGNAL
        ),
    )


def missing(series_id: str) -> ApiFailure:
    return ApiFailure("NOT_FOUND", f"series {series_id} was not found")


@dataclass(slots=True)
class FakeSeriesJobs:
    views: dict[SeriesId, SeriesDetailView] = field(
        default_factory=lambda: {
            SERIES_ID: detail(SERIES_ID, SeriesStatus.RUNNING, done=4, spend=Decimal("0.03")),
            DONE_ID: detail(DONE_ID, SeriesStatus.DONE, done=16, spend=Decimal("0.11")),
        }
    )
    starts: list[tuple[SeriesStartRequest, WriteActor]] = field(
        default_factory=list[tuple[SeriesStartRequest, WriteActor]]
    )
    gets: list[SeriesGetRequest] = field(default_factory=list[SeriesGetRequest])
    approvals: list[tuple[SeriesId, WriteActor, Decimal | None]] = field(
        default_factory=list[tuple[SeriesId, WriteActor, Decimal | None]]
    )
    cancels: list[SeriesCancelRequest] = field(default_factory=list[SeriesCancelRequest])
    plans: list[tuple[ExperimentId, LaunchRequest]] = field(default_factory=list[tuple[ExperimentId, LaunchRequest]])
    event_reads: list[int] = field(default_factory=list[int])
    queries: list[SeriesListQuery] = field(default_factory=list[SeriesListQuery])

    def _view(self, series_id: SeriesId) -> SeriesDetailView:
        view = self.views.get(series_id)
        if view is None:
            raise missing(series_id)
        return view

    async def launch_plan(self, experiment_id: ExperimentId, request: LaunchRequest) -> LaunchPlan:
        if experiment_id != KNOWN_EXPERIMENT:
            raise ApiFailure("NOT_FOUND", f"experiment {experiment_id} is not in the project")
        self.plans.append((experiment_id, request))
        return launch_plan(request.on)

    async def start(self, request: SeriesStartRequest, actor: WriteActor) -> SeriesStarted:
        if request.experiment_id != KNOWN_EXPERIMENT:
            raise ApiFailure("NOT_FOUND", f"experiment {request.experiment_id} is not in the project")
        self.starts.append((request, actor))
        return started(self._view(SERIES_ID))

    async def get(self, request: SeriesGetRequest) -> SeriesGetResult:
        self.gets.append(request)
        view = self._view(request.series_id)
        cases = () if request.include_cases else None
        return SeriesGetResult(series=view, cases=cases, hidden_cases=0)

    async def list(self, query: SeriesListQuery) -> Page[SeriesSummaryView]:
        self.queries.append(query)
        rows = tuple(
            summary(view)
            for view in self.views.values()
            if (query.status is None or view.status is query.status)
            and (query.experiment_id is None or view.origin == ExperimentOrigin(experiment_id=query.experiment_id))
        )
        return Page[SeriesSummaryView](items=rows[: query.limit], next_cursor=None, total_estimate=len(rows))

    async def cases(self, series_id: SeriesId, query: SeriesCasesQuery) -> tuple[SeriesCaseRow, ...]:
        self._view(series_id)
        return ()

    async def approve(
        self, series_id: SeriesId, actor: WriteActor, cap_usd: Decimal | None = None
    ) -> SeriesSummaryView:
        view = self._view(series_id)
        if view.status is not SeriesStatus.AWAITING_APPROVAL:
            raise ApiFailure("SERIES_STATE_CONFLICT", f"series {series_id} is {view.status}, not awaiting approval")
        self.approvals.append((series_id, actor, cap_usd))
        return summary(view)

    async def cancel(self, request: SeriesCancelRequest) -> SeriesSummaryView:
        view = self._view(request.series_id)
        if view.status in TERMINAL_STATUSES:
            raise ApiFailure("SERIES_STATE_CONFLICT", f"series {request.series_id} is already {view.status}")
        self.cancels.append(request)
        return summary(view.model_copy(update={"status": SeriesStatus.CANCELLED}))

    async def events(self, series_id: SeriesId, after_seq: int) -> AsyncIterator[SeriesEvent]:
        self.event_reads.append(after_seq)
        for event in series_events(series_id):
            if event.seq > after_seq:
                yield event
