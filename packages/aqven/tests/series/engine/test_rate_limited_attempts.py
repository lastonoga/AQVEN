import asyncio
import json
from collections.abc import AsyncIterator, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

from pydantic_ai.exceptions import ModelHTTPError
from pydantic_ai.messages import ModelMessage
from pydantic_ai.models import Model
from pydantic_ai.models.function import AgentInfo, DeltaToolCall, DeltaToolCalls, FunctionModel
from series_fixture import CHEAP_MODEL, CRITIC_MODEL, WRITER_MODEL, write_project
from series_harness import (
    CHEAP_NAME,
    WRITER_NAME,
    ScriptedGrades,
    ScriptedLabels,
    SeriesHarness,
    label_for,
    prompt_text,
    series_engine,
    settled,
)

from aqven.series.ids import try_run_id
from aqven.series.model import AttemptRecord, OutcomeClass, SeriesRecord, SeriesStatus
from aqven.series.views import SeriesStartRequest
from aqven.spec import ExperimentId
from aqven.write.model import WriteActor

AGENT: Final = WriteActor(kind="agent", id="mcp")
EXPERIMENT: Final = ExperimentId("triage_limits")
ONCE: Final = "sometimes right"
ALWAYS: Final = "never right"
CALL_SECONDS: Final = 0.2
SECOND_TRY: Final = 2
FAIL_ON_RATE_LIMIT: Final = '    retention: "zero"\n  on_rate_limit: "fail"\n'
LIMITS_EXPERIMENT: Final = """apiVersion: "aqven/v1"
kind: "Experiment"
description: "A rate limit is not a result of the writer"
subject:
  flow: "triage"
cases:
  dataset: "triage_cases"
variants:
- id: "writer"
checks:
- id: "matches"
  kind: "binary"
  use: "expected"
  with:
    fields:
    - "label"
question:
  kind: "look"
plan:
  repeats: 1
"""


@dataclass(slots=True)
class ProbeWatch:
    running: int = 0
    peak: int = 0
    calls: int = 0
    beside_probe: int = 0
    probe_running: bool = False

    def enter(self) -> None:
        self.calls += 1
        self.beside_probe += int(self.probe_running)
        self.probe_running = self.probe_running or self.calls == 1
        self.running += 1
        self.peak = max(self.peak, self.running)

    def leave(self) -> None:
        self.running -= 1
        self.probe_running = False


@dataclass(slots=True)
class RateLimitedLabels:
    model_name: str
    watch: ProbeWatch
    counts: dict[str, int] = field(default_factory=dict[str, int])

    async def stream(self, messages: list[ModelMessage], info: AgentInfo) -> AsyncIterator[str | DeltaToolCalls]:
        text = prompt_text(messages)
        self.counts[text] = self.counts.get(text, 0) + 1
        self.watch.enter()
        try:
            await asyncio.sleep(CALL_SECONDS)
        finally:
            self.watch.leave()
        if ALWAYS in text or (ONCE in text and self.counts[text] == 1):
            raise ModelHTTPError(status_code=429, model_name=self.model_name, body="temporarily rate-limited upstream")
        payload = json.dumps({"label": label_for(text, 1)})
        if info.output_tools:
            yield {0: DeltaToolCall(name=info.output_tools[0].name, json_args=payload, tool_call_id="call_1")}
            return
        yield payload

    def calls_for(self, marker: str) -> int:
        return sum(count for text, count in self.counts.items() if marker in text)


@dataclass(slots=True)
class LimitedModels:
    watch: ProbeWatch = field(default_factory=ProbeWatch)
    writer: RateLimitedLabels = field(init=False)

    def __post_init__(self) -> None:
        self.writer = RateLimitedLabels(WRITER_NAME, self.watch)

    def mapping(self) -> Mapping[str, Model]:
        return {
            WRITER_MODEL: FunctionModel(stream_function=self.writer.stream, model_name=WRITER_NAME),
            CHEAP_MODEL: ScriptedLabels(CHEAP_NAME).model(),
            CRITIC_MODEL: ScriptedGrades().model(),
        }


def limited_project(parent: Path) -> Path:
    root = write_project(parent)
    project = root / "aqven.yaml"
    project.write_text(
        project.read_text(encoding="utf-8").replace('    retention: "zero"\n', FAIL_ON_RATE_LIMIT), encoding="utf-8"
    )
    experiment = root / "experiments" / "triage_limits" / "experiment.yaml"
    experiment.parent.mkdir(parents=True)
    experiment.write_text(LIMITS_EXPERIMENT, encoding="utf-8")
    return root


async def finished_series(harness: SeriesHarness) -> tuple[SeriesRecord, dict[str, AttemptRecord]]:
    started = await harness.service.start(SeriesStartRequest(experiment_id=EXPERIMENT), AGENT)
    await settled(harness.service, started.series_id)
    record = await harness.services.store.series(started.series_id)
    assert record is not None
    attempts = await harness.services.store.attempts(started.series_id)
    return record, {attempt.case_name: attempt for attempt in attempts}


def test_a_rate_limited_attempt_is_queued_once_more_and_counts_only_its_second_failure(tmp_path: Path) -> None:
    models = LimitedModels()

    with series_engine(limited_project(tmp_path), models) as harness:
        record, attempts = asyncio.run(finished_series(harness))

    retried = attempts["sometimes_1"]
    given_up = attempts["never_1"]
    assert record.status is SeriesStatus.DONE
    assert (retried.outcome, retried.run_id) == (OutcomeClass.OK, try_run_id(retried.attempt_id, SECOND_TRY))
    assert (given_up.outcome, given_up.error_code) == (OutcomeClass.INFRA_ERROR, "provider_error")
    assert given_up.run_id == try_run_id(given_up.attempt_id, SECOND_TRY)
    assert (models.writer.calls_for(ONCE), models.writer.calls_for(ALWAYS)) == (2, 2)
    assert {attempts[name].outcome for name in ("always_1", "plain_2")} == {OutcomeClass.OK}


def test_the_first_attempt_runs_alone_and_the_rest_run_side_by_side(tmp_path: Path) -> None:
    models = LimitedModels()

    with series_engine(limited_project(tmp_path), models) as harness:
        record, attempts = asyncio.run(finished_series(harness))

    assert record.status is SeriesStatus.DONE
    assert len(attempts) == 4
    assert models.watch.beside_probe == 0
    assert models.watch.peak > 1
