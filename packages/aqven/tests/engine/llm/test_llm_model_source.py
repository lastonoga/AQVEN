import asyncio
import json
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Final

import pytest
from llm_harness import FakeScope, agent, answer_inference, answer_node, capabilities, project
from pydantic_ai.exceptions import UsageLimitExceeded
from pydantic_ai.messages import ModelMessage, ModelRequest, UserPromptPart
from pydantic_ai.models import Model, ModelRequestParameters
from pydantic_ai.models.function import AgentInfo, FunctionModel

from aqven.engine.assembly import EngineModelSource, ProviderKeys
from aqven.engine.request import RunSpec
from aqven.engine.runtime import RunBudgets
from aqven.ir import AgentModel
from aqven.models import declared_model_ref, declared_position
from aqven.models.usage import node_usage_log
from aqven.runtime import CapabilityRoute, CassetteConfig, CassetteMode, ModelProfile, ModelRoute
from aqven.runtime.address import RunId
from aqven.spec import FlowId, Limits, ModelString, ProviderName
from aqven.testing.engines import FixedModels, offline_environment

DECLARED: Final = "openrouter:openai/gpt-oss-20b"
ROUTED: Final = "openai:gpt-5.4-mini"
SECOND: Final = "openrouter:qwen/qwen3-32b"
PRICED_NAME: Final = "gpt-4o-mini"
ROOT_RUN: Final = RunId("run-7")
BRANCH_RUN: Final = RunId("run-7::fan#left")


@dataclass(slots=True)
class RunScope(FakeScope):
    run_spec: RunSpec = field(default_factory=lambda: RunSpec(flow_id=FlowId("support")))
    attempt: int = 1

    @property
    def root_run_id(self) -> RunId:
        return self.run_id


async def reply(messages: list[ModelMessage], info: AgentInfo) -> AsyncIterator[str]:
    yield "ok"


def scope(spec: RunSpec, run_id: RunId = ROOT_RUN) -> RunScope:
    compiled, flow = project(answer_node(), [agent()], [answer_inference()])
    return RunScope(compiled, flow, {}, run_id=run_id, run_spec=spec)


def source(budgets: RunBudgets | None = None) -> EngineModelSource:
    factories = FixedModels({DECLARED: FunctionModel(stream_function=reply, model_name=PRICED_NAME)})
    return EngineModelSource(factories, ProviderKeys(None, offline_environment()), budgets=budgets)


def built(model_source: EngineModelSource, run_scope: RunScope) -> Model:
    return asyncio.run(model_source.model(run_scope, agent(), frozenset()))


def ask(model: Model) -> str | None:
    messages: list[ModelMessage] = [ModelRequest(parts=[UserPromptPart("hello")])]
    response = asyncio.run(model.request(messages, None, ModelRequestParameters()))
    return declared_model_ref(response)


def routed_spec(cassettes: Path) -> RunSpec:
    profile = ModelProfile(
        name="cheap", routes=(CapabilityRoute(models=frozenset({DECLARED}), route=ModelRoute(model=ROUTED)),)
    )
    return RunSpec(
        flow_id=FlowId("support"),
        models=profile,
        cassettes=CassetteConfig(directory=cassettes, mode=CassetteMode.RECORD),
    )


def test_a_routed_call_writes_the_actual_model_into_the_response_and_the_cassette(tmp_path: Path) -> None:
    model = built(source(), scope(routed_spec(tmp_path)))

    reported = ask(model)

    recorded = [json.loads(path.read_text(encoding="utf-8")) for path in tmp_path.rglob("*.json")]
    assert reported == ROUTED
    assert [item["model_ref"] for item in recorded] == [ROUTED]


def test_every_settled_request_lands_in_the_node_usage_log() -> None:
    model = built(source(), scope(RunSpec(flow_id=FlowId("support"))))

    with node_usage_log() as log:
        reported = ask(model)

    assert reported == DECLARED
    assert [entry.model_ref for entry in log.entries] == [DECLARED]
    assert log.total_cost() > Decimal(0)


def test_the_run_request_limit_is_shared_by_the_models_of_every_branch() -> None:
    budgets = RunBudgets()
    spec = RunSpec(flow_id=FlowId("support"), limits=Limits(requests=1))
    model_source = source(budgets)
    first = built(model_source, scope(spec))
    second = built(model_source, scope(spec, BRANCH_RUN))

    ask(first)

    with pytest.raises(UsageLimitExceeded):
        ask(second)


def test_the_run_spend_limit_stops_the_call_that_crosses_it() -> None:
    spec = RunSpec(flow_id=FlowId("support"), limits=Limits(usd_micros=1))
    model = built(source(RunBudgets()), scope(spec))

    with pytest.raises(UsageLimitExceeded):
        ask(model)


def test_run_budgets_follow_the_root_run_and_are_dropped_after_it() -> None:
    budgets = RunBudgets()
    limits = Limits(requests=3)

    shared = budgets.budget(ROOT_RUN, limits)
    same = budgets.budget(BRANCH_RUN, limits)
    budgets.discard(BRANCH_RUN)

    assert shared is not None and shared is same
    assert shared.limits.request_limit == 3
    assert budgets.budget(ROOT_RUN, None) is None
    assert budgets.entries == {}


def test_the_chain_can_start_at_a_fallback_model_and_stamps_its_position() -> None:
    fallback = AgentModel(model=ModelString(SECOND), provider=ProviderName("openrouter"), capabilities=capabilities())
    two = agent(models=(*agent().models, fallback))
    factories = FixedModels(
        {
            DECLARED: FunctionModel(stream_function=reply, model_name=PRICED_NAME),
            SECOND: FunctionModel(stream_function=reply, model_name=PRICED_NAME),
        }
    )
    model_source = EngineModelSource(factories, ProviderKeys(None, offline_environment()))
    run_scope = scope(RunSpec(flow_id=FlowId("support")))
    messages: list[ModelMessage] = [ModelRequest(parts=[UserPromptPart("hello")])]

    first = asyncio.run(model_source.model(run_scope, two, frozenset()))
    second = asyncio.run(model_source.model(run_scope, two, frozenset(), 1))
    answered = asyncio.run(second.request(messages, None, ModelRequestParameters()))
    primary = asyncio.run(first.request(messages, None, ModelRequestParameters()))

    assert (declared_model_ref(answered), declared_position(answered)) == (SECOND, 1)
    assert (declared_model_ref(primary), declared_position(primary)) == (DECLARED, 0)
