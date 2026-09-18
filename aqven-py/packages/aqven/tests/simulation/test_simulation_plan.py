from typing import Final

from pydantic import JsonValue

from aqven.check.simulation.plan import INJECTED_CODE, PassPlanner, case_value, patched
from aqven.ir import (
    BuiltinPolicy,
    CompiledCodeNode,
    CompiledFlow,
    CompiledHumanNode,
    CompiledMapNode,
    CompiledNarrowNode,
    CompiledNode,
    CompiledParallelNode,
    CompiledSwitchCase,
    CompiledSwitchNode,
    CompiledToolNode,
    FieldIr,
    LiteralBinding,
    RefBinding,
)
from aqven.spec import CodeRef, FailOnTimeout, FlowId, NodeId, ToolId, TypeId

MOOD: Final[dict[str, JsonValue]] = {
    "type": "object",
    "properties": {"mood": {"enum": ["calm", "warm"]}, "count": {"type": "integer"}},
}
TEXT: Final[dict[str, JsonValue]] = {"type": "object", "properties": {"text": {"type": "string", "maxLength": 20}}}
ITEMS: Final[dict[str, JsonValue]] = {
    "type": "object",
    "properties": {"items": {"type": "array", "items": {"type": "string"}}},
}


def _tool() -> CompiledToolNode:
    return CompiledToolNode(
        node_id=NodeId("fetch"),
        description="fetch",
        tool=ToolId("stamp"),
        input_schema=TEXT,
        output_schema=MOOD,
    )


def _human() -> CompiledHumanNode:
    return CompiledHumanNode(
        node_id=NodeId("ask"),
        description="ask",
        form=TypeId("Note"),
        assignee="lead",
        timeout_seconds=60,
        on_timeout=FailOnTimeout(policy="fail"),
        input_schema=TEXT,
        output_schema=TEXT,
    )


def _narrow() -> CompiledNarrowNode:
    return CompiledNarrowNode(
        node_id=NodeId("pick"),
        description="narrow",
        source="$ask.out",
        to=TypeId("Note"),
        output_schema=TEXT,
    )


def _switch(on: str) -> CompiledSwitchNode:
    return CompiledSwitchNode(
        node_id=NodeId("route"),
        description="route",
        on=on,
        cases={
            "calm": CompiledSwitchCase(bindings=(LiteralBinding(name="text", value="calm"),)),
            "warm": CompiledSwitchCase(
                node=NodeId("route__redo"), bindings=(RefBinding(name="text", ref="$redo.out"),)
            ),
        },
        output_names=("text",),
        output_schema=TEXT,
    )


def _code(node_id: str, parent: str | None = None) -> CompiledCodeNode:
    return CompiledCodeNode(
        node_id=NodeId(node_id),
        parent=NodeId(parent) if parent is not None else None,
        description="code",
        run=CodeRef("shop.code:run"),
        input_schema=TEXT,
        output_schema=TEXT,
        output_fields=(FieldIr(name="text", type="Text", description="text"),),
    )


def _map() -> CompiledMapNode:
    return CompiledMapNode(
        node_id=NodeId("each"),
        description="map",
        over="$fetch.out.items",
        body=NodeId("each__item"),
        on_item_error=BuiltinPolicy(use="skip"),
        outputs=(RefBinding(name="text", ref="$ok"),),
        output_schema=TEXT,
    )


def _parallel() -> CompiledParallelNode:
    return CompiledParallelNode(
        node_id=NodeId("drafts"),
        description="parallel",
        branches={"second": NodeId("drafts__second"), "first": NodeId("drafts__first")},
        join=BuiltinPolicy(use="all"),
        outputs=(RefBinding(name="text", ref="$branch.first"),),
        output_schema=TEXT,
    )


def _flow(nodes: tuple[CompiledNode, ...], on: str = "$fetch.out.mood") -> CompiledFlow:
    return CompiledFlow(
        flow_id=FlowId("intake"),
        description="intake",
        input_type="Note",
        output_type="Note",
        input_schema=MOOD,
        output_schema=TEXT,
        returns=(RefBinding(name="text", ref="$route.out.text"),),
        order=tuple(node.node_id for node in nodes if node.parent is None),
        nodes={node.node_id: node for node in nodes},
    )


def _default_flow(on: str = "$fetch.out.mood") -> CompiledFlow:
    return _flow((_tool(), _human(), _narrow(), _switch(on), _code("route__redo", "route")), on)


def test_base_pass_answers_tool_human_and_narrow_nodes() -> None:
    plan = PassPlanner().base(_default_flow())
    assert {item.node_id for item in plan.overrides} == {"fetch", "ask", "pick"}
    assert plan.flow_input["mood"] == "calm"
    fetch = next(item for item in plan.overrides if item.node_id == "fetch")
    assert isinstance(fetch.output, dict)
    assert fetch.output["mood"] == "calm"


def test_switch_case_pass_steers_the_source_node() -> None:
    flow = _default_flow()
    passes = PassPlanner().follow_up(flow, frozenset({"fetch", "ask", "pick", "route"}))
    assert len(passes) == 1
    item = passes[0]
    assert item.name == "route:warm"
    assert item.wanted == (NodeId("route__redo"),)
    steered = next(override for override in item.overrides if override.node_id == "fetch")
    assert isinstance(steered.output, dict)
    assert steered.output["mood"] == "warm"
    assert sum(1 for override in item.overrides if override.node_id == "fetch") == 1


def test_switch_case_pass_can_steer_the_flow_input() -> None:
    flow = _default_flow("$input.mood")
    passes = PassPlanner().follow_up(flow, frozenset({"fetch", "route"}))
    assert [item.flow_input["mood"] for item in passes] == ["warm"]


def test_switch_on_a_frame_reference_has_no_pass() -> None:
    flow = _default_flow("$item.mood")
    assert PassPlanner().follow_up(flow, frozenset({"route"})) == ()


def test_covered_case_node_needs_no_pass() -> None:
    flow = _default_flow()
    assert PassPlanner().follow_up(flow, frozenset({"route", "route__redo"})) == ()


def test_map_pass_injects_an_item_failure() -> None:
    flow = _flow(
        (_tool(), _map(), _code("each__item", "each"), _switch("$fetch.out.mood"), _code("route__redo", "route"))
    )
    passes = PassPlanner().follow_up(flow, frozenset({"fetch", "each", "each__item", "route", "route__redo"}))
    assert len(passes) == 1
    item = passes[0]
    assert item.name == "each:item_error"
    assert item.injected_node == NodeId("each__item")
    failure = item.overrides[0]
    assert failure.node_id == "each__item"
    assert failure.item_index == 0
    assert failure.error is not None
    assert failure.error.code == INJECTED_CODE


def test_map_pass_is_skipped_when_the_map_did_not_run() -> None:
    flow = _flow((_tool(), _map(), _code("each__item", "each")))
    assert PassPlanner().follow_up(flow, frozenset({"fetch"})) == ()


def test_parallel_pass_injects_a_branch_failure() -> None:
    flow = _flow(
        (
            _tool(),
            _parallel(),
            _code("drafts__first", "drafts"),
            _code("drafts__second", "drafts"),
            _switch("$fetch.out.mood"),
            _code("route__redo", "route"),
        )
    )
    executed = frozenset({"fetch", "drafts", "drafts__first", "drafts__second", "route", "route__redo"})
    passes = PassPlanner().branch_error_passes(flow, executed)
    assert [item.name for item in passes] == ["drafts:branch_error"]
    item = passes[0]
    assert item.injected_node == NodeId("drafts__first")
    failure = item.overrides[0]
    assert failure.node_id == "drafts__first"
    assert failure.error is not None
    assert failure.error.code == INJECTED_CODE


def test_parallel_pass_is_skipped_when_the_node_did_not_run() -> None:
    flow = _flow((_tool(), _parallel(), _code("drafts__first", "drafts"), _code("drafts__second", "drafts")))
    assert PassPlanner().branch_error_passes(flow, frozenset({"fetch"})) == ()


def test_case_value_follows_the_field_type() -> None:
    assert case_value({"type": "boolean"}, "true") is True
    assert case_value({"type": "integer"}, "7") == 7
    assert case_value({"type": "string"}, "warm") == "warm"
    assert case_value(None, "warm") == "warm"


def test_patched_replaces_a_nested_field() -> None:
    record: dict[str, JsonValue] = {"customer": {"id": "a", "tier": "plus"}, "text": "x"}
    assert patched(record, ("customer", "tier"), "business") == {
        "customer": {"id": "a", "tier": "business"},
        "text": "x",
    }
