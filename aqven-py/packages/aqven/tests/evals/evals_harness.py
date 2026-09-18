import json
from collections.abc import AsyncIterator, Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from statistics import fmean
from typing import Final

from pydantic import JsonValue
from pydantic_ai.messages import ModelMessage, ModelRequest, UserPromptPart
from pydantic_ai.models import Model
from pydantic_ai.models.function import AgentInfo, DeltaToolCall, FunctionModel

from aqven.evals import PairedOutcome, PairedSample

WRITER_MODEL: Final = "openai:gpt-5.4-mini"
CRITIC_MODEL: Final = "openai:gpt-5.6-terra"
EVAL_SHOP: Final = Path(__file__).resolve().parents[1] / "fixtures" / "evals" / "eval_shop"
EVAL_ID: Final = "reply_quality"
DATASET_ID: Final = "reply_cases"
ANSWER_LIMIT: Final = 60.0

type Payload = Mapping[str, JsonValue]
type Script = Callable[[str], Payload]


def prompt_text(messages: Sequence[ModelMessage]) -> str:
    return "\n".join(
        part.content
        for message in messages
        if isinstance(message, ModelRequest)
        for part in message.parts
        if isinstance(part, UserPromptPart) and isinstance(part.content, str)
    )


def between(text: str, tag: str) -> str:
    return text.partition(f"<{tag}>")[2].partition(f"</{tag}>")[0].strip()


def scripted_model(script: Script, name: str) -> Model:
    async def stream(messages: list[ModelMessage], info: AgentInfo) -> AsyncIterator[dict[int, DeltaToolCall]]:
        tool = info.output_tools[0].name
        payload = json.dumps(dict(script(prompt_text(messages))))
        yield {0: DeltaToolCall(name=tool, json_args=payload, tool_call_id="call-1")}

    return FunctionModel(stream_function=stream, model_name=name)


def short_answer(prompt: str) -> Payload:
    return {"answer": f"About {between(prompt, 'question')} we reply today.", "mood": "calm"}


def long_answer(prompt: str) -> Payload:
    question = between(prompt, "question")
    answer = f"About {question} we reply today and tomorrow and also on every working day after."
    return {"answer": answer, "mood": "warm"}


def empty_answer(prompt: str) -> Payload:
    return {"answer": "", "mood": "calm"}


def grade(prompt: str) -> Payload:
    answer = between(prompt, "answer")
    score = min(1.0, len(answer) / ANSWER_LIMIT)
    return {"score": score, "rationale": f"answer is {len(answer)} characters long"}


def models(writer: Script) -> Mapping[str, Model]:
    return {WRITER_MODEL: scripted_model(writer, WRITER_MODEL), CRITIC_MODEL: scripted_model(grade, CRITIC_MODEL)}


@dataclass(frozen=True, slots=True)
class FakeStatistics:
    p_value: float = 0.01
    width: float = 0.005

    def paired(self, sample: PairedSample, resamples: int, seed: int) -> PairedOutcome:
        delta = fmean(sample.differences) if sample.size else 0.0
        return PairedOutcome(
            p_value=self.p_value, ci_lo=delta - self.width, ci_hi=delta + self.width, method="fake-bca"
        )

    def holm(self, p_values: Sequence[float], alpha: float) -> tuple[float, ...]:
        return tuple(min(1.0, value * len(p_values)) for value in p_values)

    def fdr(self, p_values: Sequence[float], q: float) -> tuple[float, ...]:
        return tuple(p_values)
