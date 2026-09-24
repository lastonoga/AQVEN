import asyncio
from datetime import UTC, datetime

import control_policies
from control_fakes import RUN_ID, ChildCall, FakeScope, Tracker, by_item, failed, succeeded
from pydantic import JsonValue

from aqven.engine.control import control_executors
from aqven.engine.interpreter import NodeFinishedBuilder
from aqven.engine.projection import fold_events
from aqven.ir import BuiltinPolicy, CodePolicy, CompiledMapNode, CompiledPolicy, RefBinding
from aqven.ports.execution import EventStamp, NodeCancelled, NodeFailed, NodeOutcome, NodeSucceeded
from aqven.runtime.events import RUN_EVENT_ADAPTER, MapItemRecovered, NodeFinished, NodeProgress, NodeStarted
from aqven.runtime.executions import ItemError, ItemRecovery
from aqven.runtime.values import InlineValue
from aqven.spec import CodeRef, NodeId, NodeKind

BODY = NodeId("vote__ballot")
OUTPUTS = (RefBinding(name="ballots", ref="$ok"), RefBinding(name="errors", ref="$failed"))
AT = datetime(2026, 9, 24, tzinfo=UTC)
BAD_VOTE = ItemError(code="schema_invalid", message="bad vote")
ABSTAIN = BuiltinPolicy(use="default", params={"value": {"vote": "abstain"}})


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


def _second_fails(call: ChildCall) -> tuple[float, NodeOutcome]:
    if _index(call) == 1:
        return 0.0, failed("schema_invalid", "bad vote")
    return 0.01, succeeded({"vote": call.entry.frame.item})


def _voting(node: CompiledMapNode, items: list[JsonValue]) -> FakeScope:
    return FakeScope(
        node, {BODY: by_item(_second_fails, Tracker())}, outputs={NodeId("prepare"): {"perspectives": items}}
    )


def _recovered(scope: FakeScope) -> list[MapItemRecovered]:
    return [event for event in scope.sink.events if isinstance(event, MapItemRecovered)]


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
    assert not result.degraded
    assert _recovered(scope) == []
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


def test_map_records_skip_and_default_decisions_as_map_item_recovered() -> None:
    items: list[JsonValue] = ["a", "b", "c"]
    skip = _node(BuiltinPolicy(use="skip"))
    skip_scope = _voting(skip, items)

    skipped = _execute(skip_scope, skip)

    assert isinstance(skipped, NodeSucceeded)
    assert skipped.degraded
    [skip_event] = _recovered(skip_scope)
    assert skip_event.address == skip_scope.address
    assert skip_event.recovery == ItemRecovery(
        item_index=1, policy="skip", decision="skip", error=BAD_VOTE, default_ref=None
    )

    default = _node(ABSTAIN)
    default_scope = _voting(default, items)

    defaulted = _execute(default_scope, default)

    assert isinstance(defaulted, NodeSucceeded)
    assert defaulted.degraded
    [default_event] = _recovered(default_scope)
    assert default_event.address == default_scope.address
    assert default_event.recovery == ItemRecovery(
        item_index=1,
        policy="default",
        decision="default",
        error=BAD_VOTE,
        default_ref=InlineValue(value={"vote": "abstain"}),
    )
    assert default_event.model_dump(mode="json")["type"] == "map_item_recovered"
    assert RUN_EVENT_ADAPTER.validate_json(default_event.model_dump_json()) == default_event


def test_map_code_policy_recovery_names_the_code_ref_and_the_substituted_value() -> None:
    tracker = Tracker()
    items: list[JsonValue] = [{"perspective": "buyer"}, {"perspective": "support"}]

    def outcome(call: ChildCall) -> tuple[float, NodeOutcome]:
        if _index(call) == 1:
            return 0.0, failed("refusal", "cannot")
        return 0.0, succeeded({"intent": "refund", "confidence": 0.9})

    node = _node(CodePolicy(run=CodeRef("control_policies:abstain"), params={"intent": "unknown"}))
    scope = FakeScope(node, {BODY: by_item(outcome, tracker)}, outputs={NodeId("prepare"): {"perspectives": items}})

    result = _execute(scope, node)

    assert isinstance(result, NodeSucceeded)
    assert result.degraded
    assert [event.recovery for event in _recovered(scope)] == [
        ItemRecovery(
            item_index=1,
            policy="control_policies:abstain",
            decision="default",
            error=ItemError(code="refusal", message="cannot"),
            default_ref=InlineValue(value={"intent": "unknown:support", "confidence": 0.0}),
        )
    ]


def test_map_fail_decision_records_no_recovery() -> None:
    items: list[JsonValue] = ["a", "b", "c"]
    fail = _node(BuiltinPolicy(use="fail"))
    fail_scope = _voting(fail, items)

    stopped = _execute(fail_scope, fail)

    assert isinstance(stopped, NodeFailed)
    assert stopped.error.code == "E_MAP_ITEM_FAILED"
    assert _recovered(fail_scope) == []

    tracker = Tracker()

    def fatal(call: ChildCall) -> tuple[float, NodeOutcome]:
        return 0.0, failed("fatal", "stop everything")

    code = _node(CodePolicy(run=CodeRef("control_policies:abstain"), params={"intent": "unknown"}))
    code_scope = FakeScope(
        code, {BODY: by_item(fatal, tracker)}, outputs={NodeId("prepare"): {"perspectives": [{"perspective": "a"}]}}
    )

    refused = _execute(code_scope, code)

    assert isinstance(refused, NodeFailed)
    assert refused.error.message == "item 0: stop everything"
    assert _recovered(code_scope) == []


def test_map_recovery_projects_onto_the_map_execution_and_its_node_finished() -> None:
    node = _node(ABSTAIN)
    scope = _voting(node, ["a", "b", "c"])

    outcome = _execute(scope, node)

    started = NodeStarted(seq=1, at=AT, run_id=RUN_ID, address=scope.address, kind=NodeKind.MAP, attempt=1, queued_ms=0)
    finished = NodeFinishedBuilder(scope.address, outcome, attempt=1, latency_ms=12)(
        EventStamp(RUN_ID, len(scope.sink.events) + 2, AT)
    )
    assert isinstance(finished, NodeFinished)
    assert finished.status == "ok"
    assert finished.degraded
    [recovered] = _recovered(scope)

    fold = fold_events((started, *scope.sink.events, finished))
    [execution] = fold.executions_view()

    assert execution.status == "ok"
    assert execution.degraded
    assert execution.recovered_items == (recovered.recovery,)
    assert (fold.node_counts().items_replaced, fold.node_counts().items_skipped) == (1, 0)

    plain_finish = finished.model_copy(update={"degraded": False})
    [kept] = fold_events((started, recovered, plain_finish)).executions_view()

    assert kept.degraded
    assert kept.recovered_items == (recovered.recovery,)
    assert fold_events((started, plain_finish)).executions_view()[0].recovered_items == ()
    assert fold_events((started, plain_finish)).node_counts().items_replaced == 0
