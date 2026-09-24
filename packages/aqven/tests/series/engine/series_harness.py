import asyncio
import json
import time
from collections.abc import AsyncIterator, Callable, Generator, Mapping, Sequence
from contextlib import contextmanager
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Final

from pydantic import JsonValue, SecretStr
from pydantic_ai.messages import ModelMessage, ModelRequest, UserPromptPart
from pydantic_ai.models import Model
from pydantic_ai.models.function import AgentInfo, DeltaToolCall, DeltaToolCalls, FunctionModel
from series_fixture import CHEAP_MODEL, CRITIC_MODEL, WRITER_MODEL
from series_prices import FixedPrices

from aqven.engine.assembly import standard_engine_setup
from aqven.engine.lifecycle import EngineLifecycle
from aqven.engine.runtime import EngineRuntime
from aqven.ports.prices import NO_PRICES, PriceCache
from aqven.ports.settings import SettingKey, SettingScope, SettingView
from aqven.series.jobs import SeriesService
from aqven.series.model import (
    TERMINAL_STATUSES,
    AnalysisInput,
    AttemptRecord,
    SeriesAnalysis,
    SeriesMatrix,
    SeriesRecord,
    SeriesStatus,
    SeriesVerdict,
    StopCause,
)
from aqven.series.ports import ModelPrices, SeriesAnalyst
from aqven.series.services import SeriesServices, build_series_services
from aqven.series.slot import SERIES_SLOT
from aqven.series.views import SeriesGetRequest, SeriesGetResult
from aqven.series.workflow import REGISTERED_SERIES_WORKFLOWS
from aqven.server.workspace import ProjectWorkspace
from aqven.spec import LookQuestion, SeriesSplit, VerdictReason, VerdictState
from aqven.testing.engines import FixedModels, offline_environment

WRITER_NAME: Final = "gpt-4o-mini"
CHEAP_NAME: Final = "gpt-4.1-mini"
CRITIC_NAME: Final = "gpt-4.1-nano"
GOOD: Final = "ok"
BAD: Final = "bad"
SETTLE_SECONDS: Final = 120.0
POLL_SECONDS: Final = 0.1
FINDING_PATH: Final = "experiments/triage_agents/findings/series.yaml"


def prompt_text(messages: Sequence[ModelMessage]) -> str:
    texts = [
        part.content
        for message in messages
        if isinstance(message, ModelRequest)
        for part in message.parts
        if isinstance(part, UserPromptPart) and isinstance(part.content, str)
    ]
    return " ".join(texts)


def label_for(text: str, call: int) -> str:
    if "never" in text:
        return BAD
    if "sometimes" in text:
        return GOOD if call % 2 == 1 else BAD
    return GOOD


@dataclass(slots=True)
class ScriptedLabels:
    model_name: str
    delay: float = 0.0
    log: Path | None = None
    counts: dict[str, int] = field(default_factory=dict[str, int])

    @property
    def calls(self) -> int:
        return sum(self.counts.values())

    async def stream(self, messages: list[ModelMessage], info: AgentInfo) -> AsyncIterator[str | DeltaToolCalls]:
        text = prompt_text(messages)
        self.counts[text] = self.counts.get(text, 0) + 1
        self._record(text)
        await asyncio.sleep(self.delay)
        payload = json.dumps({"label": label_for(text, self.counts[text])})
        if info.output_tools:
            yield {0: DeltaToolCall(name=info.output_tools[0].name, json_args=payload, tool_call_id="call_1")}
            return
        yield payload

    def model(self) -> Model:
        return FunctionModel(stream_function=self.stream, model_name=self.model_name)

    def _record(self, text: str) -> None:
        if self.log is None:
            return
        with self.log.open("a", encoding="utf-8") as stream:
            stream.write(f"{self.model_name}\t{' '.join(text.split())}\n")


@dataclass(slots=True)
class ScriptedGrades:
    model_name: str = CRITIC_NAME
    calls: int = 0

    async def stream(self, messages: list[ModelMessage], info: AgentInfo) -> AsyncIterator[str | DeltaToolCalls]:
        self.calls += 1
        payload = json.dumps({"score": 0.8, "rationale": "the label fits"})
        if info.output_tools:
            yield {0: DeltaToolCall(name=info.output_tools[0].name, json_args=payload, tool_call_id="call_1")}
            return
        yield payload

    def model(self) -> Model:
        return FunctionModel(stream_function=self.stream, model_name=self.model_name)


@dataclass(slots=True)
class ScriptedModels:
    writer: ScriptedLabels = field(default_factory=lambda: ScriptedLabels(WRITER_NAME))
    cheap: ScriptedLabels = field(default_factory=lambda: ScriptedLabels(CHEAP_NAME))
    critic: ScriptedGrades = field(default_factory=ScriptedGrades)

    def mapping(self) -> Mapping[str, Model]:
        return {WRITER_MODEL: self.writer.model(), CHEAP_MODEL: self.cheap.model(), CRITIC_MODEL: self.critic.model()}


@dataclass(slots=True)
class MemorySettings:
    values: dict[tuple[SettingScope, str], JsonValue] = field(default_factory=dict[tuple[SettingScope, str], JsonValue])

    async def list_settings(self, scope: SettingScope) -> tuple[SettingView, ...]:
        return ()

    async def get_setting(self, scope: SettingScope, key: SettingKey) -> SettingView | None:
        if (scope, key) not in self.values:
            return None
        value = self.values[(scope, key)]
        return SettingView(scope=scope, key=key, kind="value", value=value, updated_at=datetime.now(UTC))

    async def set_value(self, scope: SettingScope, key: SettingKey, value: JsonValue) -> SettingView:
        self.values[(scope, key)] = value
        return SettingView(scope=scope, key=key, kind="value", value=value, updated_at=datetime.now(UTC))

    async def set_secret(self, scope: SettingScope, key: SettingKey, secret: SecretStr) -> SettingView:
        return SettingView(scope=scope, key=key, kind="secret", masked="••••", updated_at=datetime.now(UTC))

    async def delete_setting(self, scope: SettingScope, key: SettingKey) -> bool:
        return self.values.pop((scope, key), None) is not None

    async def read_secret(self, scope: SettingScope, key: SettingKey) -> SecretStr | None:
        return None


def stub_verdict(source: AnalysisInput) -> SeriesVerdict | None:
    if source.question is None or isinstance(source.question, LookQuestion):
        return None
    rules: tuple[tuple[bool, VerdictState, VerdictReason | None], ...] = (
        (source.status is SeriesStatus.CANCELLED, VerdictState.INVALID, VerdictReason.CANCELLED),
        (source.status is SeriesStatus.FAILED, VerdictState.INVALID, VerdictReason.INFRA_ERRORS),
        (source.stop is StopCause.BUDGET_CUT, VerdictState.INVALID, VerdictReason.BUDGET_CUT),
        (source.inputs_changed, VerdictState.INVALID, VerdictReason.INPUTS_CHANGED),
        (source.split is SeriesSplit.DEV, VerdictState.SIGNAL, VerdictReason.DEV_SPLIT),
        (True, VerdictState.CONFIRMED, None),
    )
    state, reason = next((state, reason) for matched, state, reason in rules if matched)
    return SeriesVerdict(state=state, reason=reason, text=f"stub {state.value}")


@dataclass(slots=True)
class StubAnalyst:
    inputs: list[AnalysisInput] = field(default_factory=list[AnalysisInput])

    def analyze(self, source: AnalysisInput) -> SeriesAnalysis:
        self.inputs.append(source)
        return SeriesAnalysis(
            variants=(),
            matrix=SeriesMatrix(columns=(), rows=()),
            thresholds=(),
            contrasts=(),
            verdict=stub_verdict(source),
            infra_error_share=0.0,
        )


@dataclass(slots=True)
class RecordingFindings:
    published: list[SeriesRecord] = field(default_factory=list[SeriesRecord])

    async def publish(self, record: SeriesRecord, attempts: Sequence[AttemptRecord]) -> str | None:
        self.published.append(record)
        return FINDING_PATH


@dataclass(frozen=True, slots=True)
class SeriesHarness:
    service: SeriesService
    services: SeriesServices
    runtime: EngineRuntime
    analyst: StubAnalyst
    findings: RecordingFindings
    settings: MemorySettings


@contextmanager
def series_engine(
    root: Path,
    models: ScriptedModels,
    settings: MemorySettings | None = None,
    real: SeriesAnalyst | None = None,
    prices: ModelPrices | None = None,
    engine_prices: PriceCache = NO_PRICES,
) -> Generator[SeriesHarness]:
    chosen = settings or MemorySettings()
    analyst = StubAnalyst()
    findings = RecordingFindings()
    workspace = ProjectWorkspace(root)
    known = FixedPrices() if prices is None else prices
    services = build_series_services(root, workspace, chosen, real or analyst, findings, known, "test")
    SERIES_SLOT.install(services)
    standard = standard_engine_setup(
        factories=FixedModels(models.mapping()), environ=offline_environment(), settings=chosen, prices=engine_prices
    )
    lifecycle = EngineLifecycle(root=root, setup=replace(standard, workflows=REGISTERED_SERIES_WORKFLOWS))
    try:
        runtime = lifecycle.launch()
        yield SeriesHarness(SeriesService(services), services, runtime, analyst, findings, chosen)
    finally:
        lifecycle.shutdown()
        SERIES_SLOT.clear()


async def wait_until(condition: Callable[[], bool], seconds: float = SETTLE_SECONDS) -> None:
    deadline = time.monotonic() + seconds
    while not condition():
        assert time.monotonic() < deadline, "the condition did not hold in time"
        await asyncio.sleep(POLL_SECONDS)


async def settled(service: SeriesService, series_id: str, seconds: float = SETTLE_SECONDS) -> SeriesGetResult:
    deadline = time.monotonic() + seconds
    request = SeriesGetRequest.model_validate({"series_id": series_id, "include_cases": True})
    result = await service.get(request)
    while result.series.status not in TERMINAL_STATUSES:
        assert time.monotonic() < deadline, f"series {series_id} is still {result.series.status}"
        await asyncio.sleep(POLL_SECONDS)
        result = await service.get(request)
    return result


async def reached(
    service: SeriesService, series_id: str, wanted: SeriesStatus, seconds: float = SETTLE_SECONDS
) -> SeriesGetResult:
    deadline = time.monotonic() + seconds
    request = SeriesGetRequest.model_validate({"series_id": series_id})
    result = await service.get(request)
    while result.series.status is not wanted:
        assert time.monotonic() < deadline, f"series {series_id} is {result.series.status}, not {wanted}"
        await asyncio.sleep(POLL_SECONDS)
        result = await service.get(request)
    return result
