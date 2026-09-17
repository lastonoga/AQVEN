from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Final

from pydantic import JsonValue

from aqven.engine.extensions import DerivableScope
from aqven.engine.failures import run_error
from aqven.ir import CompiledSwitchNode
from aqven.ports.execution import ChildEntry, ExecutionScope, NodeFailed, NodeOutcome, NodeSucceeded, ScopeFrame

SWITCH_NO_CASE: Final = "SWITCH_NO_CASE"


def _text_keys(value: JsonValue) -> tuple[str, ...]:
    return (value,) if isinstance(value, str) else ()


def _bool_keys(value: JsonValue) -> tuple[str, ...]:
    return (str(value).lower(),)


def _number_keys(value: JsonValue) -> tuple[str, ...]:
    return (str(value),)


def _record_keys(value: JsonValue) -> tuple[str, ...]:
    if not isinstance(value, dict):
        return ()
    return tuple(item for item in value.values() if isinstance(item, str))


def _no_keys(value: JsonValue) -> tuple[str, ...]:
    return ()


KEY_READERS: Final[Mapping[type, Callable[[JsonValue], tuple[str, ...]]]] = {
    str: _text_keys,
    bool: _bool_keys,
    int: _number_keys,
    float: _number_keys,
    dict: _record_keys,
}


def case_keys(value: JsonValue) -> tuple[str, ...]:
    return KEY_READERS.get(type(value), _no_keys)(value)


def matching_case(node: CompiledSwitchNode, value: JsonValue) -> str | None:
    candidates = case_keys(value)
    return next((key for key in node.cases if key in candidates), None)


def case_scope(scope: ExecutionScope, entry: ChildEntry) -> ExecutionScope:
    return scope.derive(entry) if isinstance(scope, DerivableScope) else scope


@dataclass(frozen=True, slots=True)
class SwitchExecutor:
    async def execute(self, node: CompiledSwitchNode, scope: ExecutionScope) -> NodeOutcome:
        value = scope.resolve(node.on)
        key = matching_case(node, value)
        if key is None:
            message = f"switch {node.node_id}: value {value!r} matches no branch"
            return NodeFailed(error=run_error(SWITCH_NO_CASE, message, scope.address))
        case = node.cases[key]
        entry = ChildEntry(branch_key=key, frame=ScopeFrame(case=value))
        if case.node is not None:
            outcome = await scope.run_child(case.node, entry)
            if not isinstance(outcome, NodeSucceeded):
                return outcome
        bound = case_scope(scope, entry).bind(case.bindings)
        return NodeSucceeded(output={name: bound.get(name) for name in node.output_names})
