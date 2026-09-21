from pathlib import Path

import pytest
from engine_core_plan import code_node, fan_flow, relay_flow

from aqven.compiler import compile_root
from aqven.engine.selection import SelectionError, execution_order, range_missing, range_order
from aqven.spec import FlowId, NodeId

LUMEN = Path(__file__).parents[5] / "examples" / "lumen"


def test_selected_node_includes_transitive_dependencies() -> None:
    assert execution_order(relay_flow(), (NodeId("stamp"),)) == (NodeId("normalize"), NodeId("route"), NodeId("stamp"))


def test_nested_node_dependencies_are_included() -> None:
    assert execution_order(fan_flow(), (NodeId("fan"),)) == (NodeId("first"), NodeId("fan"))


def test_full_run_preserves_flow_order() -> None:
    flow = relay_flow()
    assert execution_order(flow, None) == flow.order


def test_nested_node_cannot_be_selected_directly() -> None:
    with pytest.raises(SelectionError, match="not top-level"):
        execution_order(fan_flow(), (NodeId("fan__left"),))


def test_range_executes_only_contiguous_nodes() -> None:
    assert range_order(relay_flow(), NodeId("route"), NodeId("stamp")) == (
        NodeId("route"),
        NodeId("stamp"),
    )


def test_range_requires_prior_output_fixture_and_referenced_input() -> None:
    flow = relay_flow()
    missing = range_missing(flow, NodeId("route"), NodeId("route"), {"priority": "low"}, {}, {})
    assert {item.reference for item in missing} == {"$normalize.out.text"}
    available = range_missing(
        flow,
        NodeId("route"),
        NodeId("route"),
        {"priority": "low"},
        {},
        {NodeId("normalize"): {"text": "prepared"}},
    )
    assert available == ()


def test_range_rejects_reversed_endpoints() -> None:
    with pytest.raises(SelectionError, match="must come before"):
        range_order(relay_flow(), NodeId("stamp"), NodeId("route"))


def test_range_marks_input_field_missing_when_parent_is_null() -> None:
    missing = range_missing(
        relay_flow(),
        NodeId("route"),
        NodeId("route"),
        None,
        {},
        {NodeId("normalize"): {"text": "prepared"}},
    )
    assert "$input.priority" in {item.reference for item in missing}


def test_range_switch_ignores_inactive_child_when_fixture_selects_case() -> None:
    flow = compile_root(LUMEN).flow(FlowId("support_case"))
    missing = range_missing(
        flow,
        NodeId("intent"),
        NodeId("intent"),
        {},
        {},
        {NodeId("tally"): {"agreement": "agreed", "intent": "usage_question"}},
    )
    assert missing == ()


def test_range_can_use_a_nested_output_fixture_from_an_earlier_stage() -> None:
    source = fan_flow()
    after = code_node("after", "finalize", "$fan__left.out.text")
    flow = source.model_copy(update={"nodes": {**source.nodes, NodeId("after"): after}})

    missing = range_missing(flow, NodeId("after"), NodeId("after"), {}, {}, {})
    supplied = range_missing(
        flow, NodeId("after"), NodeId("after"), {}, {}, {NodeId("fan__left"): {"text": "ready"}}
    )

    assert missing[0].reference == "$fan__left.out.text"
    assert supplied == ()
