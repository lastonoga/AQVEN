import asyncio
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

from series_fixture import ABOVE_PROJECT_CAP, CHEAP_MODEL, WRITER_MODEL, write_project
from series_harness import ScriptedLabels, ScriptedModels, SeriesHarness, series_engine, settled

from aqven.series.model import AttemptRecord, SeriesStatus
from aqven.series.views import SeriesGetResult, SeriesStartRequest
from aqven.spec import ExperimentId, VariantId
from aqven.write.model import WriteActor
from aqven_llm import TokenPrice

AGENT: Final = WriteActor(kind="agent", id="mcp")
HUMAN: Final = WriteActor(kind="human", id="kir")
SOLO: Final = ExperimentId("triage_solo")
UNPRICED_NAME: Final = "acme-unreleased-model"


@dataclass(slots=True)
class WarmLog:
    asked: list[frozenset[str]] = field(default_factory=list[frozenset[str]])

    def cached(self, model: str) -> TokenPrice | None:
        return None

    async def warm(self, models: Iterable[str]) -> None:
        self.asked.append(frozenset(models))


async def approved_series(harness: SeriesHarness) -> tuple[SeriesGetResult, tuple[AttemptRecord, ...]]:
    started = await harness.service.start(SeriesStartRequest(experiment_id=SOLO), AGENT)
    result = await settled(harness.service, started.series_id)
    return result, await harness.services.store.attempts(started.series_id)


def test_attempts_on_a_model_without_a_price_are_counted_as_unpriced(tmp_path: Path) -> None:
    root = write_project(tmp_path)
    models = ScriptedModels(writer=ScriptedLabels(UNPRICED_NAME))

    with series_engine(root, models) as harness:
        result, attempts = asyncio.run(approved_series(harness))

    unpriced = {attempt.variant_id: attempt.unpriced_calls for attempt in attempts if attempt.unpriced_calls}
    priced = [attempt for attempt in attempts if attempt.variant_id == VariantId("cheap")]
    assert result.series.status is SeriesStatus.DONE
    assert set(unpriced) == {VariantId("writer")}
    assert all(attempt.unpriced_calls == 0 and attempt.cost_usd > 0 for attempt in priced)
    assert result.series.spend.unpriced_attempts == len(priced)


def test_a_fully_priced_series_has_no_unpriced_attempts(tmp_path: Path) -> None:
    root = write_project(tmp_path)

    with series_engine(root, ScriptedModels()) as harness:
        result, attempts = asyncio.run(approved_series(harness))

    assert all(attempt.unpriced_calls == 0 for attempt in attempts)
    assert result.series.spend.unpriced_attempts == 0


async def approved_above_the_project_cap(harness: SeriesHarness) -> SeriesGetResult:
    started = await harness.service.start(SeriesStartRequest(experiment_id=SOLO, cap_usd=ABOVE_PROJECT_CAP), AGENT)
    await harness.service.approve(started.series_id, HUMAN)
    return await settled(harness.service, started.series_id)


def test_starting_and_approving_a_series_warm_the_prices_of_its_models(tmp_path: Path) -> None:
    root = write_project(tmp_path)
    warm = WarmLog()

    with series_engine(root, ScriptedModels(), engine_prices=warm) as harness:
        asyncio.run(approved_above_the_project_cap(harness))

    assert len(warm.asked) == 2
    assert all({WRITER_MODEL, CHEAP_MODEL} <= asked for asked in warm.asked)
