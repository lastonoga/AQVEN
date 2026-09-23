import asyncio
from datetime import UTC, datetime
from decimal import Decimal

from llm_harness import (
    EXPIRED_APPROVAL,
    MODELS,
    SCHEMA,
    FakeScope,
    MemorySecrets,
    OrderId,
    RecordingToolContexts,
    RefundOut,
    ScriptedApprovals,
    SettledCosts,
    agent,
    answer_inference,
    answer_node,
    field_ir,
    llm_bed,
    more_args,
    order_lookup,
    project,
    refund_issuer,
    retry_texts,
    tool_call,
    tool_returns,
)
from pydantic import JsonValue, SecretStr
from pydantic_ai.mcp import MCPToolset
from pydantic_ai.models import Model
from pydantic_ai.settings import ModelSettings

from aqven.engine.llm import (
    OUTPUT_TOOL_NAME,
    FactoryModelSource,
    LlmDependencies,
    llm_node_executor,
)
from aqven.engine.llm.tools import ToolsetBuilder
from aqven.ir import CodeToolSource, CompiledInference, CompiledMcpServer, CompiledTool, TemplatePrompt
from aqven.ports.execution import NodeFailed, NodeSucceeded
from aqven.ports.settings import SettingKey, SettingScope, SettingView
from aqven.runtime.steps import ToolContext
from aqven.spec import (
    AgentId,
    CodeRef,
    Effect,
    InferenceId,
    McpServerId,
    SecretHeader,
    SecretRef,
    SubagentSpec,
    ToolApprovalSpec,
    ToolId,
)

RUN_INPUT: dict[str, JsonValue] = {"question": "where is order LUM-1?", "product": None}
ORDER_SCHEMA: dict[str, JsonValue] = {
    "type": "object",
    "properties": {"order_id": {"type": "string"}},
    "required": ["order_id"],
}
LOOKUP_REF = CodeRef("shop.tools:lookup_order")
REFUND_REF = CodeRef("shop.tools:issue_refund")
FINAL = '{"reply": "done", "confidence": 1}'
REFUND_DOWN = "the refund desk is down"


def _tool(tool_id: str, run: CodeRef, effect: Effect) -> CompiledTool:
    return CompiledTool(
        tool_id=ToolId(tool_id),
        description=f"tool {tool_id}",
        source=CodeToolSource(run=run),
        effect=effect,
        input_schema=ORDER_SCHEMA,
    )


def _approval() -> ToolApprovalSpec:
    return ToolApprovalSpec.model_validate(
        {"tools": ["issue_refund"], "assignee": "ops", "timeout_seconds": 600, "on_timeout": {"policy": "fail"}}
    )


def test_read_tool_runs_inside_the_segment_and_streams_its_arguments() -> None:
    calls: list[str] = []
    turns = [
        [tool_call("lookup_order", '{"order_id": ', "call-1"), more_args('"LUM-1"}')],
        [tool_call(OUTPUT_TOOL_NAME, FINAL, "out-1")],
    ]
    bed = llm_bed(
        turns,
        answer_node(),
        [agent(tools=(ToolId("lookup_order"),))],
        [answer_inference()],
        RUN_INPUT,
        tools=[_tool("lookup_order", LOOKUP_REF, Effect.READ)],
        code={LOOKUP_REF: order_lookup(calls)},
    )

    outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeSucceeded)
    assert outcome.usage.tool_calls == 1
    assert outcome.usage.requests == 2
    assert calls == ["LUM-1"]
    assert bed.contexts.created == [(ToolId("lookup_order"), "call-1")]
    assert bed.scripted.seen[0][1].function_tools[0].name == "lookup_order"
    assert tool_returns(bed.scripted.seen[1][0]) == [{"order_id": "LUM-1", "status": "shipped"}]
    sink = bed.scope.output
    assert sink.text("tool_call_args", attempt=1) == '{"order_id": "LUM-1"}'
    assert sink.text("output_json", attempt=2) == FINAL
    assert sink.discards() == []
    assert len(bed.steps.segments) == 1


def test_side_effect_tool_waits_for_approval_and_runs_once_between_segments() -> None:
    calls: list[str] = []
    turns = [
        [tool_call("issue_refund", '{"order_id": "LUM-1"}', "call-9")],
        [tool_call(OUTPUT_TOOL_NAME, FINAL, "out-1")],
    ]
    bed = llm_bed(
        turns,
        answer_node(),
        [agent(tools=(ToolId("issue_refund"),), approval=_approval())],
        [answer_inference()],
        RUN_INPUT,
        tools=[_tool("issue_refund", REFUND_REF, Effect.WRITE)],
        code={REFUND_REF: refund_issuer(calls)},
    )

    outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeSucceeded)
    assert outcome.output == {"reply": "done", "confidence": 1}
    request = bed.approvals.requests[0]
    assert request.spec.assignee == "ops"
    assert [(call.tool_call_id, call.tool_name, call.args) for call in request.calls] == [
        ("call-9", "issue_refund", {"order_id": "LUM-1"})
    ]
    assert calls == ["LUM-1:call-9"]
    assert [call.tool_call_id for call in bed.steps.calls] == ["call-9"]
    assert [(state.segment, state.attempt_offset) for state in bed.steps.segments] == [(1, 0), (2, 1), (3, 1)]
    assert tool_returns(bed.scripted.seen[1][0]) == [{"refund_id": "rf-LUM-1"}]
    sink = bed.scope.output
    assert sink.text("tool_call_args", attempt=1) == '{"order_id": "LUM-1"}'
    assert sink.text("output_json", attempt=2) == FINAL
    assert sink.discards() == []


def test_side_effect_call_with_invalid_arguments_is_retried_before_asking_for_approval() -> None:
    calls: list[str] = []
    turns = [
        [tool_call("issue_refund", '{"order_id": 5}', "call-8")],
        [tool_call("issue_refund", '{"order_id": "LUM-1"}', "call-9")],
        [tool_call(OUTPUT_TOOL_NAME, FINAL, "out-1")],
    ]
    bed = llm_bed(
        turns,
        answer_node(),
        [agent(tools=(ToolId("issue_refund"),), approval=_approval())],
        [answer_inference()],
        RUN_INPUT,
        tools=[_tool("issue_refund", REFUND_REF, Effect.WRITE)],
        code={REFUND_REF: refund_issuer(calls)},
    )

    outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeSucceeded)
    assert [[call.tool_call_id for call in request.calls] for request in bed.approvals.requests] == [["call-9"]]
    assert [request.attempt for request in bed.approvals.requests] == [1]
    assert calls == ["LUM-1:call-9"]
    assert "invalid arguments for tool issue_refund" in retry_texts(bed.scripted.seen[1][0])[0]


def test_each_approval_round_of_one_execution_gets_its_own_number() -> None:
    calls: list[str] = []
    turns = [
        [tool_call("issue_refund", '{"order_id": 5}', "call-7")],
        [tool_call("issue_refund", '{"order_id": "LUM-1"}', "call-8")],
        [tool_call("issue_refund", '{"order_id": "LUM-2"}', "call-9")],
        [tool_call(OUTPUT_TOOL_NAME, FINAL, "out-1")],
    ]
    bed = llm_bed(
        turns,
        answer_node(),
        [agent(tools=(ToolId("issue_refund"),), approval=_approval())],
        [answer_inference()],
        RUN_INPUT,
        tools=[_tool("issue_refund", REFUND_REF, Effect.WRITE)],
        code={REFUND_REF: refund_issuer(calls)},
    )

    outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeSucceeded)
    assert [request.attempt for request in bed.approvals.requests] == [1, 2]
    assert calls == ["LUM-1:call-8", "LUM-2:call-9"]


def test_denied_approval_returns_denial_to_the_model_without_running_the_tool() -> None:
    calls: list[str] = []
    turns = [
        [tool_call("issue_refund", '{"order_id": "LUM-1"}', "call-9")],
        [tool_call(OUTPUT_TOOL_NAME, FINAL, "out-1")],
    ]
    bed = llm_bed(
        turns,
        answer_node(),
        [agent(tools=(ToolId("issue_refund"),), approval=_approval())],
        [answer_inference()],
        RUN_INPUT,
        tools=[_tool("issue_refund", REFUND_REF, Effect.WRITE)],
        code={REFUND_REF: refund_issuer(calls)},
        approve=False,
    )

    outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeSucceeded)
    assert calls == []
    assert bed.steps.calls == []
    assert tool_returns(bed.scripted.seen[1][0]) == ["operator refused"]
    assert len(bed.steps.segments) == 2


async def broken_refund(ctx: ToolContext, order_id: OrderId) -> RefundOut:
    raise RuntimeError(REFUND_DOWN)


def test_an_expired_approval_keeps_the_cost_paid_before_it() -> None:
    costs = SettledCosts()
    bed = llm_bed(
        [[tool_call("issue_refund", '{"order_id": "LUM-1"}', "call-9")]],
        answer_node(),
        [agent(tools=(ToolId("issue_refund"),), approval=_approval())],
        [answer_inference()],
        RUN_INPUT,
        tools=[_tool("issue_refund", REFUND_REF, Effect.WRITE)],
        code={REFUND_REF: refund_issuer([])},
        expire=True,
        models=costs.priced,
    )

    outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeFailed)
    assert (outcome.error.code, outcome.error.message) == ("HUMAN_TIMED_OUT", EXPIRED_APPROVAL)
    assert len(costs.seen) == 1
    assert outcome.usage.cost_usd == costs.total()
    assert outcome.usage.cost_usd > Decimal(0)
    assert outcome.usage.requests == 1


def test_a_tool_that_raises_after_approval_keeps_the_cost_paid_before_it() -> None:
    costs = SettledCosts()
    bed = llm_bed(
        [[tool_call("issue_refund", '{"order_id": "LUM-1"}', "call-9")]],
        answer_node(),
        [agent(tools=(ToolId("issue_refund"),), approval=_approval())],
        [answer_inference()],
        RUN_INPUT,
        tools=[_tool("issue_refund", REFUND_REF, Effect.WRITE)],
        code={REFUND_REF: broken_refund},
        models=costs.priced,
    )

    outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeFailed)
    assert outcome.error.code == "NODE_ERROR"
    assert REFUND_DOWN in outcome.error.message
    assert [call.tool_call_id for call in bed.steps.calls] == ["call-9"]
    assert outcome.usage.cost_usd == costs.total()
    assert outcome.usage.cost_usd > Decimal(0)


def test_a_resumed_segment_that_fails_pays_for_every_segment() -> None:
    costs = SettledCosts()
    broken = [tool_call(OUTPUT_TOOL_NAME, '{"reply": ', "out-1")]
    bed = llm_bed(
        [[tool_call("issue_refund", '{"order_id": "LUM-1"}', "call-9")], broken, broken],
        answer_node(),
        [agent(tools=(ToolId("issue_refund"),), approval=_approval())],
        [answer_inference()],
        RUN_INPUT,
        tools=[_tool("issue_refund", REFUND_REF, Effect.WRITE)],
        code={REFUND_REF: refund_issuer([])},
        models=costs.priced,
    )

    outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeFailed)
    assert outcome.error.code == "MODEL_RETRIES_EXHAUSTED"
    assert len(costs.seen) == 3
    assert outcome.usage.cost_usd == costs.total()
    assert outcome.usage.requests == 3


def test_subagent_is_a_tool_that_runs_its_own_inference() -> None:
    grade = CompiledInference(
        inference_id=InferenceId("grade"),
        description="grading",
        input_fields=(field_ir("question", "Text"), field_ir("reply", "Text")),
        output_fields=(field_ir("rationale", "Text"), field_ir("score", "Float")),
        input_schema=SCHEMA,
        output_schema=SCHEMA,
        prompt=TemplatePrompt(level=2, template="{{ question }} / {{ reply }}\n{{ output_format }}"),
    )
    subagent = SubagentSpec(name="grader", description="grader", agent=AgentId("critic"), inference=grade.inference_id)
    turns = [
        [tool_call("grader", '{"question": "q", "reply": "r"}', "call-1")],
        [tool_call(OUTPUT_TOOL_NAME, '{"rationale": "ok", "score": 0.8}', "judge-1")],
        [tool_call(OUTPUT_TOOL_NAME, FINAL, "out-1")],
    ]
    writer = agent(subagents=(subagent,))
    bed = llm_bed(turns, answer_node(), [writer, agent("critic")], [answer_inference(), grade], RUN_INPUT)

    outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeSucceeded)
    assert outcome.usage.requests == 3
    assert tool_returns(bed.scripted.seen[2][0]) == [{"rationale": "ok", "score": 0.8}]
    assert bed.scope.output.text("tool_call_args", attempt=1) == '{"question": "q", "reply": "r"}'


def test_mcp_server_toolset_gets_headers_from_secrets() -> None:
    server = CompiledMcpServer(
        server_id=McpServerId("crm"),
        description="CRM",
        url="http://127.0.0.1:9/mcp",
        headers=(SecretHeader(name="Authorization", value=SecretRef("ref:env/CRM_TOKEN")),),
    )
    writer = agent(mcp_servers=(server.server_id,))
    compiled, flow = project(answer_node(), [writer], [answer_inference()], mcp_servers=[server])
    scope = FakeScope(compiled, flow, RUN_INPUT)
    secrets = MemorySecrets({"ref:env/CRM_TOKEN": "Bearer t0ken"})
    builder = ToolsetBuilder(_NoCode(), RecordingToolContexts(), secrets, _NoNested())

    plan = asyncio.run(builder.build(scope, scope.project.agent(AgentId("writer")), nested=False))

    servers = [toolset for toolset in plan.toolsets if isinstance(toolset, MCPToolset)]
    assert [toolset.id for toolset in servers] == ["crm"]
    assert getattr(servers[0].client.transport, "headers", None) == {"Authorization": "Bearer t0ken"}
    assert plan.deferred is False


def test_missing_provider_key_fails_the_node() -> None:
    compiled, flow = project(answer_node(), [agent()], [answer_inference()])
    scope = FakeScope(compiled, flow, RUN_INPUT)
    dependencies = LlmDependencies(
        models=FactoryModelSource(_NeverFactory(), _EmptySettings(), {}),
        inference_models=MODELS,
        tool_contexts=RecordingToolContexts(),
        approvals=ScriptedApprovals(),
    )

    outcome = asyncio.run(llm_node_executor(dependencies).execute(answer_node(), scope))

    assert isinstance(outcome, NodeFailed)
    assert outcome.error.code == "provider_key_missing"
    assert "OPENROUTER_API_KEY" in outcome.error.message


class _NoCode:
    def load(self, ref: str) -> object:
        raise LookupError(ref)


class _NoNested:
    async def run(
        self, scope: object, agent_id: AgentId, inference_id: InferenceId, document: object, usage: object
    ) -> dict[str, JsonValue]:
        raise LookupError(inference_id)


class _NeverFactory:
    def build(self, model: str, *, settings: ModelSettings | None, api_key: SecretStr | None) -> Model:
        raise AssertionError("the factory is not called without a key")


class _EmptySettings:
    async def list_settings(self, scope: SettingScope) -> tuple[SettingView, ...]:
        return ()

    async def get_setting(self, scope: SettingScope, key: SettingKey) -> SettingView | None:
        return None

    async def set_value(self, scope: SettingScope, key: SettingKey, value: JsonValue) -> SettingView:
        return SettingView(scope=scope, key=key, kind="value", value=value, updated_at=datetime.now(UTC))

    async def set_secret(self, scope: SettingScope, key: SettingKey, secret: SecretStr) -> SettingView:
        return SettingView(scope=scope, key=key, kind="secret", updated_at=datetime.now(UTC))

    async def delete_setting(self, scope: SettingScope, key: SettingKey) -> bool:
        return False

    async def read_secret(self, scope: SettingScope, key: SettingKey) -> SecretStr | None:
        return None
