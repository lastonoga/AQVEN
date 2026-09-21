from typing import Literal, Self

from pydantic import BaseModel, Field, JsonValue, model_validator

from aqven.policies.contracts import (
    POLICY_CONFIG,
    Continue,
    Default,
    Done,
    Fail,
    ItemDecision,
    JoinDecision,
    JoinState,
    LoopState,
    NoParams,
    RefPath,
    Skip,
    Stop,
    StopDecision,
    Wait,
)
from aqven.policies.paths import number
from aqven.spec import MapItemError


class QuorumParams(BaseModel):
    model_config = POLICY_CONFIG

    min_ok: int = Field(ge=1)
    on_error: Literal["skip", "fail"] = "fail"


class ThresholdParams(BaseModel):
    model_config = POLICY_CONFIG

    path: RefPath
    gte: float | None = None
    lte: float | None = None

    @model_validator(mode="after")
    def _check_bound(self) -> Self:
        if (self.gte is None) == (self.lte is None):
            raise ValueError("a threshold sets exactly one of gte or lte")
        return self


class StagnationParams(BaseModel):
    model_config = POLICY_CONFIG

    path: RefPath
    window: int = Field(ge=1, le=5)
    min_delta: float = Field(ge=0)


class BestParams(BaseModel):
    model_config = POLICY_CONFIG

    path: RefPath


class DefaultParams(BaseModel):
    model_config = POLICY_CONFIG

    value: JsonValue


def join_all[T](state: JoinState[T], params: NoParams) -> JoinDecision[T]:
    if state.errors:
        return Fail(state.errors[0])
    if state.pending:
        return Wait()
    return Done(state.values)


def join_any[T](state: JoinState[T], params: NoParams) -> JoinDecision[T]:
    if state.errors:
        return Fail(state.errors[0])
    if not state.values:
        return Wait()
    return Done(state.values[:1])


def first_success[T](state: JoinState[T], params: NoParams) -> JoinDecision[T]:
    if state.values:
        return Done(state.values[:1])
    if state.pending:
        return Wait()
    return Fail("all branches failed")


def quorum[T](state: JoinState[T], params: QuorumParams) -> JoinDecision[T]:
    if params.on_error == "fail" and state.errors:
        return Fail(state.errors[0])
    if len(state.values) >= params.min_ok:
        return Done(state.values)
    if len(state.values) + len(state.pending) < params.min_ok:
        return Fail(f"quorum {params.min_ok} is unreachable")
    return Wait()


def threshold(state: LoopState, params: ThresholdParams) -> StopDecision:
    last = scores(state, params.path)[-1:]
    value = last[0] if last else None
    above = value is not None and params.gte is not None and value >= params.gte
    below = value is not None and params.lte is not None and value <= params.lte
    return Stop(f"threshold reached: {params.path} = {value}") if above or below else Continue()


def stagnation(state: LoopState, params: StagnationParams) -> StopDecision:
    known = [value for value in scores(state, params.path) if value is not None]
    if len(known) <= params.window:
        return Continue()
    gain = known[-1] - known[-1 - params.window]
    return (
        Stop(f"gain of {params.path} over {params.window} iterations {gain} < {params.min_delta}")
        if gain < params.min_delta
        else Continue()
    )


def last(state: LoopState, params: NoParams) -> int:
    return max(len(state.iterations) - 1, 0)


def best(state: LoopState, params: BestParams) -> int:
    ranked = scores(state, params.path)
    return max(range(len(ranked)), key=lambda index: (ranked[index] is not None, ranked[index] or 0.0), default=0)


def skip(item: object, error: MapItemError, params: NoParams) -> ItemDecision[JsonValue]:
    return Skip()


def fail(item: object, error: MapItemError, params: NoParams) -> ItemDecision[JsonValue]:
    return Fail(error.message)


def default(item: object, error: MapItemError, params: DefaultParams) -> ItemDecision[JsonValue]:
    return Default(params.value)


def scores(state: LoopState, path: str) -> tuple[float | None, ...]:
    return tuple(number(state.read(path, index)) for index in range(len(state.iterations)))
