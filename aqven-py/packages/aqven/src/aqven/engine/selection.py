from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass

from pydantic import JsonValue

from aqven.engine.executors.switch import matching_case
from aqven.engine.values import walk
from aqven.ir import CompiledFlow, CompiledNode, CompiledSwitchNode
from aqven.spec import FieldStep, IndexStep, LiftStep, NodeId, RefRoot, RefStep, parse_ref

REFERENCE_FIELDS = frozenset({"ref", "over", "on", "source", "schema_from"})
NODE_SEPARATOR = "__"


class SelectionError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class MissingBoundary:
    reference: str
    reason: str


def _references(value: JsonValue) -> Iterator[str]:
    if isinstance(value, list):
        for item in value:
            yield from _references(item)
        return
    if not isinstance(value, dict):
        return
    for key, item in value.items():
        if key in REFERENCE_FIELDS and isinstance(item, str) and item.startswith("$"):
            yield item
        else:
            yield from _references(item)


def _containers(flow: CompiledFlow, owner: NodeId) -> Iterator[NodeId]:
    current: NodeId | None = owner
    while current is not None:
        yield current
        current = flow.node(current).parent


def _visible(flow: CompiledFlow, owner: NodeId, name: NodeId) -> NodeId | None:
    candidates = (*(NodeId(f"{container}{NODE_SEPARATOR}{name}") for container in _containers(flow, owner)), name)
    return next((candidate for candidate in candidates if candidate in flow.nodes), None)


def _top_level(flow: CompiledFlow, node_id: NodeId) -> NodeId:
    return next(reversed(tuple(_containers(flow, node_id))))


def _dependencies(flow: CompiledFlow, top_level: NodeId) -> frozenset[NodeId]:
    members = (node for node in flow.nodes.values() if _top_level(flow, node.node_id) == top_level)
    dependencies: set[NodeId] = set()
    for member in members:
        for text in _references(member.model_dump(mode="json")):
            ref = parse_ref(text)
            if ref.root is not RefRoot.NODE or ref.node_id is None:
                continue
            visible = _visible(flow, member.node_id, ref.node_id)
            if visible is None:
                raise SelectionError(f"node {member.node_id} refers to unknown node {ref.node_id}")
            owner = _top_level(flow, visible)
            if owner != top_level:
                dependencies.add(owner)
    return frozenset(dependencies)


def execution_order(flow: CompiledFlow, selected_nodes: Sequence[NodeId] | None) -> tuple[NodeId, ...]:
    if selected_nodes is None:
        return flow.order
    if not selected_nodes:
        raise SelectionError("select at least one top-level node")
    top_level = frozenset(flow.order)
    unknown = [node_id for node_id in selected_nodes if node_id not in top_level]
    if unknown:
        raise SelectionError(f"selected nodes are not top-level nodes of flow {flow.flow_id}: {', '.join(unknown)}")
    dependencies: Mapping[NodeId, frozenset[NodeId]] = {
        node_id: _dependencies(flow, node_id) for node_id in flow.order
    }
    included = set(selected_nodes)
    pending = list(selected_nodes)
    while pending:
        current = pending.pop()
        for dependency in dependencies[current]:
            if dependency in included:
                continue
            included.add(dependency)
            pending.append(dependency)
    return tuple(node_id for node_id in flow.order if node_id in included)


def range_order(flow: CompiledFlow, start_node: NodeId, end_node: NodeId) -> tuple[NodeId, ...]:
    if start_node not in flow.order or end_node not in flow.order:
        raise SelectionError(f"range endpoints must be top-level nodes of flow {flow.flow_id}")
    first, last = flow.order.index(start_node), flow.order.index(end_node)
    if first > last:
        raise SelectionError(f"start node {start_node} must come before end node {end_node}")
    return flow.order[first : last + 1]


def _path_present(value: JsonValue, steps: Sequence[RefStep]) -> bool:
    if not steps:
        return True
    step, *remaining = steps
    match step:
        case FieldStep(name=name):
            return isinstance(value, dict) and name in value and _path_present(value[name], remaining)
        case IndexStep(index=index):
            return isinstance(value, list) and index < len(value) and _path_present(value[index], remaining)
        case LiftStep():
            return isinstance(value, list) and all(_path_present(item, remaining) for item in value)


def _switch_value(
    flow: CompiledFlow,
    switch: CompiledSwitchNode,
    included: frozenset[NodeId],
    inputs: JsonValue,
    context: Mapping[str, JsonValue],
    node_outputs: Mapping[NodeId, JsonValue],
) -> tuple[bool, JsonValue]:
    ref = parse_ref(switch.on)
    source: JsonValue
    if ref.root is RefRoot.INPUT:
        source = inputs
    elif ref.root is RefRoot.RUN_CONTEXT and ref.key in context:
        source = context[ref.key]
    elif ref.root is RefRoot.NODE and ref.node_id is not None:
        visible = _visible(flow, switch.node_id, ref.node_id)
        if visible is None or visible in included or visible not in node_outputs:
            return False, None
        source = node_outputs[visible]
    else:
        return False, None
    if not _path_present(source, ref.steps):
        return False, None
    return True, walk(switch.on, source, ref.steps)


def _members(flow: CompiledFlow, top_level: NodeId) -> tuple[CompiledNode, ...]:
    members = (member for member in flow.nodes.values() if _top_level(flow, member.node_id) == top_level)
    return tuple(sorted(members, key=lambda member: len(tuple(_containers(flow, member.node_id)))))


def _excluded(flow: CompiledFlow, member: CompiledNode, excluded: set[NodeId]) -> bool:
    return any(container in excluded for container in _containers(flow, member.node_id))


def range_missing(
    flow: CompiledFlow,
    start_node: NodeId,
    end_node: NodeId,
    inputs: JsonValue,
    context: Mapping[str, JsonValue],
    node_outputs: Mapping[NodeId, JsonValue],
) -> tuple[MissingBoundary, ...]:
    order = range_order(flow, start_node, end_node)
    included = frozenset(order)
    missing: dict[str, MissingBoundary] = {}
    for top_level in order:
        excluded: set[NodeId] = set()
        for member in _members(flow, top_level):
            if _excluded(flow, member, excluded):
                continue
            payload = member.model_dump(mode="json")
            if isinstance(member, CompiledSwitchNode):
                known, selected_value = _switch_value(flow, member, included, inputs, context, node_outputs)
                if known:
                    active = matching_case(member, selected_value)
                    if active is None:
                        missing[member.on] = MissingBoundary(
                            reference=member.on, reason=f"switch {member.node_id} has no case for {selected_value!r}"
                        )
                    else:
                        excluded.update(
                            case.node
                            for name, case in member.cases.items()
                            if name != active and case.node is not None
                        )
                        payload["cases"] = {active: payload["cases"][active]}
            for text in _references(payload):
                ref = parse_ref(text)
                reason: str | None = None
                if ref.root is RefRoot.INPUT:
                    if not _path_present(inputs, ref.steps):
                        reason = "flow input field is missing"
                elif ref.root is RefRoot.RUN_CONTEXT:
                    if ref.key not in context or not _path_present(context[ref.key], ref.steps):
                        reason = "run context field is missing"
                elif ref.root is RefRoot.NODE and ref.node_id is not None:
                    visible = _visible(flow, member.node_id, ref.node_id)
                    if visible is None:
                        reason = "referenced node is unknown"
                    else:
                        owner = _top_level(flow, visible)
                        if owner not in included:
                            if visible != owner:
                                reason = "nested output outside the range cannot be supplied as a top-level fixture"
                            elif owner not in node_outputs:
                                reason = f"output fixture for node {owner} is missing"
                            elif not _path_present(node_outputs[owner], ref.steps):
                                reason = f"output fixture for node {owner} lacks the referenced field"
                if reason is not None:
                    missing[text] = MissingBoundary(reference=text, reason=reason)
    return tuple(missing.values())
