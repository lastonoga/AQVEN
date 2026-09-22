from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Final

from pydantic import JsonValue
from pydantic_core import to_jsonable_python

from aqven.engine.addressing import address_key
from aqven.ports.execution import ScopeFrame
from aqven.runtime.address import ExecutionAddress, JsonObject
from aqven.spec import FieldStep, IndexStep, LiftStep, Ref, RefRoot, RefStep, RefSyntaxError, parse_ref


class RefUnresolved(LookupError):
    def __init__(self, ref: str, reason: str) -> None:
        super().__init__(f"reference {ref} does not resolve: {reason}")
        self.ref = ref
        self.reason = reason


type NodeOutputReader = Callable[[str], JsonValue]


@dataclass(frozen=True, slots=True)
class RefSources:
    flow_input: JsonObject
    run_context: JsonObject
    frame: ScopeFrame
    node_output: NodeOutputReader


type RootReader = Callable[[Ref, RefSources], JsonValue]


def evaluate_ref(text: str, sources: RefSources) -> JsonValue:
    try:
        ref = parse_ref(text)
    except RefSyntaxError as error:
        raise RefUnresolved(text, error.reason) from error
    head = ROOT_READERS[ref.root](ref, sources)
    return walk(text, head, ref.steps)


def walk(text: str, value: JsonValue, steps: Sequence[RefStep]) -> JsonValue:
    if not steps or value is None:
        return value
    step, rest = steps[0], steps[1:]
    match step:
        case FieldStep():
            return walk(text, _field(text, value, step.name), rest)
        case LiftStep():
            return [walk(text, item, rest) for item in _items(text, value)]
        case IndexStep():
            items = _items(text, value)
            return walk(text, items[step.index] if step.index < len(items) else None, rest)


def _field(text: str, value: JsonValue, name: str) -> JsonValue:
    if not isinstance(value, dict):
        raise RefUnresolved(text, f"step .{name} applies only to a record")
    return value.get(name)


def _items(text: str, value: JsonValue) -> list[JsonValue]:
    if not isinstance(value, list):
        raise RefUnresolved(text, "steps [*] and [n] apply only to a list")
    return value


def _input(ref: Ref, sources: RefSources) -> JsonValue:
    return sources.flow_input


def _run_context(ref: Ref, sources: RefSources) -> JsonValue:
    return sources.run_context.get(ref.key or "")


def _inference_only(ref: Ref, sources: RefSources) -> JsonValue:
    raise RefUnresolved(str(ref), "$in and $out are available only in inference paths")


def _frame_field(name: str) -> RootReader:
    def read(ref: Ref, sources: RefSources) -> JsonValue:
        return frame_value(sources.frame, name, str(ref))

    return read


def _branch(ref: Ref, sources: RefSources) -> JsonValue:
    branches = sources.frame.branch
    if branches is None:
        raise RefUnresolved(str(ref), "$branch is available only in the out of a parallel node")
    return branches.get(ref.key or "")


def _node(ref: Ref, sources: RefSources) -> JsonValue:
    return sources.node_output(ref.node_id or "")


def frame_value(frame: ScopeFrame, name: str, text: str) -> JsonValue:
    if name not in frame.model_fields_set and getattr(frame, name) is None:
        raise RefUnresolved(text, f"${name} is unavailable in this execution scope")
    value: object = getattr(frame, name)
    return _json(value)


def _json(value: object) -> JsonValue:
    converted: JsonValue = to_jsonable_python(value)
    return converted


FRAME_ROOTS: Final[Mapping[RefRoot, str]] = {
    RefRoot.ITEM: "item",
    RefRoot.INDEX: "index",
    RefRoot.CASE: "case",
    RefRoot.ACC: "acc",
    RefRoot.ITER: "iter",
    RefRoot.LOOP: "loop",
    RefRoot.OK: "ok",
    RefRoot.FAILED: "failed",
}

ROOT_READERS: Final[Mapping[RefRoot, RootReader]] = {
    RefRoot.INPUT: _input,
    RefRoot.RUN_CONTEXT: _run_context,
    RefRoot.IN: _inference_only,
    RefRoot.OUT: _inference_only,
    RefRoot.BRANCH: _branch,
    RefRoot.NODE: _node,
    **{root: _frame_field(name) for root, name in FRAME_ROOTS.items()},
}


@dataclass(slots=True)
class ValueStore:
    values: dict[str, JsonValue] = field(default_factory=dict[str, JsonValue])

    def put(self, address: ExecutionAddress, value: JsonValue) -> None:
        self.values[address_key(address)] = value

    def has(self, address: ExecutionAddress) -> bool:
        return address_key(address) in self.values

    def get(self, address: ExecutionAddress) -> JsonValue:
        return self.values[address_key(address)]

    def snapshot(self) -> dict[str, JsonValue]:
        return dict(self.values)

    def added_since(self, before: Mapping[str, JsonValue]) -> dict[str, JsonValue]:
        return {key: value for key, value in self.values.items() if key not in before}

    def merge(self, entries: Mapping[str, JsonValue]) -> None:
        self.values.update(entries)
