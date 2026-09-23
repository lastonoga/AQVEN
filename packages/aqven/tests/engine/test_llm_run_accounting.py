import asyncio
from collections.abc import AsyncIterator
from decimal import Decimal
from pathlib import Path
from typing import Final

from pydantic import BaseModel
from pydantic_ai.messages import ModelMessage
from pydantic_ai.models.function import AgentInfo, DeltaToolCall, FunctionModel

from aqven.runtime import CapabilityRoute, ModelProfile, ModelRoute, NodeFinished, Project, RunOptions, RunResult
from aqven.spec import Limits
from aqven.testing.engines import EngineSession

ALIAS_SHOP: Final = Path(__file__).parents[1] / "fixtures" / "alias_shop"
DECLARED: Final = "openai:gpt-5.4-mini"
ROUTED: Final = "openrouter:openai/gpt-oss-20b"
PRICED_NAME: Final = "gpt-4o-mini"
ANSWER: Final = '{"text": "a short reply"}'
BROKEN: Final = '{"text": '

type Chunk = str | dict[int, DeltaToolCall]


def scripted(payload: str) -> FunctionModel:
    async def stream(messages: list[ModelMessage], info: AgentInfo) -> AsyncIterator[Chunk]:
        if info.output_tools:
            yield {0: DeltaToolCall(name=info.output_tools[0].name, json_args=payload, tool_call_id="out")}
            return
        yield payload

    return FunctionModel(stream_function=stream, model_name=PRICED_NAME)


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
