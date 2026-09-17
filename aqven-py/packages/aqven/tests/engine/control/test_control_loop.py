import asyncio
from collections.abc import Sequence

from control_fakes import Behavior, ChildCall, FakeScope, OverlayScope, failed, succeeded
from pydantic import JsonValue

from aqven.engine.control import control_executors
from aqven.ir import BuiltinPolicy, CodePolicy, CompiledBinding, CompiledLoopNode, CompiledPolicy, RefBinding
from aqven.ports.execution import NodeCancelled, NodeFailed, NodeOutcome, NodeSucceeded
from aqven.runtime.events import LoopExited, LoopIterationFinished
from aqven.spec import CodeRef, LoopStopReason, NodeId

REVISE = NodeId("polish__revise")
CRITIQUE = NodeId("polish__critique")
SCORE = "$iter.critique.out.score"
OUTPUTS = (
    RefBinding(name="reply", ref="$iter.revise.out.reply"),
    RefBinding(name="iterations", ref="$loop.iterations"),
    RefBinding(name="reason", ref="$loop.stop_reason"),
)
INIT: dict[NodeId, tuple[CompiledBinding, ...]] = {REVISE: (RefBinding(name="previous", ref="$panel.out.winner"),)}


def _node(
    stop: tuple[CompiledPolicy, ...],
    select: CompiledPolicy,
    max_iter: int = 3,
    init: dict[NodeId, tuple[CompiledBinding, ...]] | None = None,
) -> CompiledLoopNode:
    return CompiledLoopNode(
        node_id=NodeId("polish"),
        description="revision",
        body=(REVISE, CRITIQUE),
        init=INIT if init is None else init,
        max_iter=max_iter,
        stop=stop,
        select=select,
        outputs=OUTPUTS,
        output_schema={"type": "object"},
    )


def _revise(call: ChildCall) -> NodeOutcome:
    acc = call.entry.frame.acc or {}
    previous = acc.get("revise")
    earlier = previous.get("out") if isinstance(previous, dict) else None
    source = call.inputs or {}
    return succeeded({"reply": f"r{call.entry.iteration}", "seen": earlier, "init": source.get("previous")})


def _critique(scores: Sequence[float | None]) -> Behavior:
    async def behave(call: ChildCall) -> NodeOutcome:
        return succeeded({"score": scores[call.entry.iteration or 0]})

    return behave


def _body(scores: Sequence[float | None]) -> dict[NodeId, Behavior]:
    async def revise(call: ChildCall) -> NodeOutcome:
        return _revise(call)

    return {REVISE: revise, CRITIQUE: _critique(scores)}


def _execute(scope: FakeScope, node: CompiledLoopNode) -> NodeOutcome:
    return asyncio.run(control_executors().loop.execute(node, scope))


def _panel() -> dict[NodeId, JsonValue]:
    return {NodeId("panel"): {"winner": "panel draft"}}


def test_loop_runs_to_max_iter_with_acc_init_and_events() -> None:
    node = _node((), BuiltinPolicy(use="last"))
    scope = OverlayScope(node, _body([0.1, 0.2, 0.3]), outputs=_panel())

    outcome = _execute(scope, node)

    assert isinstance(outcome, NodeSucceeded)
    assert outcome.output == {"reply": "r2", "iterations": 3, "reason": "max_iter"}
    assert outcome.usage.requests == 6
    revisions = [call for call in scope.calls if call.node_id == REVISE]
    assert [call.inputs for call in revisions] == [{"previous": "panel draft"}, None, None]
    assert [call.entry.iteration for call in scope.calls] == [0, 0, 1, 1, 2, 2]
    assert revisions[0].entry.frame.acc == {"revise": None, "critique": None}
    assert revisions[2].entry.frame.acc == {
        "revise": {"out": {"reply": "r1", "seen": {"reply": "r0", "seen": None, "init": "panel draft"}, "init": None}},
        "critique": {"out": {"score": 0.2}},
    }
    finished = [event for event in scope.sink.events if isinstance(event, LoopIterationFinished)]
    assert [(event.address.iteration, event.score, event.stop_reason) for event in finished] == [
        (0, None, None),
        (1, None, None),
        (2, None, LoopStopReason.MAX_ITER),
    ]
    exited = [event for event in scope.sink.events if isinstance(event, LoopExited)]
    assert [(event.address.iteration, event.reason, event.selected_iteration) for event in exited] == [
        (None, LoopStopReason.MAX_ITER, 2)
    ]


def test_loop_threshold_stop_reports_score_and_policy_reason() -> None:
    threshold = BuiltinPolicy(use="threshold", params={"path": SCORE, "gte": 0.85})
    node = _node((threshold,), BuiltinPolicy(use="best", params={"path": SCORE}), max_iter=5)
    scope = OverlayScope(node, _body([0.5, 0.9, 0.95, 0.99, 1.0]), outputs=_panel())

    outcome = _execute(scope, node)

    assert isinstance(outcome, NodeSucceeded)
    assert outcome.output == {"reply": "r1", "iterations": 2, "reason": "policy"}
    finished = [event for event in scope.sink.events if isinstance(event, LoopIterationFinished)]
    assert [(event.score, event.stop_reason) for event in finished] == [(0.5, None), (0.9, LoopStopReason.POLICY)]


def test_loop_stagnation_stops_and_best_selects_the_highest_score() -> None:
    stagnation = BuiltinPolicy(use="stagnation", params={"path": SCORE, "window": 1, "min_delta": 0.02})
    threshold = BuiltinPolicy(use="threshold", params={"path": SCORE, "gte": 0.95})
    node = _node((threshold, stagnation), BuiltinPolicy(use="best", params={"path": SCORE}), max_iter=5)
    scope = OverlayScope(node, _body([0.6, 0.8, 0.79, 0.9, 0.9]), outputs=_panel())

    outcome = _execute(scope, node)

    assert isinstance(outcome, NodeSucceeded)
    assert outcome.output == {"reply": "r1", "iterations": 3, "reason": "policy"}
    exited = [event for event in scope.sink.events if isinstance(event, LoopExited)]
    assert [(event.reason, event.selected_iteration) for event in exited] == [(LoopStopReason.POLICY, 1)]


def test_loop_custom_stop_policy_by_code_ref() -> None:
    issues: list[JsonValue] = [["date"], [], ["late"]]

    async def validate(call: ChildCall) -> NodeOutcome:
        return succeeded({"issues": issues[call.entry.iteration or 0]})

    extract = NodeId("record__extract")
    check = NodeId("record__validate")

    async def extracting(call: ChildCall) -> NodeOutcome:
        return succeeded({"record": {"n": call.entry.iteration}})

    node = CompiledLoopNode(
        node_id=NodeId("record"),
        description="questionnaire",
        body=(extract, check),
        max_iter=3,
        stop=(CodePolicy(run=CodeRef("control_policies:no_issues"), params={"path": "$iter.validate.out.issues"}),),
        select=BuiltinPolicy(use="last"),
        outputs=(RefBinding(name="record", ref="$iter.extract.out.record"),),
        output_schema={"type": "object"},
    )
    scope = FakeScope(node, {extract: extracting, check: validate})

    outcome = _execute(scope, node)

    assert isinstance(outcome, NodeSucceeded)
    assert outcome.output == {"record": {"n": 1}}
    assert len(scope.calls) == 4


def test_loop_budget_exhaustion_selects_among_finished_iterations() -> None:
    node = _node((), BuiltinPolicy(use="best", params={"path": SCORE}), max_iter=4)
    body = _body([0.7, 0.4, 0.9, 0.9])

    async def critique(call: ChildCall) -> NodeOutcome:
        if call.entry.iteration == 2:
            return failed("budget_exceeded", "token limit")
        return await body[CRITIQUE](call)

    scope = OverlayScope(node, {REVISE: body[REVISE], CRITIQUE: critique}, outputs=_panel())

    outcome = _execute(scope, node)

    assert isinstance(outcome, NodeSucceeded)
    assert outcome.output == {"reply": "r0", "iterations": 2, "reason": "budget"}
    exited = [event for event in scope.sink.events if isinstance(event, LoopExited)]
    assert [(event.reason, event.selected_iteration) for event in exited] == [(LoopStopReason.BUDGET, 0)]
    assert len([event for event in scope.sink.events if isinstance(event, LoopIterationFinished)]) == 2


def test_loop_body_failures_propagate() -> None:
    node = _node((), BuiltinPolicy(use="last"))
    body = _body([0.1, 0.2, 0.3])

    async def broken(call: ChildCall) -> NodeOutcome:
        return failed("schema_invalid", "no score field", "0.004")

    scope = OverlayScope(node, {REVISE: body[REVISE], CRITIQUE: broken}, outputs=_panel())

    outcome = _execute(scope, node)

    assert isinstance(outcome, NodeFailed)
    assert outcome.error.code == "schema_invalid"
    assert outcome.usage.requests == 2
    assert [event for event in scope.sink.events if isinstance(event, LoopExited)] == []

    async def over_budget(call: ChildCall) -> NodeOutcome:
        return failed("budget_exceeded", "limit")

    first = OverlayScope(node, {REVISE: over_budget, CRITIQUE: broken}, outputs=_panel())

    exhausted = _execute(first, node)

    assert isinstance(exhausted, NodeFailed)
    assert exhausted.error.code == "budget_exceeded"

    async def cancelled(call: ChildCall) -> NodeOutcome:
        return NodeCancelled(reason="run cancelled")

    stopped = _execute(OverlayScope(node, {REVISE: body[REVISE], CRITIQUE: cancelled}, outputs=_panel()), node)

    assert isinstance(stopped, NodeCancelled)


def test_loop_init_requires_an_overlay_capable_scope() -> None:
    node = _node((), BuiltinPolicy(use="last"))
    scope = FakeScope(node, _body([0.1, 0.2, 0.3]), outputs=_panel())

    outcome = _execute(scope, node)

    assert isinstance(outcome, NodeFailed)
    assert outcome.error.code == "E_INPUT_OVERLAY_UNSUPPORTED"

    local = _node((), BuiltinPolicy(use="last"), init={NodeId("revise"): INIT[REVISE]})
    overlay = OverlayScope(local, _body([0.1, 0.2, 0.3]), outputs=_panel())

    resolved = _execute(overlay, local)

    assert isinstance(resolved, NodeSucceeded)
    assert overlay.calls[0].inputs == {"previous": "panel draft"}


def test_loop_policy_errors_fail_the_node() -> None:
    cases: dict[str, tuple[tuple[CompiledPolicy, ...], CompiledPolicy]] = {
        "E_POLICY_RESULT": ((), CodePolicy(run=CodeRef("control_policies:out_of_range"))),
        "E_CODE_SIGNATURE_MISMATCH": ((), CodePolicy(run=CodeRef("control_policies:one_argument"))),
        "E_POLICY_UNKNOWN": ((BuiltinPolicy(use="last"),), BuiltinPolicy(use="last")),
    }
    for code, (stop, select) in cases.items():
        node = _node(stop, select)
        scope = OverlayScope(node, _body([0.1, 0.2, 0.3]), outputs=_panel())

        outcome = _execute(scope, node)

        assert isinstance(outcome, NodeFailed)
        assert outcome.error.code == code

    plain = _node((), CodePolicy(run=CodeRef("control_policies:plain_params")))

    rejected = _execute(OverlayScope(plain, _body([0.1]), outputs=_panel()), plain)

    assert isinstance(rejected, NodeFailed)
    assert rejected.error.code == "E_CODE_SIGNATURE_MISMATCH"
