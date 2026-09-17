from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Final, assert_never

from pydantic import BaseModel

from aqven.engine.policies.codecs import codec_for
from aqven.engine.policies.errors import PolicyError
from aqven.engine.policies.loading import CodeLoader, ImportCodeLoader
from aqven.engine.policies.rules import ItemErrorRule, JoinRule, SelectRule, StopRule
from aqven.engine.policies.signature import PolicySignature, inspect_policy, type_argument
from aqven.ir import BuiltinPolicy, CodePolicy, CompiledPolicy
from aqven.policies import BUILTINS, Slot

PATH_PARAM: Final = "path"
JOIN_ARITY: Final = 2
LOOP_ARITY: Final = 2
ITEM_ERROR_ARITY: Final = 3

type BuiltinTable = Mapping[Slot, Mapping[str, Callable[..., object]]]


@dataclass(slots=True)
class PolicyFactory:
    loader: CodeLoader = field(default_factory=ImportCodeLoader)
    builtins: BuiltinTable = field(default_factory=lambda: BUILTINS)
    joins: dict[str, JoinRule] = field(default_factory=dict[str, JoinRule])
    stops: dict[str, StopRule] = field(default_factory=dict[str, StopRule])
    selects: dict[str, SelectRule] = field(default_factory=dict[str, SelectRule])
    item_errors: dict[str, ItemErrorRule] = field(default_factory=dict[str, ItemErrorRule])

    def join(self, policy: CompiledPolicy) -> JoinRule:
        return _cached(self.joins, policy, lambda: self._join(policy))

    def stop(self, policy: CompiledPolicy) -> StopRule:
        return _cached(self.stops, policy, lambda: self._stop(policy))

    def select(self, policy: CompiledPolicy) -> SelectRule:
        return _cached(self.selects, policy, lambda: self._select(policy))

    def item_error(self, policy: CompiledPolicy) -> ItemErrorRule:
        return _cached(self.item_errors, policy, lambda: self._item_error(policy))

    def _join(self, policy: CompiledPolicy) -> JoinRule:
        signature = self._signature(Slot.JOIN, policy, JOIN_ARITY)
        params = signature.params(policy.params)
        return JoinRule(signature.label, signature.function, params, codec_for(type_argument(signature.parameter(0))))

    def _stop(self, policy: CompiledPolicy) -> StopRule:
        signature = self._signature(Slot.STOP, policy, LOOP_ARITY)
        params = signature.params(policy.params)
        return StopRule(signature.label, signature.function, params, _path(params))

    def _select(self, policy: CompiledPolicy) -> SelectRule:
        signature = self._signature(Slot.SELECT, policy, LOOP_ARITY)
        params = signature.params(policy.params)
        return SelectRule(signature.label, signature.function, params, _path(params))

    def _item_error(self, policy: CompiledPolicy) -> ItemErrorRule:
        signature = self._signature(Slot.ITEM_ERROR, policy, ITEM_ERROR_ARITY)
        params = signature.params(policy.params)
        item = codec_for(signature.parameter(0))
        output = codec_for(type_argument(signature.returns))
        return ItemErrorRule(signature.label, signature.function, params, item, output)

    def _signature(self, slot: Slot, policy: CompiledPolicy, arity: int) -> PolicySignature:
        match policy:
            case BuiltinPolicy():
                return inspect_policy(policy.use, self._builtin(slot, policy), arity)
            case CodePolicy():
                return inspect_policy(policy.run, self._code(policy), arity)
            case _:
                assert_never(policy)

    def _builtin(self, slot: Slot, policy: BuiltinPolicy) -> Callable[..., object]:
        table = self.builtins.get(slot, {})
        found = table.get(policy.use)
        if found is None:
            known = ", ".join(table) or "—"
            raise PolicyError("E_POLICY_UNKNOWN", policy.use, f"no such built-in policy in slot {slot.value}: {known}")
        return found

    def _code(self, policy: CodePolicy) -> object:
        try:
            return self.loader.load(policy.run)
        except Exception as error:
            raise PolicyError("E_CODE_REF_UNRESOLVED", policy.run, f"{type(error).__name__}: {error}") from error


def _cached[R](cache: dict[str, R], policy: CompiledPolicy, build: Callable[[], R]) -> R:
    key = policy.model_dump_json()
    if key not in cache:
        cache[key] = build()
    return cache[key]


def _path(params: BaseModel) -> str | None:
    value = params.model_dump(mode="json").get(PATH_PARAM)
    return value if isinstance(value, str) else None
