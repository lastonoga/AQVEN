from collections.abc import Mapping
from dataclasses import dataclass, field
from decimal import Decimal
from enum import StrEnum
from typing import Final, Protocol

from pydantic import BaseModel, ConfigDict, JsonValue

from aqven.ir import CompiledEvaluator
from aqven.policies import EvalContext
from aqven.runtime.address import JsonObject, RunId
from aqven.spec import AgentId, InferenceId, MetricKind

BINARY_JUDGE_THRESHOLD: Final = 0.5
SCORE_FIELD: Final = "score"
RATIONALE_FIELD: Final = "rationale"


class CheckState(StrEnum):
    PASSED = "passed"
    FAILED = "failed"
    ERROR = "error"
    SKIPPED = "skipped"


class JsonRecord(BaseModel):
    model_config = ConfigDict(extra="allow", frozen=True)


@dataclass(frozen=True, slots=True)
class CheckDefinition:
    check_id: str
    kind: MetricKind
    evaluator: CompiledEvaluator
    threshold: float | None = None


@dataclass(frozen=True, slots=True)
class CheckSubject:
    output: BaseModel
    inputs: BaseModel
    expected_output: JsonValue = None
    metadata: Mapping[str, JsonValue] = field(default_factory=dict[str, JsonValue])
    attempt: int = 1
    cost_usd: float = 0.0
    latency_ms: int = 0

    def context(self) -> EvalContext[BaseModel, JsonValue]:
        return EvalContext[BaseModel, JsonValue](
            inputs=self.inputs,
            expected_output=self.expected_output,
            metadata=self.metadata,
            attempt=self.attempt,
            cost_usd=self.cost_usd,
            latency_ms=self.latency_ms,
        )


@dataclass(frozen=True, slots=True)
class JudgeRequest:
    check_id: str
    inference: InferenceId
    agent: AgentId
    document: JsonObject


@dataclass(frozen=True, slots=True)
class JudgeReply:
    output: JsonObject | None
    cost_usd: Decimal = Decimal(0)
    run_id: RunId | None = None
    error: str | None = None


class JudgeGateway(Protocol):
    async def judge(self, request: JudgeRequest) -> JudgeReply: ...


class CodeFunctions(Protocol):
    def function(self, ref: str) -> object: ...


@dataclass(frozen=True, slots=True)
class CheckResult:
    check_id: str
    kind: MetricKind
    state: CheckState
    value: float | None
    reason: str | None
    cost_usd: Decimal = Decimal(0)
    judge_run_id: RunId | None = None

    @property
    def passed(self) -> bool:
        return self.state is CheckState.PASSED


class CheckInvalid(Exception):
    def __init__(self, check_id: str, reason: str) -> None:
        super().__init__(f"check {check_id}: {reason}")
        self.check_id = check_id
        self.reason = reason
