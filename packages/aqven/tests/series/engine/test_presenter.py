from decimal import Decimal
from typing import Final

import pytest
from series_records import NOW, attempt, record

from aqven.series.model import (
    AttemptOutcome,
    AttemptState,
    OutcomeClass,
    SeriesAnalysis,
    SeriesMatrix,
    SeriesStatus,
    SeriesVerdict,
)
from aqven.series.presenter import SeriesProgressFacts, attempt_view, detail_view
from aqven.spec import AgentId, VerdictReason, VerdictState

SERIES: Final = "01999f2e-4b1c-7a3d-9e21-5c7d8f0a1b2c"
NO_DATA: Final = SeriesVerdict(
    state=VerdictState.INVALID, reason=VerdictReason.NO_DATA, text="No finding: the primary metric has no data."
)
SIGNAL: Final = SeriesVerdict(state=VerdictState.SIGNAL, reason=VerdictReason.DEV_SPLIT, text="Signal on dev.")


def analysis(verdict: SeriesVerdict | None) -> SeriesAnalysis:
    return SeriesAnalysis(
        variants=(),
        matrix=SeriesMatrix(columns=(), rows=()),
        thresholds=(),
        contrasts=(),
        verdict=verdict,
        infra_error_share=0.0,
    )


def unknown_model(agent_id: AgentId) -> str:
    return "unknown"


@pytest.mark.parametrize("status", [SeriesStatus.AWAITING_APPROVAL, SeriesStatus.RUNNING])
def test_a_series_with_no_finished_attempt_shows_no_verdict_yet(status: SeriesStatus) -> None:
    pending = record(SERIES, NOW).model_copy(update={"status": status})

    view = detail_view(
        pending, SeriesProgressFacts(done=0, spend=Decimal(0), waits=0), analysis(NO_DATA), unknown_model
    )

    assert view.verdict is None


def test_a_running_series_shows_the_live_verdict_once_attempts_finish() -> None:
    running = record(SERIES, NOW).model_copy(update={"status": SeriesStatus.RUNNING})

    view = detail_view(running, SeriesProgressFacts(done=1, spend=Decimal(0), waits=0), analysis(SIGNAL), unknown_model)

    assert view.verdict == SIGNAL


def test_a_finished_series_shows_the_stored_verdict() -> None:
    done = record(SERIES, NOW).model_copy(update={"status": SeriesStatus.DONE, "verdict": SIGNAL})

    view = detail_view(done, SeriesProgressFacts(done=2, spend=Decimal(0), waits=0), analysis(NO_DATA), unknown_model)

    assert view.verdict == SIGNAL


@pytest.mark.parametrize(
    ("code", "message", "expected"),
    [
        (
            "provider_key_missing",
            "no API key for provider openrouter",
            "provider_key_missing: no API key for provider openrouter",
        ),
        (None, "the scorer raised", "the scorer raised"),
        ("check_failed", None, "check_failed"),
        (None, None, None),
    ],
)
def test_an_attempt_row_names_its_error(code: str | None, message: str | None, expected: str | None) -> None:
    row = attempt(SERIES, 0, AttemptState.FINISHED).model_copy(
        update={"outcome": OutcomeClass.INFRA_ERROR, "error_code": code, "error_message": message}
    )

    assert attempt_view(row, AttemptOutcome.ERROR).error == expected
