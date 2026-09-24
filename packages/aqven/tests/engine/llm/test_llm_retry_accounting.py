import asyncio
import json
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Final, Literal

import httpx2
import pytest
from llm_harness import Chunk, SettledCosts, agent, answer_inference, answer_node, capabilities, llm_bed, tool_call
from pydantic import BaseModel, JsonValue
from pydantic_ai.models import override_allow_model_requests

from aqven.engine.assembly import EngineModelSource, ProjectModelFactories, ProviderKeys
from aqven.engine.llm import OUTPUT_TOOL_NAME
from aqven.ir import AgentModel, CodeEvaluator, CompiledAgent, CompiledAgentOutput, CompiledCheck, CompiledInference
from aqven.policies import NoParams, Verdict
from aqven.ports.execution import NodeFailed
from aqven.spec import CodeRef, ModelString, OnFail, ProviderName
from aqven.testing.engines import offline_environment

type Ending = Literal["completed", "errored"]

NEVER_FITS: Final = CodeRef("shop.checks:never_fits")
RETRIES: Final = 3
PARALLEL_CALLS: Final = 14
ANSWER: Final = '{"reply": "the same reply again", "confidence": 0.5}'
RUN_INPUT: Final[dict[str, JsonValue]] = {"question": "where is my order?", "product": None}
PRIMARY: Final = ModelString("openrouter:google/gemini-2.5-flash-lite")
FALLBACK: Final = ModelString("openrouter:qwen/qwen3-max")
UPSTREAM: Final = "google/gemini-2.5-flash-lite"


def never_fits(value: BaseModel, context: object, params: NoParams) -> Verdict:
    return Verdict(passed=False, reason="the reply never fits")


def rejected_answer() -> CompiledInference:
    check = CompiledCheck(name="fits", evaluator=CodeEvaluator(run=NEVER_FITS), on_fail=OnFail.RETRY)
    return answer_inference(checks=(check,))


def retrying_writer(*models: ModelString) -> CompiledAgent:
    output = CompiledAgentOutput(retries=RETRIES, strict=False)
    if not models:
        return agent(output=output)
    choices = tuple(
        AgentModel(model=model, provider=ProviderName("openrouter"), capabilities=capabilities(strict=False))
        for model in models
    )
    return agent(models=choices, output=output)


def parallel_answers(turn: int, calls: int) -> list[Chunk]:
    return [tool_call(OUTPUT_TOOL_NAME, ANSWER, f"out-{turn}-{index}", index) for index in range(calls)]


def test_every_retry_answered_with_parallel_output_calls_is_paid_by_the_node() -> None:
    turns = [parallel_answers(1, 1), *(parallel_answers(turn, 3) for turn in range(2, RETRIES + 2))]
    costs = SettledCosts()
    bed = llm_bed(
        turns,
        answer_node(),
        [retrying_writer()],
        [rejected_answer()],
        RUN_INPUT,
        code={NEVER_FITS: never_fits},
        models=costs.priced,
    )

    outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeFailed)
    assert outcome.error.code == "MODEL_RETRIES_EXHAUSTED"
    assert outcome.usage.requests == len(costs.seen) == len(bed.scripted.seen) == RETRIES + 1
    assert all(entry.usage.output_tokens > 0 for entry in costs.seen)
    assert outcome.usage.tokens_in == sum(entry.usage.input_tokens for entry in costs.seen)
    assert outcome.usage.tokens_out == sum(entry.usage.output_tokens for entry in costs.seen)
    assert outcome.usage.cost_usd == costs.total()


@dataclass(frozen=True, slots=True)
class Reported:
    prompt_tokens: int
    completion_tokens: int
    cost: Decimal

    def usage(self) -> dict[str, JsonValue]:
        return {
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "total_tokens": self.prompt_tokens + self.completion_tokens,
            "cost": float(self.cost),
            "is_byok": False,
        }


def openrouter_chunk(
    delta: Mapping[str, JsonValue], finish: str | None, native: str | None, usage: Reported | None = None
) -> dict[str, JsonValue]:
    choice: dict[str, JsonValue] = {
        "index": 0,
        "delta": dict(delta),
        "finish_reason": finish,
        "native_finish_reason": native,
    }
    chunk: dict[str, JsonValue] = {
        "id": "gen-offline",
        "object": "chat.completion.chunk",
        "created": 1_790_000_000,
        "model": UPSTREAM,
        "provider": "Google",
        "choices": [choice],
    }
    return chunk if usage is None else {**chunk, "usage": usage.usage()}


def output_call(turn: int, index: int) -> dict[str, JsonValue]:
    call: dict[str, JsonValue] = {
        "index": index,
        "id": f"tool-{turn}-{index}",
        "type": "function",
        "function": {"name": OUTPUT_TOOL_NAME, "arguments": ANSWER},
    }
    return openrouter_chunk({"role": "assistant", "tool_calls": [call]}, None, None)


def completed(turn: int, calls: int) -> tuple[Reported, list[dict[str, JsonValue]]]:
    reported = Reported(1000 * turn, 100 * calls, Decimal("0.001") * turn)
    closing = openrouter_chunk({"role": "assistant", "content": ""}, "tool_calls", "STOP", reported)
    return reported, [closing]


def errored(turn: int, calls: int) -> tuple[Reported, list[dict[str, JsonValue]]]:
    reported = Reported(0, 0, Decimal(0))
    failed = openrouter_chunk({"role": "assistant", "content": ""}, "error", "MALFORMED_FUNCTION_CALL")
    closing = openrouter_chunk({"role": "assistant", "content": ""}, "error", "MALFORMED_FUNCTION_CALL", reported)
    return reported, [failed, closing]


ENDINGS: Final[Mapping[Ending, Callable[[int, int], tuple[Reported, list[dict[str, JsonValue]]]]]] = {
    "completed": completed,
    "errored": errored,
}


def sse(chunks: Sequence[dict[str, JsonValue]]) -> bytes:
    events = "".join(f"data: {json.dumps(chunk)}\n\n" for chunk in chunks)
    return f"{events}data: [DONE]\n\n".encode()


@dataclass(slots=True)
class OpenRouterWire:
    retry_ending: Ending
    reported: list[Reported] = field(default_factory=list[Reported])

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        turn = len(self.reported) + 1
        calls = 1 if turn == 1 else PARALLEL_CALLS
        ending: Ending = "completed" if turn == 1 else self.retry_ending
        reported, closing = ENDINGS[ending](turn, calls)
        self.reported.append(reported)
        body = sse([*(output_call(turn, index) for index in range(calls)), *closing])
        return httpx2.Response(200, content=body, headers={"content-type": "text/event-stream"})

    def client(self) -> httpx2.AsyncClient:
        return httpx2.AsyncClient(transport=httpx2.MockTransport(self))


@pytest.mark.parametrize("retry_ending", ["completed", "errored"])
def test_the_node_pays_what_openrouter_reports_for_every_retry(retry_ending: Ending) -> None:
    wire = OpenRouterWire(retry_ending)
    source = EngineModelSource(
        ProjectModelFactories(http_client=wire.client), ProviderKeys(None, offline_environment())
    )
    bed = llm_bed(
        [],
        answer_node(),
        [retrying_writer(PRIMARY, FALLBACK)],
        [rejected_answer()],
        RUN_INPUT,
        code={NEVER_FITS: never_fits},
        source=source,
    )

    with override_allow_model_requests(True):
        outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeFailed)
    assert len(wire.reported) > 1
    assert outcome.usage.requests == len(wire.reported)
    assert outcome.usage.tokens_in == sum(item.prompt_tokens for item in wire.reported)
    assert outcome.usage.tokens_out == sum(item.completion_tokens for item in wire.reported)
    assert outcome.usage.cost_usd == sum((item.cost for item in wire.reported), Decimal(0))
