from typing import Final

import pytest
from series_records import attempt

from aqven.series.model import AttemptRecord, AttemptState, OutcomeClass, SeriesStatus
from aqven.series.workflow import closing_error, closing_status

SERIES: Final = "01999f2e-4b1c-7a3d-9e21-5c7d8f0a1b2c"


def closed(ordinal: int, outcome: OutcomeClass, code: str | None = None, message: str | None = None) -> AttemptRecord:
    row = attempt(SERIES, ordinal, AttemptState.FINISHED)
    return row.model_copy(update={"outcome": outcome, "error_code": code, "error_message": message})


@pytest.mark.parametrize(
    ("outcomes", "expected"),
    [
        ((OutcomeClass.INFRA_ERROR, OutcomeClass.INFRA_ERROR), SeriesStatus.FAILED),
        ((OutcomeClass.INFRA_ERROR, OutcomeClass.MODEL_FAIL), SeriesStatus.DONE),
        ((OutcomeClass.INFRA_ERROR, OutcomeClass.OK), SeriesStatus.DONE),
        ((OutcomeClass.INFRA_ERROR, OutcomeClass.BUDGET_CUT), SeriesStatus.DONE),
        ((), SeriesStatus.DONE),
    ],
)
def test_a_series_fails_only_when_every_attempt_hit_an_infrastructure_error(
    outcomes: tuple[OutcomeClass, ...], expected: SeriesStatus
) -> None:
    rows = [closed(ordinal, outcome) for ordinal, outcome in enumerate(outcomes)]

    assert closing_status(rows) is expected


def test_the_failure_names_the_first_attempt_error() -> None:
    rows = [
        closed(1, OutcomeClass.INFRA_ERROR, "provider_error", "the provider answered 503"),
        closed(0, OutcomeClass.INFRA_ERROR, "provider_key_missing", "OPENAI_API_KEY is not set"),
    ]

    assert closing_error(SeriesStatus.FAILED, rows) == (
        "every attempt hit an infrastructure error (2 of 2); "
        "the first one: provider_key_missing: OPENAI_API_KEY is not set"
    )
    assert closing_error(SeriesStatus.DONE, rows) is None
