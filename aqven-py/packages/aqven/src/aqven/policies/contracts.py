from collections.abc import Mapping
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Annotated, Final, Protocol

from pydantic import BaseModel, ConfigDict, Field, JsonValue

from aqven.policies.paths import read
from aqven.spec import MapItemError, RefRoot

POLICY_CONFIG: Final = ConfigDict(extra="forbid", frozen=True)

type RefPath = Annotated[str, Field(pattern=r"^\$")]


class Slot(StrEnum):
    JOIN = "join"
    STOP = "stop"
    SELECT = "select"
    ITEM_ERROR = "on_item_error"
    EVALUATOR = "evaluator"


class NoParams(BaseModel):
    model_config = POLICY_CONFIG


@dataclass(frozen=True, slots=True)
class BranchResult[T]:
    key: str
    value: T | None = None
    error: str | None = None


@dataclass(frozen=True, slots=True)
class JoinState[T]:
    completed: tuple[BranchResult[T], ...]
    pending: tuple[str, ...]

    @property
    def values(self) -> tuple[T, ...]:
        return tuple(item.value for item in self.completed if item.value is not None)

    @property
    def errors(self) -> tuple[str, ...]:
        return tuple(item.error for item in self.completed if item.error is not None)


@dataclass(frozen=True, slots=True)
class Wait:
    pass


@dataclass(frozen=True, slots=True)
class Done[T]:
    value: tuple[T, ...]


@dataclass(frozen=True, slots=True)
class Fail:
    reason: str


type JoinDecision[T] = Wait | Done[T] | Fail


@dataclass(frozen=True, slots=True)
class LoopState:
    iterations: tuple[JsonValue, ...]

    def read(self, path: str, iteration: int = -1) -> JsonValue:
        return read({RefRoot.ITER: self.iterations[iteration]}, path) if self.iterations else None


@dataclass(frozen=True, slots=True)
class Continue:
    pass


@dataclass(frozen=True, slots=True)
class Stop:
    reason: str


type StopDecision = Continue | Stop


@dataclass(frozen=True, slots=True)
class Skip:
    pass


@dataclass(frozen=True, slots=True)
class Default[O]:
    value: O


type ItemDecision[O] = Skip | Fail | Default[O]


@dataclass(frozen=True, slots=True)
class EvalContext[I, O]:
    inputs: I
    expected_output: O | None = None
    metadata: Mapping[str, JsonValue] = field(default_factory=dict[str, JsonValue])
    attempt: int = 1
    cost_usd: float = 0.0
    latency_ms: int = 0


class Verdict(BaseModel):
    model_config = POLICY_CONFIG

    passed: bool
    score: float | None = None
    reason: str | None = None


class JoinPolicy[T, P: BaseModel](Protocol):
    def __call__(self, state: JoinState[T], params: P, /) -> JoinDecision[T]: ...


class StopPolicy[P: BaseModel](Protocol):
    def __call__(self, state: LoopState, params: P, /) -> StopDecision: ...


class SelectPolicy[P: BaseModel](Protocol):
    def __call__(self, state: LoopState, params: P, /) -> int: ...


class ItemErrorPolicy[T, O, P: BaseModel](Protocol):
    def __call__(self, item: T, error: MapItemError, params: P, /) -> ItemDecision[O]: ...


class Evaluator[I, O, P: BaseModel](Protocol):
    def __call__(self, value: O, context: EvalContext[I, O], params: P, /) -> Verdict: ...
