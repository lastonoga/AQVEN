from collections.abc import Callable
from dataclasses import dataclass
from typing import TypeIs

from pydantic import BaseModel, JsonValue, ValidationError

from aqven.engine.policies.codecs import ValueCodec
from aqven.engine.policies.errors import PolicyError, PolicyErrorCode
from aqven.engine.policies.loading import PolicyFunction
from aqven.policies import (
    BranchResult,
    Continue,
    Default,
    Done,
    Fail,
    ItemDecision,
    JoinDecision,
    JoinState,
    LoopState,
    Skip,
    Stop,
    StopDecision,
    Wait,
)
from aqven.spec import MapItemError


@dataclass(frozen=True, slots=True)
class JoinRule:
    label: str
    function: PolicyFunction
    params: BaseModel
    codec: ValueCodec

    def decide(self, state: JoinState[JsonValue]) -> JoinDecision[JsonValue]:
        typed = JoinState[object](tuple(self._decode(item) for item in state.completed), state.pending)
        result = _invoke(self.label, lambda: self.function(typed, self.params))
        if isinstance(result, Wait | Fail):
            return result
        if _is_done(result):
            members = _guard(self.label, "E_POLICY_RESULT", lambda: tuple(result.value))
            return Done(tuple(self._encode(member) for member in members))
        raise PolicyError("E_POLICY_RESULT", self.label, f"expected Wait, Done or Fail, got {result!r}")

    def _decode(self, item: BranchResult[JsonValue]) -> BranchResult[object]:
        value = item.value
        if value is None:
            return BranchResult[object](item.key, None, item.error)
        return BranchResult[object](item.key, _guard(self.label, "E_POLICY_INPUT", lambda: self.codec.decode(value)))

    def _encode(self, value: object) -> JsonValue:
        return _guard(self.label, "E_POLICY_RESULT", lambda: self.codec.encode(value))


@dataclass(frozen=True, slots=True)
class StopRule:
    label: str
    function: PolicyFunction
    params: BaseModel
    path: str | None

    def decide(self, state: LoopState) -> StopDecision:
        result = _invoke(self.label, lambda: self.function(state, self.params))
        if isinstance(result, Continue | Stop):
            return result
        raise PolicyError("E_POLICY_RESULT", self.label, f"expected Continue or Stop, got {result!r}")


@dataclass(frozen=True, slots=True)
class SelectRule:
    label: str
    function: PolicyFunction
    params: BaseModel
    path: str | None

    def choose(self, state: LoopState) -> int:
        result = _invoke(self.label, lambda: self.function(state, self.params))
        if isinstance(result, bool) or not isinstance(result, int):
            raise PolicyError("E_POLICY_RESULT", self.label, f"expected an iteration number, got {result!r}")
        if not 0 <= result < len(state.iterations):
            raise PolicyError(
                "E_POLICY_RESULT", self.label, f"iteration {result} does not exist, there are {len(state.iterations)}"
            )
        return result


@dataclass(frozen=True, slots=True)
class ItemErrorRule:
    label: str
    function: PolicyFunction
    params: BaseModel
    item_codec: ValueCodec
    output_codec: ValueCodec

    def decide(self, item: JsonValue, error: MapItemError) -> ItemDecision[JsonValue]:
        typed = _guard(self.label, "E_POLICY_INPUT", lambda: self.item_codec.decode(item))
        result = _invoke(self.label, lambda: self.function(typed, error, self.params))
        if isinstance(result, Skip | Fail):
            return result
        if _is_default(result):
            return Default(_guard(self.label, "E_POLICY_RESULT", lambda: self.output_codec.encode(result.value)))
        raise PolicyError("E_POLICY_RESULT", self.label, f"expected Skip, Fail or Default, got {result!r}")


def _is_done(value: object) -> TypeIs[Done[object]]:
    return isinstance(value, Done)


def _is_default(value: object) -> TypeIs[Default[object]]:
    return isinstance(value, Default)


def _invoke(label: str, call: Callable[[], object]) -> object:
    try:
        return call()
    except Exception as error:
        raise PolicyError("E_POLICY_RAISED", label, f"{type(error).__name__}: {error}") from error


def _guard[T](label: str, code: PolicyErrorCode, call: Callable[[], T]) -> T:
    try:
        return call()
    except (ValidationError, ValueError, TypeError) as error:
        raise PolicyError(code, label, str(error)) from error
