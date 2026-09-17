import asyncio

import control_policies
from control_fakes import ChildCall, FakeScope, Tracker, by_item, failed, succeeded
from pydantic import JsonValue

from aqven.engine.control import control_executors
from aqven.ir import BuiltinPolicy, CodePolicy, CompiledMapNode, CompiledPolicy, RefBinding
from aqven.ports.execution import NodeCancelled, NodeFailed, NodeOutcome, NodeSucceeded
from aqven.runtime.events import NodeProgress
from aqven.spec import CodeRef, NodeId

BODY = NodeId("vote__ballot")
OUTPUTS = (RefBinding(name="ballots", ref="$ok"), RefBinding(name="errors", ref="$failed"))


def _node(on_item_error: CompiledPolicy, concurrency: int | None = None) -> CompiledMapNode:
    return CompiledMapNode(
        node_id=NodeId("vote"),
        description="votes",
        over="$prepare.out.perspectives",
        body=BODY,
        concurrency=concurrency,
        on_item_error=on_item_error,
        outputs=OUTPUTS,
        output_schema={"type": "object"},
    )


def _execute(scope: FakeScope, node: CompiledMapNode) -> NodeOutcome:
    return asyncio.run(control_executors().map.execute(node, scope))


def _index(call: ChildCall) -> int:
    return call.entry.item_index or 0


def test_map_limits_concurrency_keeps_item_order_and_reports_progress() -> None:
    tracker = Tracker()
    items: list[JsonValue] = [f"p{index}" for index in range(6)]

    def outcome(call: ChildCall) -> tuple[float, NodeOutcome]:
        index = _index(call)
        return 0.05 - index * 0.008, succeeded({"vote": call.entry.frame.item, "at": call.entry.frame.index})

    node = _node(BuiltinPolicy(use="skip"), concurrency=2)
    scope = FakeScope(node, {BODY: by_item(outcome, tracker)}, outputs={NodeId("prepare"): {"perspectives": items}})

    result = _execute(scope, node)

    assert isinstance(result, NodeSucceeded)
    assert result.output == {
        "ballots": [{"vote": f"p{index}", "at": index} for index in range(6)],
        "errors": [],
    }
    assert tracker.peak == 2
    assert [call.entry.item_index for call in scope.calls] == list(range(6))
    assert result.usage.requests == 6
    progress = [event for event in scope.sink.events if isinstance(event, NodeProgress)]
    assert [(event.done, event.total) for event in progress] == [(done, 6) for done in range(7)]
    assert all(event.address.node_id == "vote" for event in progress)


def test_map_skip_and_default_policies_fill_ok_and_failed() -> None:
    tracker = Tracker()
    items: list[JsonValue] = ["a", "b", "c"]

    def outcome(call: ChildCall) -> tuple[float, NodeOutcome]:
        index = _index(call)
        if index == 1:
            return 0.0, failed("schema_invalid", "bad vote")
        return 0.01, succeeded({"vote": call.entry.frame.item})

    skip = _node(BuiltinPolicy(use="skip"))
    skipped = _execute(
        FakeScope(skip, {BODY: by_item(outcome, tracker)}, outputs={NodeId("prepare"): {"perspectives": items}}), skip
    )

    assert isinstance(skipped, NodeSucceeded)
    assert skipped.output == {
        "ballots": [{"vote": "a"}, {"vote": "c"}],
        "errors": [{"index": 1, "code": "schema_invalid", "message": "bad vote"}],
    }

    default = _node(BuiltinPolicy(use="default", params={"value": {"vote": "abstain"}}))
    defaulted = _execute(
        FakeScope(default, {BODY: by_item(outcome, tracker)}, outputs={NodeId("prepare"): {"perspectives": items}}),
        default,
    )

    assert isinstance(defaulted, NodeSucceeded)
    assert defaulted.output == {
        "ballots": [{"vote": "a"}, {"vote": "abstain"}, {"vote": "c"}],
        "errors": [{"index": 1, "code": "schema_invalid", "message": "bad vote"}],
    }


def test_map_fail_policy_stops_and_cancels_active_items() -> None:
    tracker = Tracker()
    items: list[JsonValue] = ["a", "b", "c", "d", "e"]

    def outcome(call: ChildCall) -> tuple[float, NodeOutcome]:
        index = _index(call)
        if index == 0:
            return 0.01, failed("provider_error", "503")
        return 1.0, succeeded({"vote": call.entry.frame.item})

    node = _node(BuiltinPolicy(use="fail"), concurrency=3)
    scope = FakeScope(node, {BODY: by_item(outcome, tracker)}, outputs={NodeId("prepare"): {"perspectives": items}})

    result = _execute(scope, node)

    assert isinstance(result, NodeFailed)
    assert result.error.code == "E_MAP_ITEM_FAILED"
    assert result.error.message == "item 0: 503"
    assert len(scope.calls) == 3
    assert sorted(tracker.cancelled) == [BODY, BODY]


def test_map_custom_item_error_policy_uses_generated_models() -> None:
    control_policies.SEEN_TYPES.clear()
    tracker = Tracker()
    items: list[JsonValue] = [{"perspective": "buyer"}, {"perspective": "support"}]

    def outcome(call: ChildCall) -> tuple[float, NodeOutcome]:
        if _index(call) == 1:
            return 0.0, failed("refusal", "cannot")
        return 0.0, succeeded({"intent": "refund", "confidence": 0.9})

    policy = CodePolicy(run=CodeRef("control_policies:abstain"), params={"intent": "unknown"})
    node = _node(policy)
    scope = FakeScope(node, {BODY: by_item(outcome, tracker)}, outputs={NodeId("prepare"): {"perspectives": items}})

    result = _execute(scope, node)

    assert isinstance(result, NodeSucceeded)
    assert result.output == {
        "ballots": [{"intent": "refund", "confidence": 0.9}, {"intent": "unknown:support", "confidence": 0.0}],
        "errors": [{"index": 1, "code": "refusal", "message": "cannot"}],
    }
    assert control_policies.SEEN_TYPES == ["Ballot"]


def test_map_rejects_non_list_over_and_handles_empty_lists() -> None:
    tracker = Tracker()

    def outcome(call: ChildCall) -> tuple[float, NodeOutcome]:
        return 0.0, succeeded(None)

    node = _node(BuiltinPolicy(use="skip"))
    wrong = FakeScope(node, {BODY: by_item(outcome, tracker)}, outputs={NodeId("prepare"): {"perspectives": "x"}})

    rejected = _execute(wrong, node)

    assert isinstance(rejected, NodeFailed)
    assert rejected.error.code == "E_MAP_OVER_NOT_LIST"
    assert wrong.calls == []

    empty = FakeScope(node, {BODY: by_item(outcome, tracker)}, outputs={NodeId("prepare"): {"perspectives": []}})

    result = _execute(empty, node)

    assert isinstance(result, NodeSucceeded)
    assert result.output == {"ballots": [], "errors": []}
    assert [(event.done, event.total) for event in empty.sink.events if isinstance(event, NodeProgress)] == [(0, 0)]


def test_map_treats_cancelled_items_as_item_errors_and_reports_policy_errors() -> None:
    tracker = Tracker()
    items: list[JsonValue] = ["a", "b"]

    def cancelled(call: ChildCall) -> tuple[float, NodeOutcome]:
        if _index(call) == 0:
            return 0.0, NodeCancelled(reason="run cancelled")
        return 0.01, succeeded("b")

    node = _node(BuiltinPolicy(use="skip"))
    scope = FakeScope(node, {BODY: by_item(cancelled, tracker)}, outputs={NodeId("prepare"): {"perspectives": items}})

    result = _execute(scope, node)

    assert isinstance(result, NodeSucceeded)
    assert result.output == {
        "ballots": ["b"],
        "errors": [{"index": 0, "code": "E_CHILD_CANCELLED", "message": "run cancelled"}],
    }

    def failing(call: ChildCall) -> tuple[float, NodeOutcome]:
        return 0.0, failed("refusal", "no")

    typed = _node(CodePolicy(run=CodeRef("control_policies:skip_everything")))
    mistyped = FakeScope(typed, {BODY: by_item(failing, tracker)}, outputs={NodeId("prepare"): {"perspectives": [1]}})

    rejected = _execute(mistyped, typed)

    assert isinstance(rejected, NodeFailed)
    assert rejected.error.code == "E_POLICY_INPUT"
