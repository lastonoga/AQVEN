from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Final

from pydantic import JsonValue

from aqven.check.simulation.values import Schema, ValueFactory, properties_of, type_name, union_of
from aqven.ir import (
    CompiledFlow,
    CompiledHumanNode,
    CompiledMapNode,
    CompiledNarrowNode,
    CompiledParallelNode,
    CompiledSwitchNode,
    CompiledToolNode,
)
from aqven.runtime.address import JsonObject
from aqven.runtime.overrides import NodeOutputOverride, node_failure, node_output
from aqven.spec import FieldStep, NodeId, Ref, RefRoot, RefSyntaxError, parse_ref

BASE_PASS: Final = "base"
INJECTED_CODE: Final = "SIM_INJECTED"
INJECTED_MESSAGE: Final = "simulated failure injected by aqven check"
NODE_SEPARATOR: Final = "__"
FLOW_INPUT: Final = "input"
CASE_LITERALS: Final[Mapping[str, JsonValue]] = {"true": True, "false": False}
GENERATED_KINDS: Final = (CompiledHumanNode, CompiledToolNode, CompiledNarrowNode)


@dataclass(frozen=True, slots=True)
class SimulationPass:
    name: str
    flow_input: JsonObject
    overrides: tuple[NodeOutputOverride, ...] = ()
    injected_node: NodeId | None = None
    wanted: tuple[NodeId, ...] = ()


@dataclass(frozen=True, slots=True)
class PassPlanner:
    values: ValueFactory = field(default_factory=ValueFactory)

    def base(self, flow: CompiledFlow) -> SimulationPass:
        return SimulationPass(
            name=BASE_PASS,
            flow_input=self.values.record(flow.input_schema, FLOW_INPUT),
            overrides=self.answered(flow),
        )

    def follow_up(self, flow: CompiledFlow, executed: frozenset[str]) -> tuple[SimulationPass, ...]:
        return (
            *self.case_passes(flow, executed),
            *self.item_error_passes(flow, executed),
            *self.branch_error_passes(flow, executed),
        )

    def answered(self, flow: CompiledFlow) -> tuple[NodeOutputOverride, ...]:
        return tuple(
            node_output(node.node_id, self.values.record(node.output_schema, node.node_id))
            for node in flow.nodes.values()
            if isinstance(node, GENERATED_KINDS)
        )

    def case_passes(self, flow: CompiledFlow, executed: frozenset[str]) -> tuple[SimulationPass, ...]:
        return tuple(self._case_passes(flow, executed))

    def item_error_passes(self, flow: CompiledFlow, executed: frozenset[str]) -> tuple[SimulationPass, ...]:
        return tuple(self._item_error_passes(flow, executed))

    def branch_error_passes(self, flow: CompiledFlow, executed: frozenset[str]) -> tuple[SimulationPass, ...]:
        return tuple(self._branch_error_passes(flow, executed))

    def _case_passes(self, flow: CompiledFlow, executed: frozenset[str]) -> Iterator[SimulationPass]:
        base = self.base(flow)
        for node in flow.nodes.values():
            if not isinstance(node, CompiledSwitchNode):
                continue
            for key, case in node.cases.items():
                target = case.node
                if target is None or target in executed:
                    continue
                yield from self._case_pass(flow, base, node, key, target)

    def _case_pass(
        self, flow: CompiledFlow, base: SimulationPass, node: CompiledSwitchNode, key: str, target: NodeId
    ) -> Iterator[SimulationPass]:
        steer = self.steer(flow, node, key)
        if steer is None:
            return
        yield SimulationPass(
            name=f"{node.node_id}:{key}",
            flow_input=steer.flow_input(base.flow_input),
            overrides=steer.overrides(base.overrides),
            wanted=(target,),
        )

    def _item_error_passes(self, flow: CompiledFlow, executed: frozenset[str]) -> Iterator[SimulationPass]:
        base = self.base(flow)
        for node in flow.nodes.values():
            if not isinstance(node, CompiledMapNode) or node.node_id not in executed:
                continue
            failure = node_failure(node.body, INJECTED_MESSAGE, code=INJECTED_CODE, item_index=0)
            yield SimulationPass(
                name=f"{node.node_id}:item_error",
                flow_input=base.flow_input,
                overrides=(failure, *base.overrides),
                injected_node=node.body,
            )

    def _branch_error_passes(self, flow: CompiledFlow, executed: frozenset[str]) -> Iterator[SimulationPass]:
        base = self.base(flow)
        for node in flow.nodes.values():
            if not isinstance(node, CompiledParallelNode) or node.node_id not in executed:
                continue
            branch = first_branch(node)
            yield SimulationPass(
                name=f"{node.node_id}:branch_error",
                flow_input=base.flow_input,
                overrides=(node_failure(branch, INJECTED_MESSAGE, code=INJECTED_CODE), *base.overrides),
                injected_node=branch,
            )

    def steer(self, flow: CompiledFlow, node: CompiledSwitchNode, key: str) -> Steer | None:
        reference = parsed_ref(node.on)
        if reference is None:
            return None
        path = field_path(reference)
        if path is None:
            return None
        if reference.root is RefRoot.INPUT:
            return Steer(value=case_value(field_schema(flow.input_schema, path), key), path=path, node=None)
        if reference.root is not RefRoot.NODE or reference.node_id is None:
            return None
        target = visible_node(flow, node.parent, reference.node_id)
        if target is None:
            return None
        source = flow.nodes[target]
        base = self.values.record(source.output_schema, target)
        value = case_value(field_schema(source.output_schema, path), key)
        return Steer(value=value, path=path, node=node_output(target, patched(base, path, value)))


@dataclass(frozen=True, slots=True)
class Steer:
    value: JsonValue
    path: tuple[str, ...]
    node: NodeOutputOverride | None

    def flow_input(self, base: JsonObject) -> JsonObject:
        return base if self.node is not None else patched(base, self.path, self.value)

    def overrides(self, base: Sequence[NodeOutputOverride]) -> tuple[NodeOutputOverride, ...]:
        if self.node is None:
            return tuple(base)
        kept = tuple(item for item in base if item.node_id != self.node.node_id)
        return (self.node, *kept)


def first_branch(node: CompiledParallelNode) -> NodeId:
    return node.branches[min(node.branches)]


def parsed_ref(text: str) -> Ref | None:
    try:
        return parse_ref(text)
    except RefSyntaxError:
        return None


def field_path(reference: Ref) -> tuple[str, ...] | None:
    if not reference.steps or not all(isinstance(step, FieldStep) for step in reference.steps):
        return None
    return tuple(step.name for step in reference.steps if isinstance(step, FieldStep))


def containers(flow: CompiledFlow, owner: NodeId | None) -> Iterator[NodeId]:
    current = owner
    while current is not None and current in flow.nodes:
        yield current
        current = flow.nodes[current].parent


def visible_node(flow: CompiledFlow, owner: NodeId | None, name: str) -> NodeId | None:
    candidates = (*(NodeId(f"{item}{NODE_SEPARATOR}{name}") for item in containers(flow, owner)), NodeId(name))
    return next((candidate for candidate in candidates if candidate in flow.nodes), None)


def field_schema(schema: Schema, path: Sequence[str]) -> Schema | None:
    current: Schema | None = schema
    for name in path:
        if current is None:
            return None
        current = properties_of(union_of(current) or current).get(name)
    return current


def case_value(schema: Schema | None, key: str) -> JsonValue:
    if schema is None:
        return key
    kind = type_name(union_of(schema) or schema)
    if kind == "boolean":
        return CASE_LITERALS.get(key, True)
    if kind in ("integer", "number") and _numeric(key):
        return int(key) if kind == "integer" else float(key)
    return key


def patched(record: JsonObject, path: Sequence[str], value: JsonValue) -> JsonObject:
    if not path:
        return record
    head, rest = path[0], path[1:]
    nested = record.get(head)
    child = nested if isinstance(nested, dict) else {}
    return {**record, head: patched(child, rest, value) if rest else value}


def _numeric(key: str) -> bool:
    return key.removeprefix("-").replace(".", "", 1).isdigit()
