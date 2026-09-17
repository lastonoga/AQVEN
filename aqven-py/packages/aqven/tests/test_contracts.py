import asyncio
import hashlib
from collections.abc import Sequence
from datetime import UTC, datetime
from decimal import Decimal
from typing import get_args

import pytest
from pydantic import JsonValue, SecretStr, ValidationError

from aqven.ir import (
    AgentModel,
    BuiltinPolicy,
    CodePolicy,
    CodeToolSource,
    CompiledAgent,
    CompiledBinding,
    CompiledCallNode,
    CompiledCheck,
    CompiledCodeNode,
    CompiledFlow,
    CompiledHumanNode,
    CompiledInference,
    CompiledLlmNode,
    CompiledLoopNode,
    CompiledMapNode,
    CompiledMcpServer,
    CompiledNarrowNode,
    CompiledNode,
    CompiledParallelNode,
    CompiledProject,
    CompiledSwitchCase,
    CompiledSwitchNode,
    CompiledTool,
    CompiledToolNode,
    FieldIr,
    HashDomain,
    IrHash,
    IrLookupError,
    JudgeEvaluator,
    LiteralBinding,
    McpToolSource,
    ModelCapabilities,
    RefBinding,
    TemplatePrompt,
    canonical_json,
    flow_closure,
    flow_hash,
    hash_of,
    inner_node_ids,
    node_behavior_hash,
    node_body_hash,
    project_hash,
)
from aqven.ports import (
    CHAT_EVENT_ADAPTER,
    CHAT_EVENT_TYPES,
    ChatEvent,
    ChildEntry,
    ExecutionScope,
    NodeExecutors,
    NodeOutcome,
    NodeSkipped,
    OutputSink,
    RunEventSink,
    ScopeFrame,
    SettingKey,
    SettingScope,
    SettingView,
    execute_node,
    mask_secret,
    model_provider,
    provider_key_setting,
    resolve_secret,
)
from aqven.runtime.address import ExecutionAddress, JsonObject, RunId, node_address
from aqven.runtime.events import (
    OUTPUT_DELTA_BATCH_MS,
    RUN_EVENT_ADAPTER,
    RUN_EVENT_TYPES,
    NodeAttemptDiscarded,
    NodeOutputDelta,
    RunEvent,
)
from aqven.runtime.vocabulary import RunMode
from aqven.spec import (
    AgentId,
    CodeRef,
    Effect,
    FailOnTimeout,
    FlowId,
    InferenceId,
    McpServerId,
    Modality,
    ModelFamily,
    ModelString,
    NodeId,
    OnFail,
    ProviderName,
    ToolId,
    TypeId,
)

SCHEMA: dict[str, JsonValue] = {"type": "object"}
AT = datetime(2026, 9, 17, 12, 0, tzinfo=UTC)


def _union_types(union: object) -> frozenset[str]:
    members = get_args(get_args(union)[0])
    return frozenset(str(member.model_fields["type"].default) for member in members)


def _agent(agent_id: str, tools: tuple[ToolId, ...] = ()) -> CompiledAgent:
    capabilities = ModelCapabilities(
        family=ModelFamily.OPENAI,
        input=(Modality.TEXT, Modality.IMAGE, Modality.TEXT),
        output=(Modality.TEXT,),
        strict=True,
    )
    model = AgentModel(
        model=ModelString("openrouter:openai/gpt-oss-20b"),
        provider=ProviderName.OPENROUTER,
        capabilities=capabilities,
    )
    return CompiledAgent(agent_id=AgentId(agent_id), description="агент", models=(model,), tools=tools)


def _inference(inference_id: str, checks: tuple[CompiledCheck, ...] = ()) -> CompiledInference:
    return CompiledInference(
        inference_id=InferenceId(inference_id),
        description="инференс",
        input_fields=(FieldIr(name="text", type="Text", description="текст"),),
        output_fields=(FieldIr(name="label", type="Text", description="метка"),),
        input_schema=SCHEMA,
        output_schema=SCHEMA,
        prompt=TemplatePrompt(level=2, template="{{ text }}"),
        checks=checks,
    )


def _nodes() -> tuple[CompiledNode, ...]:
    return (
        CompiledCodeNode(
            node_id=NodeId("prepare"),
            description="подготовка",
            run=CodeRef("shop.flows.intake.nodes.prepare.prepare:prepare"),
            inputs=(RefBinding(name="text", ref="$input.text"),),
            input_schema=SCHEMA,
            output_schema=SCHEMA,
            output_fields=(FieldIr(name="items", type="Text[]", description="элементы"),),
        ),
        CompiledMapNode(
            node_id=NodeId("vote"),
            description="голоса",
            over="$prepare.out.items",
            body=NodeId("vote__ballot"),
            concurrency=3,
            on_item_error=BuiltinPolicy(use="skip"),
            outputs=(RefBinding(name="ballots", ref="$item"),),
            output_schema=SCHEMA,
        ),
        CompiledLlmNode(
            node_id=NodeId("vote__ballot"),
            parent=NodeId("vote"),
            description="голос",
            agent=AgentId("writer"),
            inference=InferenceId("ballot"),
            output_mode="tool",
            inputs=(RefBinding(name="text", ref="$item"),),
            input_schema=SCHEMA,
            output_schema=SCHEMA,
        ),
        CompiledSwitchNode(
            node_id=NodeId("route"),
            description="маршрут",
            on="$prepare.out.items",
            cases={
                "search": CompiledSwitchCase(node=NodeId("route__search")),
                "skip": CompiledSwitchCase(bindings=(LiteralBinding(name="found", value=None),)),
            },
            output_names=("found",),
            output_schema=SCHEMA,
        ),
        CompiledToolNode(
            node_id=NodeId("route__search"),
            parent=NodeId("route"),
            description="поиск",
            tool=ToolId("search_kb"),
            input_schema=SCHEMA,
            output_schema=SCHEMA,
        ),
        CompiledParallelNode(
            node_id=NodeId("drafts"),
            description="черновики",
            branches={"gpt": NodeId("drafts__gpt")},
            join=BuiltinPolicy(use="quorum", params={"min_ok": 1, "on_error": "skip"}),
            outputs=(RefBinding(name="candidates", ref="$ok[*].label"),),
            output_schema=SCHEMA,
        ),
        CompiledLlmNode(
            node_id=NodeId("drafts__gpt"),
            parent=NodeId("drafts"),
            description="черновик",
            agent=AgentId("critic"),
            inference=InferenceId("ballot"),
            output_mode="prompted",
            input_schema=SCHEMA,
            output_schema=SCHEMA,
        ),
        CompiledLoopNode(
            node_id=NodeId("polish"),
            description="правка",
            body=(NodeId("polish__fix"),),
            init={NodeId("polish__fix"): (RefBinding(name="text", ref="$drafts.out.candidates"),)},
            max_iter=3,
            stop=(CodePolicy(run=CodeRef("shop.flows.intake.nodes.polish.polish:no_issues"), params={"path": "$acc"}),),
            select=BuiltinPolicy(use="last"),
            outputs=(RefBinding(name="text", ref="$iter.polish__fix.out.items"),),
            output_schema=SCHEMA,
        ),
        CompiledCodeNode(
            node_id=NodeId("polish__fix"),
            parent=NodeId("polish"),
            description="исправление",
            run=CodeRef("shop.flows.intake.nodes.polish.fix:fix"),
            input_schema=SCHEMA,
            output_schema=SCHEMA,
            output_fields=(FieldIr(name="items", type="Text[]", description="элементы"),),
        ),
        CompiledCallNode(
            node_id=NodeId("panel"),
            description="панель",
            flow=FlowId("judge"),
            inputs=(RefBinding(name="candidates", ref="$drafts.out.candidates"),),
            input_schema=SCHEMA,
            output_schema=SCHEMA,
        ),
        CompiledNarrowNode(
            node_id=NodeId("to_record"),
            description="сужение",
            source="$panel.out",
            to=TypeId("CaseRecord"),
            output_schema=SCHEMA,
        ),
        CompiledHumanNode(
            node_id=NodeId("approve"),
            description="согласование",
            form=TypeId("ReplyApproval"),
            assignee="support_lead",
            timeout_seconds=3600,
            on_timeout=FailOnTimeout(policy="fail"),
            input_schema=SCHEMA,
            output_schema=SCHEMA,
        ),
    )


def _flow(flow_id: str, nodes: tuple[CompiledNode, ...], order: tuple[str, ...]) -> CompiledFlow:
    return CompiledFlow(
        flow_id=FlowId(flow_id),
        description="воркфлоу",
        input_type="CaseRequest",
        output_type="CaseOutcome",
        input_schema=SCHEMA,
        output_schema=SCHEMA,
        returns=(RefBinding(name="result", ref="$approve.out"),),
        order=tuple(NodeId(node_id) for node_id in order),
        nodes={node.node_id: node for node in nodes},
    )


def _project(ballot_template: str = "{{ text }}") -> CompiledProject:
    judge_node = CompiledLlmNode(
        node_id=NodeId("pick"),
        description="выбор",
        agent=AgentId("critic"),
        inference=InferenceId("pick"),
        output_mode="tool",
        input_schema=SCHEMA,
        output_schema=SCHEMA,
    )
    judge_check = CompiledCheck(
        name="grounded",
        evaluator=JudgeEvaluator(inference=InferenceId("grade"), agent=AgentId("critic")),
        on_fail=OnFail.RETRY,
    )
    ballot = _inference("ballot", (judge_check,)).model_copy(
        update={"prompt": TemplatePrompt(level=2, template=ballot_template)}
    )
    return CompiledProject(
        package="shop",
        description="проект",
        agents={
            AgentId("writer"): _agent("writer", (ToolId("lookup"),)),
            AgentId("critic"): _agent("critic"),
            AgentId("unused"): _agent("unused"),
        },
        inferences={
            InferenceId("ballot"): ballot,
            InferenceId("grade"): _inference("grade"),
            InferenceId("pick"): _inference("pick"),
        },
        tools={
            ToolId("search_kb"): CompiledTool(
                tool_id=ToolId("search_kb"),
                description="поиск",
                source=CodeToolSource(run=CodeRef("shop.tools.functions:search_kb")),
                effect=Effect.READ,
            ),
            ToolId("lookup"): CompiledTool(
                tool_id=ToolId("lookup"),
                description="справочник",
                source=McpToolSource(server=McpServerId("desk"), tool="lookup"),
                effect=Effect.READ,
            ),
        },
        mcp_servers={
            McpServerId("desk"): CompiledMcpServer(
                server_id=McpServerId("desk"), description="сервер", url="http://127.0.0.1:9/mcp"
            )
        },
        flows={
            FlowId("intake"): _flow(
                "intake", _nodes(), ("prepare", "vote", "route", "drafts", "polish", "panel", "to_record", "approve")
            ),
            FlowId("judge"): _flow("judge", (judge_node,), ("pick",)).model_copy(
                update={"returns": (RefBinding(name="winner", ref="$pick.out"),)}
            ),
        },
    )


def test_compiled_project_round_trips_through_json() -> None:
    project = _project()

    restored = CompiledProject.model_validate_json(project.model_dump_json())

    assert restored == project
    assert project_hash(restored) == project_hash(project)
    assert {node.kind for node in project.flow(FlowId("intake")).nodes.values()} == {
        "llm",
        "code",
        "tool",
        "human",
        "parallel",
        "map",
        "switch",
        "loop",
        "call",
        "narrow",
    }


def test_modalities_are_sorted_and_unique() -> None:
    agent = _project().agent(AgentId("writer"))

    assert agent.primary.capabilities.input == (Modality.IMAGE, Modality.TEXT)


def test_hash_is_sha256_over_domain_separator_and_rfc8785() -> None:
    value: JsonValue = {"b": 1, "a": [True, None, "x"]}
    expected = hashlib.sha256(b"aqven/flow-spec/v1\x00" + b'{"a":[true,null,"x"],"b":1}').hexdigest()

    assert canonical_json(value) == b'{"a":[true,null,"x"],"b":1}'
    assert hash_of(HashDomain.FLOW_SPEC, value) == f"sha256-{expected}"
    assert hash_of(HashDomain.NODE_BODY, value) != hash_of(HashDomain.FLOW_SPEC, value)


def test_flow_closure_keeps_only_reachable_entities() -> None:
    closure = flow_closure(_project(), FlowId("intake"))

    assert set(closure.flows) == {"intake", "judge"}
    assert set(closure.agents) == {"writer", "critic"}
    assert set(closure.inferences) == {"ballot", "grade", "pick"}
    assert set(closure.tools) == {"search_kb", "lookup"}
    assert set(closure.mcp_servers) == {"desk"}


def test_flow_hash_ignores_unreachable_and_descriptive_changes() -> None:
    project = _project()
    renamed = project.model_copy(update={"description": "другое описание", "agents": dict(project.agents)})
    unrelated = project.model_copy(
        update={"agents": {**project.agents, AgentId("unused"): _agent("unused", (ToolId("search_kb"),))}}
    )

    assert flow_hash(renamed, FlowId("intake")) == flow_hash(project, FlowId("intake"))
    assert flow_hash(unrelated, FlowId("intake")) == flow_hash(project, FlowId("intake"))
    assert flow_hash(_project("{{ text }}!"), FlowId("intake")) != flow_hash(project, FlowId("intake"))
    assert flow_hash(_project("{{ text }}!"), FlowId("judge")) == flow_hash(project, FlowId("judge"))


def test_node_hashes_split_body_and_behavior() -> None:
    project = _project()
    node = project.flow(FlowId("intake")).node(NodeId("vote__ballot"))
    described = node.model_copy(update={"description": "новое описание"})

    assert node_body_hash(described) != node_body_hash(node)
    assert node_behavior_hash(project, described) == node_behavior_hash(project, node)
    assert node_behavior_hash(_project("{{ text }}?"), node) != node_behavior_hash(project, node)


def test_inner_node_ids_per_kind() -> None:
    nodes = {node.node_id: node for node in _nodes()}

    assert inner_node_ids(nodes[NodeId("vote")]) == ("vote__ballot",)
    assert inner_node_ids(nodes[NodeId("route")]) == ("route__search",)
    assert inner_node_ids(nodes[NodeId("drafts")]) == ("drafts__gpt",)
    assert inner_node_ids(nodes[NodeId("polish")]) == ("polish__fix",)
    assert inner_node_ids(nodes[NodeId("prepare")]) == ()


def test_integrity_errors_name_missing_references() -> None:
    project = _project()

    with pytest.raises(ValidationError, match="ghost"):
        _flow("intake", _nodes()[:1], ("prepare", "ghost"))
    with pytest.raises(ValidationError, match="search_kb"):
        CompiledProject.model_validate(project.model_dump() | {"tools": {}, "agents": {}})
    with pytest.raises(IrLookupError):
        project.flow(FlowId("missing"))


def test_run_event_catalog_is_exhaustive() -> None:
    assert _union_types(RunEvent.__value__) == RUN_EVENT_TYPES
    assert {"node_output_delta", "node_attempt_discarded"} <= RUN_EVENT_TYPES
    assert OUTPUT_DELTA_BATCH_MS == 80


def test_output_delta_events_round_trip() -> None:
    address = node_address("vote__ballot", item_index=2)
    delta = NodeOutputDelta(
        seq=7,
        at=AT,
        run_id=RunId("run-1"),
        address=address,
        attempt=1,
        part_kind="output_json",
        part_index=0,
        delta='{"label":',
        cumulative_length=9,
    )
    discarded = NodeAttemptDiscarded(
        seq=8, at=AT, run_id=RunId("run-1"), address=address, attempt=1, cause="schema_invalid", discarded_parts=1
    )

    assert RUN_EVENT_ADAPTER.validate_json(delta.model_dump_json()) == delta
    assert RUN_EVENT_ADAPTER.validate_json(discarded.model_dump_json()) == discarded


def test_chat_event_catalog_is_exhaustive() -> None:
    assert _union_types(ChatEvent.__value__) == CHAT_EVENT_TYPES
    event = CHAT_EVENT_ADAPTER.validate_python(
        {
            "type": "chat_usage",
            "seq": 1,
            "at": AT,
            "session_id": "s-1",
            "turn_id": None,
            "usage": {
                "model": None,
                "tokens_in": 1,
                "tokens_out": 2,
                "cache_read_tokens": 0,
                "cache_write_tokens": 0,
                "cost_usd": Decimal("0.01"),
            },
        }
    )
    assert event.type == "chat_usage"


class _MemorySettings:
    def __init__(self, secrets: dict[tuple[SettingScope, SettingKey], str]) -> None:
        self._secrets = secrets

    async def list_settings(self, scope: SettingScope) -> tuple[SettingView, ...]:
        return ()

    async def get_setting(self, scope: SettingScope, key: SettingKey) -> SettingView | None:
        return None

    async def set_value(self, scope: SettingScope, key: SettingKey, value: JsonValue) -> SettingView:
        raise NotImplementedError

    async def set_secret(self, scope: SettingScope, key: SettingKey, secret: SecretStr) -> SettingView:
        raise NotImplementedError

    async def delete_setting(self, scope: SettingScope, key: SettingKey) -> bool:
        return False

    async def read_secret(self, scope: SettingScope, key: SettingKey) -> SecretStr | None:
        stored = self._secrets.get((scope, key))
        return None if stored is None else SecretStr(stored)


@pytest.mark.parametrize(
    ("stored", "environ", "expected"),
    [
        ({("project", "providers.openrouter.api_key"): "p"}, {}, "dotenv"),
        ({("project", "providers.openrouter.api_key"): "p"}, {"OPENROUTER_API_KEY": "e"}, "environment"),
        ({("project", "providers.openrouter.api_key"): "p"}, {"OPENROUTER_API_KEY": "p"}, "dotenv"),
        ({("studio", "providers.openrouter.api_key"): "s"}, {}, None),
        ({}, {"OPENROUTER_API_KEY": "e"}, "environment"),
        ({}, {}, None),
    ],
)
def test_secret_resolution_order(
    stored: dict[tuple[SettingScope, SettingKey], str], environ: dict[str, str], expected: str | None
) -> None:
    key = provider_key_setting(ProviderName.OPENROUTER)
    resolved = asyncio.run(resolve_secret(_MemorySettings(stored), key, "OPENROUTER_API_KEY", environ))

    assert (None if resolved is None else resolved.source) == expected


def test_secret_mask_and_provider_parsing() -> None:
    assert mask_secret("sk-or-v1-0123456789abcd") == "••••abcd"
    assert mask_secret("short") == "••••"
    assert "sk-or" not in repr(SecretStr("sk-or-v1-0123456789abcd"))
    assert model_provider("openrouter:openai/gpt-oss-20b") is ProviderName.OPENROUTER


class _SkipExecutor:
    def __init__(self, kind: str) -> None:
        self.kind = kind

    async def execute(self, node: CompiledNode, scope: ExecutionScope) -> NodeOutcome:
        return NodeSkipped(reason=f"{self.kind}:{node.node_id}")


def test_execute_node_dispatches_by_kind() -> None:
    executors = NodeExecutors(
        llm=_SkipExecutor("llm"),
        code=_SkipExecutor("code"),
        tool=_SkipExecutor("tool"),
        human=_SkipExecutor("human"),
        parallel=_SkipExecutor("parallel"),
        map=_SkipExecutor("map"),
        switch=_SkipExecutor("switch"),
        loop=_SkipExecutor("loop"),
        call=_SkipExecutor("call"),
        narrow=_SkipExecutor("narrow"),
    )
    scope = _StubScope()

    outcomes = [asyncio.run(execute_node(executors, node, scope)) for node in _nodes()]

    assert [outcome.status for outcome in outcomes] == ["skipped"] * len(_nodes())
    assert {outcome.reason for outcome in outcomes if isinstance(outcome, NodeSkipped)} >= {
        f"{node.kind}:{node.node_id}" for node in _nodes()
    }


class _StubScope:
    @property
    def run_id(self) -> RunId:
        return RunId("run-1")

    @property
    def mode(self) -> RunMode:
        return "live"

    @property
    def ir_hash(self) -> IrHash:
        return hash_of(HashDomain.PROJECT, None)

    @property
    def project(self) -> CompiledProject:
        return _project()

    @property
    def flow(self) -> CompiledFlow:
        return self.project.flow(FlowId("intake"))

    @property
    def address(self) -> ExecutionAddress:
        return node_address("prepare")

    @property
    def frame(self) -> ScopeFrame:
        return ScopeFrame()

    @property
    def events(self) -> RunEventSink:
        raise NotImplementedError

    @property
    def output(self) -> OutputSink:
        raise NotImplementedError

    def resolve(self, ref: str) -> JsonValue:
        raise NotImplementedError

    def bind(self, bindings: Sequence[CompiledBinding]) -> JsonObject:
        raise NotImplementedError

    def output_of(self, node_id: NodeId) -> JsonValue:
        raise NotImplementedError

    async def run_child(self, node_id: NodeId, entry: ChildEntry) -> NodeOutcome:
        raise NotImplementedError

    async def run_flow(self, flow_id: FlowId, flow_input: JsonObject) -> NodeOutcome:
        raise NotImplementedError
