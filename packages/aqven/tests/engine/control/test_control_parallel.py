import asyncio
from decimal import Decimal

import control_policies
from control_fakes import FakeScope, Tracker, after, failed, succeeded
from pydantic import JsonValue

from aqven.engine.control import control_executors
from aqven.ir import BuiltinPolicy, CodePolicy, CompiledParallelNode, CompiledPolicy, RefBinding
from aqven.policies.contracts import Fail, JoinState
from aqven.policies.control import QuorumParams, quorum
from aqven.ports.execution import NodeCancelled, NodeFailed, NodeOutcome, NodeSucceeded, ScopeFrame
from aqven.spec import CodeRef, NodeId

BRANCHES = {"gpt": NodeId("drafts__gpt"), "claude": NodeId("drafts__claude"), "gemini": NodeId("drafts__gemini")}


def _node(join: CompiledPolicy, outputs: tuple[RefBinding, ...] | None = None) -> CompiledParallelNode:
    return CompiledParallelNode(
        node_id=NodeId("drafts"),
        description="drafts",
        branches=BRANCHES,
        join=join,
        outputs=outputs or (RefBinding(name="candidates", ref="$ok[*].reply"),),
        output_schema={"type": "object"},
    )


def _execute(scope: FakeScope, node: CompiledParallelNode) -> NodeOutcome:
    return asyncio.run(control_executors().parallel.execute(node, scope))


def _reply(text: str) -> JsonValue:
    return {"reply": text}


def test_join_all_binds_ok_and_branch_outputs_and_sums_usage() -> None:
    tracker = Tracker()
    behaviors = {
        BRANCHES["gpt"]: after(0.03, succeeded(_reply("g"), "0.001"), tracker, "gpt"),
        BRANCHES["claude"]: after(0.01, succeeded(_reply("c"), "0.002"), tracker, "claude"),
        BRANCHES["gemini"]: after(0.02, succeeded(_reply("m"), "0.003"), tracker, "gemini"),
    }
    outputs = (RefBinding(name="candidates", ref="$ok[*].reply"), RefBinding(name="first", ref="$branch.gpt.reply"))
    frame = ScopeFrame(item={"text": "lamp"}, index=2)
    node = _node(BuiltinPolicy(use="all"), outputs)
    scope = FakeScope(node, behaviors, scope_frame=frame)

    outcome = _execute(scope, node)

    assert isinstance(outcome, NodeSucceeded)
    assert outcome.output == {"candidates": ["c", "m", "g"], "first": "g"}
    assert outcome.usage.cost_usd == Decimal("0.006")
    assert outcome.usage.requests == 3
    assert [call.entry.branch_key for call in scope.calls] == ["gpt", "claude", "gemini"]
    assert all(call.entry.frame == frame for call in scope.calls)
    assert tracker.peak == 3


def test_join_all_fails_on_first_error_and_cancels_pending() -> None:
    tracker = Tracker()
    behaviors = {
        BRANCHES["gpt"]: after(0.01, failed("provider_error", "503"), tracker, "gpt"),
        BRANCHES["claude"]: after(1.0, succeeded(_reply("c")), tracker, "claude"),
        BRANCHES["gemini"]: after(1.0, succeeded(_reply("m")), tracker, "gemini"),
    }
    node = _node(BuiltinPolicy(use="all"))
    scope = FakeScope(node, behaviors)

    outcome = _execute(scope, node)

    assert isinstance(outcome, NodeFailed)
    assert outcome.error.code == "E_JOIN_FAILED"
    assert outcome.error.message == "provider_error: 503"
    assert sorted(tracker.cancelled) == [BRANCHES["claude"], BRANCHES["gemini"]]


def test_quorum_skips_errors_and_cancels_the_slow_branch() -> None:
    tracker = Tracker()
    behaviors = {
        BRANCHES["gpt"]: after(0.0, failed("refusal", "no"), tracker, "gpt"),
        BRANCHES["claude"]: after(0.02, succeeded(_reply("c")), tracker, "claude"),
        BRANCHES["gemini"]: after(0.04, succeeded(_reply("m")), tracker, "gemini"),
    }
    node = _node(BuiltinPolicy(use="quorum", params={"min_ok": 2, "on_error": "skip"}))
    scope = FakeScope(node, behaviors)

    outcome = _execute(scope, node)

    assert isinstance(outcome, NodeSucceeded)
    assert outcome.output == {"candidates": ["c", "m"]}
    assert tracker.cancelled == []

    slow = {**behaviors, BRANCHES["gemini"]: after(1.0, succeeded(_reply("m")), tracker, "gemini")}
    quorum_one = _node(BuiltinPolicy(use="quorum", params={"min_ok": 1, "on_error": "skip"}))
    early = FakeScope(quorum_one, slow)

    decided = _execute(early, quorum_one)

    assert isinstance(decided, NodeSucceeded)
    assert decided.output == {"candidates": ["c"]}
    assert tracker.cancelled == [BRANCHES["gemini"]]


def test_quorum_fails_when_unreachable() -> None:
    tracker = Tracker()
    behaviors = {
        BRANCHES["gpt"]: after(0.0, failed("refusal", "no"), tracker, "gpt"),
        BRANCHES["claude"]: after(0.01, failed("refusal", "no"), tracker, "claude"),
        BRANCHES["gemini"]: after(1.0, succeeded(_reply("m")), tracker, "gemini"),
    }
    node = _node(BuiltinPolicy(use="quorum", params={"min_ok": 2, "on_error": "skip"}))
    scope = FakeScope(node, behaviors)

    outcome = _execute(scope, node)

    assert isinstance(outcome, NodeFailed)
    assert outcome.error.code == "E_JOIN_FAILED"
    unreachable = quorum(JoinState[JsonValue](completed=(), pending=()), QuorumParams(min_ok=2, on_error="skip"))
    assert isinstance(unreachable, Fail)
    assert outcome.error.message == unreachable.reason
    assert tracker.cancelled == [BRANCHES["gemini"]]


def test_first_success_and_any_take_the_first_ok_branch() -> None:
    tracker = Tracker()
    behaviors = {
        BRANCHES["gpt"]: after(0.0, failed("refusal", "no"), tracker, "gpt"),
        BRANCHES["claude"]: after(0.02, succeeded(_reply("c")), tracker, "claude"),
        BRANCHES["gemini"]: after(1.0, succeeded(_reply("m")), tracker, "gemini"),
    }
    first = _node(BuiltinPolicy(use="first_success"))

    outcome = _execute(FakeScope(first, behaviors), first)

    assert isinstance(outcome, NodeSucceeded)
    assert outcome.output == {"candidates": ["c"]}
    assert tracker.cancelled == [BRANCHES["gemini"]]

    any_node = _node(BuiltinPolicy(use="any"))
    rejected = _execute(FakeScope(any_node, behaviors), any_node)

    assert isinstance(rejected, NodeFailed)
    assert rejected.error.message == "refusal: no"


def test_custom_join_policy_receives_generated_models_and_returns_json() -> None:
    control_policies.SEEN_TYPES.clear()
    tracker = Tracker()

    behaviors = {
        BRANCHES["gpt"]: after(0.0, succeeded({"best_index": 1, "rationale": "a"}), tracker, "gpt"),
        BRANCHES["claude"]: after(0.02, succeeded({"best_index": 1, "rationale": "b"}), tracker, "claude"),
        BRANCHES["gemini"]: after(1.0, succeeded({"best_index": 0, "rationale": "c"}), tracker, "gemini"),
    }
    policy = CodePolicy(run=CodeRef("control_policies:agreeing_verdicts"), params={"min_agree": 2})
    node = _node(policy, (RefBinding(name="verdicts", ref="$ok"),))

    outcome = _execute(FakeScope(node, behaviors), node)

    assert isinstance(outcome, NodeSucceeded)
    assert outcome.output == {
        "verdicts": [{"best_index": 1, "rationale": "a"}, {"best_index": 1, "rationale": "b"}],
    }
    assert set(control_policies.SEEN_TYPES) == {"Verdict"}
    assert tracker.cancelled == [BRANCHES["gemini"]]


def test_custom_join_policy_rejects_values_that_do_not_fit_the_model() -> None:
    tracker = Tracker()
    behaviors = {branch: after(0.0, succeeded({"reply": "x"}), tracker, key) for key, branch in BRANCHES.items()}
    node = _node(CodePolicy(run=CodeRef("control_policies:agreeing_verdicts"), params={"min_agree": 2}))

    outcome = _execute(FakeScope(node, behaviors), node)

    assert isinstance(outcome, NodeFailed)
    assert outcome.error.code == "E_POLICY_INPUT"


def test_policy_resolution_errors_fail_before_any_branch_starts() -> None:
    tracker = Tracker()
    behaviors = {branch: after(0.0, succeeded(_reply(key)), tracker, key) for key, branch in BRANCHES.items()}
    cases: dict[str, CompiledPolicy] = {
        "E_POLICY_UNKNOWN": BuiltinPolicy(use="majority"),
        "E_POLICY_PARAMS": BuiltinPolicy(use="quorum", params={"min_ok": 0}),
        "E_CODE_REF_UNRESOLVED": CodePolicy(run=CodeRef("control_policies:missing")),
        "E_CODE_SIGNATURE_MISMATCH": CodePolicy(run=CodeRef("control_policies:NOT_A_FUNCTION")),
    }
    for code, policy in cases.items():
        node = _node(policy)
        scope = FakeScope(node, behaviors)

        outcome = _execute(scope, node)

        assert isinstance(outcome, NodeFailed)
        assert outcome.error.code == code
        assert scope.calls == []


def test_undecided_and_raising_policies_fail_the_node() -> None:
    tracker = Tracker()
    behaviors = {
        BRANCHES["gpt"]: after(0.0, succeeded({"best_index": 0, "rationale": "a"}), tracker, "gpt"),
        BRANCHES["claude"]: after(0.01, succeeded({"best_index": 0, "rationale": "b"}), tracker, "claude"),
        BRANCHES["gemini"]: after(0.5, succeeded({"best_index": 0, "rationale": "c"}), tracker, "gemini"),
    }
    undecided = _node(CodePolicy(run=CodeRef("control_policies:never_decides")))

    outcome = _execute(FakeScope(undecided, behaviors), undecided)

    assert isinstance(outcome, NodeFailed)
    assert outcome.error.code == "E_JOIN_UNDECIDED"
    assert outcome.usage.requests == 3

    raising = _node(CodePolicy(run=CodeRef("control_policies:explodes")))

    crashed = _execute(FakeScope(raising, behaviors), raising)

    assert isinstance(crashed, NodeFailed)
    assert crashed.error.code == "E_POLICY_RAISED"
    assert "RuntimeError" in crashed.error.message
    assert BRANCHES["gemini"] in tracker.cancelled


def test_cancelled_branch_is_a_branch_error_for_the_join_policy() -> None:
    tracker = Tracker()
    behaviors = {
        BRANCHES["gpt"]: after(0.0, NodeCancelled(reason="run cancelled"), tracker, "gpt"),
        BRANCHES["claude"]: after(1.0, succeeded(_reply("c")), tracker, "claude"),
        BRANCHES["gemini"]: after(1.0, succeeded(_reply("m")), tracker, "gemini"),
    }
    node = _node(BuiltinPolicy(use="all"))

    outcome = _execute(FakeScope(node, behaviors), node)

    assert isinstance(outcome, NodeFailed)
    assert outcome.error.code == "E_JOIN_FAILED"
    assert outcome.error.message == "E_CHILD_CANCELLED: run cancelled"
    assert sorted(tracker.cancelled) == [BRANCHES["claude"], BRANCHES["gemini"]]
