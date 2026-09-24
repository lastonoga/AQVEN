import asyncio
from collections.abc import AsyncIterator, Iterable, Mapping
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Final

from pydantic import BaseModel
from pydantic_ai.messages import ModelMessage
from pydantic_ai.models.function import AgentInfo, DeltaToolCall, FunctionModel

from aqven.runtime import CapabilityRoute, ModelProfile, ModelRoute, NodeFinished, Project, RunOptions, RunResult
from aqven.spec import Limits
from aqven.testing.engines import EngineSession
from aqven_llm import TokenPrice

ALIAS_SHOP: Final = Path(__file__).parents[1] / "fixtures" / "alias_shop"
DECLARED: Final = "openai:gpt-5.4-mini"
ROUTED: Final = "openrouter:openai/gpt-oss-20b"
PRICED_NAME: Final = "gpt-4o-mini"
UNPRICED_NAME: Final = "acme-unreleased-model"
DECLARED_PRICE: Final = TokenPrice(Decimal("0.00001"), Decimal("0.00002"), None, Decimal("0.001"), "openai")
ANSWER: Final = '{"text": "a short reply"}'
BROKEN: Final = '{"text": '

type Chunk = str | dict[int, DeltaToolCall]


def scripted(payload: str, model_name: str = PRICED_NAME) -> FunctionModel:
    async def stream(messages: list[ModelMessage], info: AgentInfo) -> AsyncIterator[Chunk]:
        if info.output_tools:
            yield {0: DeltaToolCall(name=info.output_tools[0].name, json_args=payload, tool_call_id="out")}
            return
        yield payload

    return FunctionModel(stream_function=stream, model_name=model_name)


@dataclass(slots=True)
class RecordingPrices:
    table: Mapping[str, TokenPrice] = field(default_factory=dict[str, TokenPrice])
    warmed: dict[str, TokenPrice] = field(default_factory=dict[str, TokenPrice])
    asked: list[tuple[str, ...]] = field(default_factory=list[tuple[str, ...]])

    def cached(self, model: str) -> TokenPrice | None:
        return self.warmed.get(model)

    async def warm(self, models: Iterable[str]) -> None:
        wanted = tuple(models)
        self.asked.append(wanted)
        self.warmed.update({model: self.table[model] for model in wanted if model in self.table})


@dataclass(slots=True)
class BrokenPrices:
    def cached(self, model: str) -> TokenPrice | None:
        return None

    async def warm(self, models: Iterable[str]) -> None:
        raise RuntimeError("price list is offline")


def intake(options: RunOptions) -> tuple[RunResult[BaseModel], tuple[NodeFinished, ...]]:
    handle = Project.load(ALIAS_SHOP).flow("intake")

    async def scenario() -> tuple[RunResult[BaseModel], tuple[NodeFinished, ...]]:
        run = await handle.start(handle.input_model.model_validate({"text": "  lamp  flickers "}), options)
        result = await run.result()
        return result, tuple([event async for event in run.events() if isinstance(event, NodeFinished)])

    return asyncio.run(scenario())


def reply_node(finished: tuple[NodeFinished, ...]) -> NodeFinished:
    (reply,) = (event for event in finished if event.address.node_id == "reply")
    return reply


def test_a_routed_call_reports_the_model_it_actually_used(aqven_engine: EngineSession) -> None:
    aqven_engine.models({DECLARED: scripted(ANSWER)})
    profile = ModelProfile(
        name="cheap", routes=(CapabilityRoute(models=frozenset({DECLARED}), route=ModelRoute(model=ROUTED)),)
    )

    result, finished = intake(RunOptions(models=profile))

    assert result.status == "completed"
    assert reply_node(finished).model == ROUTED


def test_an_unrouted_call_reports_the_declared_model(aqven_engine: EngineSession) -> None:
    aqven_engine.models({DECLARED: scripted(ANSWER)})

    result, finished = intake(RunOptions())

    assert result.status == "completed"
    assert reply_node(finished).model == DECLARED
    assert reply_node(finished).cost_usd > Decimal(0)
    assert result.cost_usd == reply_node(finished).cost_usd


def test_a_node_that_exhausts_its_retries_keeps_its_cost_and_model(aqven_engine: EngineSession) -> None:
    aqven_engine.models({DECLARED: scripted(BROKEN)})

    result, finished = intake(RunOptions())

    reply = reply_node(finished)
    assert result.status == "failed"
    assert reply.status == "failed"
    assert reply.cost_usd > Decimal(0)
    assert reply.model == DECLARED
    assert result.cost_usd == reply.cost_usd


def test_the_run_spend_limit_stops_the_run_as_budget_exceeded(aqven_engine: EngineSession) -> None:
    aqven_engine.models({DECLARED: scripted(ANSWER)})

    result, finished = intake(RunOptions(limits=Limits(usd_micros=1)))

    assert result.status == "failed"
    assert result.error is not None and result.error.code == "budget_exceeded"
    assert reply_node(finished).status == "failed"


def test_finished_nodes_carry_a_wait_that_never_exceeds_the_latency(aqven_engine: EngineSession) -> None:
    aqven_engine.models({DECLARED: scripted(ANSWER)})

    _, finished = intake(RunOptions())

    assert finished
    assert all(0 <= event.wait_ms <= event.latency_ms for event in finished)


def test_a_call_priced_by_genai_prices_says_so_on_its_node(aqven_engine: EngineSession) -> None:
    aqven_engine.models({DECLARED: scripted(ANSWER)})

    _, finished = intake(RunOptions())

    reply = reply_node(finished)
    assert (reply.cost_source, reply.unpriced_calls) == ("genai", 0)


def test_a_launch_warms_the_plan_models_and_the_node_is_priced_from_the_table(aqven_engine: EngineSession) -> None:
    prices = RecordingPrices(table={DECLARED: DECLARED_PRICE})
    aqven_engine.models({DECLARED: scripted(ANSWER)}, prices=prices)

    result, finished = intake(RunOptions())

    reply = reply_node(finished)
    assert prices.asked == [(DECLARED,)]
    assert (reply.cost_source, reply.unpriced_calls) == ("prices", 0)
    assert reply.cost_usd == DECLARED_PRICE.cost(reply.tokens_in, reply.tokens_out)
    assert result.cost_usd == reply.cost_usd


def test_a_launch_warms_the_routed_models_too(aqven_engine: EngineSession) -> None:
    prices = RecordingPrices()
    aqven_engine.models({DECLARED: scripted(ANSWER)}, prices=prices)
    profile = ModelProfile(
        name="cheap", routes=(CapabilityRoute(models=frozenset({DECLARED}), route=ModelRoute(model=ROUTED)),)
    )

    intake(RunOptions(models=profile))

    assert prices.asked == [(DECLARED, ROUTED)]


def test_a_call_without_any_price_is_unknown_on_its_node_not_free(aqven_engine: EngineSession) -> None:
    aqven_engine.models({DECLARED: scripted(ANSWER, UNPRICED_NAME)})

    result, finished = intake(RunOptions())

    reply = reply_node(finished)
    assert result.status == "completed"
    assert (reply.cost_source, reply.unpriced_calls, reply.cost_usd) == ("unknown", 1, Decimal(0))


def test_a_failed_warm_never_stops_the_run(aqven_engine: EngineSession) -> None:
    aqven_engine.models({DECLARED: scripted(ANSWER)}, prices=BrokenPrices())

    result, finished = intake(RunOptions())

    assert result.status == "completed"
    assert reply_node(finished).cost_source == "genai"
