import asyncio

import pytest
from control_fakes import ChildCall, OverlayScope, succeeded
from pydantic import JsonValue

from aqven.engine.control import control_executors, resolve_local
from aqven.ir import BuiltinPolicy, CompiledLoopNode, RefBinding
from aqven.ports.execution import NodeOutcome, NodeSucceeded, ScopeFrame
from aqven.spec import NodeId

LOCAL_REFS = (
    "$ok",
    "$ok[*].reply",
    "$ok[1].reply",
    "$failed[*].index",
    "$branch.gpt.reply",
    "$iter.critique.out.score",
    "$loop.stop_reason",
)


def test_control_executors_plug_into_engine_extensions() -> None:
    pytest.importorskip("aqven.engine.extensions")
    from aqven.engine.extensions import EngineExtensions
    from aqven.ports.execution import InputOverlayScope

    executors = control_executors()
    extensions = EngineExtensions(parallel=executors.parallel, map=executors.map, loop=executors.loop)
    body = NodeId("polish__fix")

    async def fix(call: ChildCall) -> NodeOutcome:
        return succeeded({"text": call.inputs})

    node = CompiledLoopNode(
        node_id=NodeId("polish"),
        description="revision",
        body=(body,),
        init={body: (RefBinding(name="text", ref="$input.text"),)},
        max_iter=1,
        select=BuiltinPolicy(use="last"),
        outputs=(RefBinding(name="text", ref="$iter.fix.out.text"),),
        output_schema={"type": "object"},
    )
    scope = OverlayScope(node, {body: fix}, input_value={"text": "draft"})

    assert isinstance(scope, InputOverlayScope)
    assert extensions.loop is executors.loop
    loop = extensions.loop
    assert loop is not None
    outcome = asyncio.run(loop.execute(node, scope))

    assert isinstance(outcome, NodeSucceeded)
    assert outcome.output == {"text": {"text": "draft"}}


def test_local_roots_match_engine_ref_evaluation() -> None:
    pytest.importorskip("aqven.engine.values")
    from aqven.engine.values import RefSources, evaluate_ref

    frame = ScopeFrame(
        ok=({"reply": "a"}, {"reply": "b"}),
        failed=({"index": 2, "code": "refusal", "message": "no"},),
        branch={"gpt": {"reply": "a"}},
        iter={"critique": {"out": {"score": 0.9}}},
        loop={"iterations": 2, "stop_reason": "policy"},
    )
    node = CompiledLoopNode(
        node_id=NodeId("polish"),
        description="revision",
        body=(NodeId("polish__fix"),),
        max_iter=1,
        select=BuiltinPolicy(use="last"),
        outputs=(RefBinding(name="text", ref="$iter.fix.out.text"),),
        output_schema={"type": "object"},
    )
    scope = OverlayScope(node, {})

    def missing(node_id: str) -> JsonValue:
        return None

    sources = RefSources(flow_input={}, run_context={}, frame=frame, node_output=missing)

    for ref in LOCAL_REFS:
        assert resolve_local(scope, frame, ref) == evaluate_ref(ref, sources), ref
