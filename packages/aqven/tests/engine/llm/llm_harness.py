from collections.abc import AsyncGenerator, AsyncIterator, Awaitable, Callable, Mapping, Sequence
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated, Final, NewType

import httpx2
from pydantic import BaseModel, Field, JsonValue, SecretStr, StringConstraints
from pydantic_ai.messages import ModelMessage, ModelRequest, RetryPromptPart, ToolReturnPart, UserPromptPart
from pydantic_ai.models import Model
from pydantic_ai.models.function import AgentInfo, DeltaThinkingPart, DeltaToolCall, FunctionModel

from aqven.engine.llm import (
    ApprovalRequest,
    LlmDependencies,
    LlmNodeExecutor,
    MappedInferenceModels,
    PendingToolCall,
    SegmentResult,
    SegmentState,
    ToolCallResult,
    llm_node_executor,
)
from aqven.engine.llm.errors import LlmFailureCode, LlmNodeError
from aqven.engine.llm.ports import SegmentWork, ToolCallWork
from aqven.ir import (
    AgentModel,
    CompiledAgent,
    CompiledBinding,
    CompiledFlow,
    CompiledInference,
    CompiledLlmNode,
    CompiledMcpServer,
    CompiledProject,
    CompiledTool,
    FieldIr,
    IrHash,
    LiteralBinding,
    ModelCapabilities,
    RefBinding,
    TemplatePrompt,
)
from aqven.ir.nodes import OutputMode
from aqven.models import CallPolicy, ContextUsageSink, RequestCost, cassette_policy, guard_model
from aqven.policies import NoParams, Verdict
from aqven.ports.execution import (
    ChildEntry,
    EventBuilder,
    EventStamp,
    ExecutionScope,
    NodeOutcome,
    NodeSkipped,
    OutputPart,
    ScopeFrame,
)
from aqven.runtime.address import ExecutionAddress, JsonObject, RunId, node_address
from aqven.runtime.events import RunEvent
from aqven.runtime.human import ToolApprovalDecision
from aqven.runtime.steps import BlobStore, ToolContext
from aqven.runtime.vocabulary import AttemptCauseKind, RunMode
from aqven.spec import (
    GENERATED_CONFIG,
    AgentId,
    FlowId,
    InferenceId,
    Modality,
    ModelFamily,
    ModelString,
    NodeId,
    ProviderName,
    RenderedPrompt,
    SecretRef,
    ToolId,
    system,
    user,
)

type Chunk = str | dict[int, DeltaToolCall] | dict[int, DeltaThinkingPart]

SCHEMA: Final[dict[str, JsonValue]] = {"type": "object"}
IR_HASH: Final = IrHash("sha256-" + "0" * 64)
AT: Final = datetime(2026, 9, 17, 12, 0, tzinfo=UTC)
NODE: Final = NodeId("answer")
FLOW: Final = FlowId("support")
MODEL: Final = ModelString("openrouter:openai/gpt-oss-20b")
PRICED_NAME: Final = "gpt-4o-mini"
EXPIRED_APPROVAL: Final = "the approval was not answered in time"

PolicyId = NewType("PolicyId", str)
type PolicyIdField = Annotated[PolicyId, StringConstraints(pattern="^pol_[a-z]+$")]
OrderId = NewType("OrderId", str)


class PolicyRef(BaseModel):
    model_config = GENERATED_CONFIG
    policy_id: PolicyIdField
    title: Annotated[str, StringConstraints(max_length=80)]


class Product(BaseModel):
    model_config = GENERATED_CONFIG
    kind: str | None


class AnswerIn(BaseModel):
    model_config = GENERATED_CONFIG
    question: str
    product: Product | None


class AnswerOut(BaseModel):
    model_config = GENERATED_CONFIG
    reply: Annotated[str, StringConstraints(max_length=200)]
    confidence: float


class Choice(BaseModel):
    model_config = GENERATED_CONFIG
    policy: PolicyIdField
    reason: str


class PickIn(BaseModel):
    model_config = GENERATED_CONFIG
    question: str
    policies: list[PolicyRef]


class PickOut(BaseModel):
    model_config = GENERATED_CONFIG
    choices: Annotated[list[Choice], Field(max_length=3)]


class GradeIn(BaseModel):
    model_config = GENERATED_CONFIG
    question: str
    reply: str


class GradeOut(BaseModel):
    model_config = GENERATED_CONFIG
    rationale: str
    score: float


class OrderInfo(BaseModel):
    model_config = GENERATED_CONFIG
    order_id: OrderId
    status: str


class RefundOut(BaseModel):
    model_config = GENERATED_CONFIG
    refund_id: str


MODELS: Final = MappedInferenceModels(
    inputs={"answer": AnswerIn, "pick": PickIn, "grade": GradeIn},
    outputs={"answer": AnswerOut, "pick": PickOut, "grade": GradeOut},
)


@dataclass(slots=True)
class ScriptedModel:
    turns: Sequence[Sequence[Chunk]]
    seen: list[tuple[list[ModelMessage], AgentInfo]] = field(default_factory=list[tuple[list[ModelMessage], AgentInfo]])

    async def stream(self, messages: list[ModelMessage], info: AgentInfo) -> AsyncIterator[Chunk]:
        index = len(self.seen)
        self.seen.append((list(messages), info))
        for chunk in self.turns[index]:
            yield chunk

    def model(self) -> FunctionModel:
        return FunctionModel(stream_function=self.stream, model_name="scripted")


def tool_call(name: str, arguments: str, call_id: str, index: int = 0) -> dict[int, DeltaToolCall]:
    return {index: DeltaToolCall(name=name, json_args=arguments, tool_call_id=call_id)}


def more_args(arguments: str, index: int = 0) -> dict[int, DeltaToolCall]:
    return {index: DeltaToolCall(json_args=arguments)}


def thinking(text: str, index: int = 0) -> dict[int, DeltaThinkingPart]:
    return {index: DeltaThinkingPart(content=text)}


@dataclass(frozen=True, slots=True)
class SinkEntry:
    action: str
    attempt: int
    part: OutputPart | None = None
    delta: str = ""
    cause: AttemptCauseKind | None = None


@dataclass(slots=True)
class RecordingSink:
    entries: list[SinkEntry] = field(default_factory=list[SinkEntry])

    async def append(self, attempt: int, part: OutputPart, delta: str) -> None:
        self.entries.append(SinkEntry("append", attempt, part, delta))

    async def discard(self, attempt: int, cause: AttemptCauseKind) -> None:
        self.entries.append(SinkEntry("discard", attempt, cause=cause))

    async def flush(self) -> None:
        self.entries.append(SinkEntry("flush", 0))

    def appended(self) -> list[SinkEntry]:
        return [entry for entry in self.entries if entry.action == "append"]

    def text(self, kind: str, attempt: int | None = None) -> str:
        return "".join(
            entry.delta
            for entry in self.appended()
            if entry.part is not None and entry.part.kind == kind and (attempt is None or entry.attempt == attempt)
        )

    def discards(self) -> list[tuple[int, AttemptCauseKind | None]]:
        return [(entry.attempt, entry.cause) for entry in self.entries if entry.action == "discard"]


@dataclass(slots=True)
class CountingEvents:
    seq: int = 0
    emitted: list[RunEvent] = field(default_factory=list[RunEvent])

    async def emit(self, build: EventBuilder) -> RunEvent:
        self.seq += 1
        event = build(EventStamp(RunId("run-1"), self.seq, AT))
        self.emitted.append(event)
        return event


@dataclass(slots=True)
class FakeScope:
    project: CompiledProject
    flow: CompiledFlow
    run_input: JsonObject
    output: RecordingSink = field(default_factory=RecordingSink)
    events: CountingEvents = field(default_factory=CountingEvents)
    refs: Mapping[str, JsonValue] = field(default_factory=dict[str, JsonValue])
    run_id: RunId = RunId("run-1")
    mode: RunMode = "live"
    ir_hash: IrHash = IR_HASH
    address: ExecutionAddress = field(default_factory=lambda: node_address(NODE))
    frame: ScopeFrame = field(default_factory=ScopeFrame)

    def resolve(self, ref: str) -> JsonValue:
        prefix = "$input."
        if ref.startswith(prefix):
            return self.run_input.get(ref.removeprefix(prefix))
        return self.refs.get(ref)

    def bind(self, bindings: Sequence[CompiledBinding]) -> JsonObject:
        return {binding.name: self._bound(binding) for binding in bindings}

    def output_of(self, node_id: NodeId) -> JsonValue:
        return None

    async def run_child(self, node_id: NodeId, entry: ChildEntry) -> NodeOutcome:
        return NodeSkipped(reason="no child nodes")

    async def run_flow(self, flow_id: FlowId, flow_input: JsonObject) -> NodeOutcome:
        return NodeSkipped(reason="no calls")

    def _bound(self, binding: CompiledBinding) -> JsonValue:
        if isinstance(binding, LiteralBinding):
            return binding.value
        return self.resolve(binding.ref)


@dataclass(slots=True)
class FixedModels:
    model_value: Model

    async def model(self, scope: ExecutionScope, agent: CompiledAgent, media: frozenset[Modality]) -> Model:
        return self.model_value


@dataclass(frozen=True, slots=True)
class FakeToolContext:
    run_id: RunId
    address: ExecutionAddress
    idempotency_key: str | None

    @property
    def http(self) -> httpx2.AsyncClient:
        raise NotImplementedError

    @property
    def blobs(self) -> BlobStore:
        raise NotImplementedError

    def secret(self, name: str) -> str:
        return f"secret-{name}"


@dataclass(slots=True)
class RecordingToolContexts:
    created: list[tuple[ToolId, str]] = field(default_factory=list[tuple[ToolId, str]])

    @asynccontextmanager
    async def open(
        self, scope: ExecutionScope, tool: CompiledTool, tool_call_id: str, arguments: Mapping[str, JsonValue]
    ) -> AsyncGenerator[ToolContext]:
        self.created.append((tool.tool_id, tool_call_id))
        yield FakeToolContext(scope.run_id, scope.address, tool_call_id)


@dataclass(slots=True)
class ScriptedApprovals:
    approve: bool = True
    expire: bool = False
    requests: list[ApprovalRequest] = field(default_factory=list[ApprovalRequest])

    async def decide(self, scope: ExecutionScope, request: ApprovalRequest) -> Mapping[str, ToolApprovalDecision]:
        self.requests.append(request)
        if self.expire:
            raise LlmNodeError(LlmFailureCode.HUMAN_TIMED_OUT, EXPIRED_APPROVAL)
        decision = ToolApprovalDecision(approve=self.approve, message=None if self.approve else "operator refused")
        return {call.tool_call_id: decision for call in request.calls}


@dataclass(slots=True)
class RecordingSteps:
    segments: list[SegmentState] = field(default_factory=list[SegmentState])
    calls: list[PendingToolCall] = field(default_factory=list[PendingToolCall])

    async def segment(self, scope: ExecutionScope, state: SegmentState, work: SegmentWork) -> SegmentResult:
        self.segments.append(state)
        return await work()

    async def tool_call(self, scope: ExecutionScope, call: PendingToolCall, work: ToolCallWork) -> ToolCallResult:
        self.calls.append(call)
        return await work()


@dataclass(slots=True)
class SettledCosts:
    seen: list[RequestCost] = field(default_factory=list[RequestCost])

    def record(self, cost: RequestCost) -> None:
        self.seen.append(cost)
        ContextUsageSink().record(cost)

    def total(self) -> Decimal:
        return sum((entry.cost or Decimal(0) for entry in self.seen), Decimal(0))

    def priced(self, scripted: ScriptedModel) -> Model:
        model = FunctionModel(stream_function=scripted.stream, model_name=PRICED_NAME)
        policy = CallPolicy(cassettes=cassette_policy(None), usage_sink=self)
        return guard_model(model, model_ref=MODEL, policy=policy)


@dataclass(slots=True)
class MappedCode:
    targets: Mapping[str, object]

    def load(self, ref: str) -> object:
        return self.targets[ref]


@dataclass(slots=True)
class MemorySecrets:
    values: Mapping[str, str]

    async def secret(self, ref: SecretRef) -> SecretStr:
        return SecretStr(self.values[ref])


def capabilities(strict: bool = True) -> ModelCapabilities:
    text = (Modality.TEXT,)
    return ModelCapabilities(family=ModelFamily.OPENAI, input=text, output=text, strict=strict)


def agent(agent_id: str = "writer", **update: object) -> CompiledAgent:
    model = AgentModel(model=MODEL, provider=ProviderName("openrouter"), capabilities=capabilities())
    base = CompiledAgent(agent_id=AgentId(agent_id), description="agent", models=(model,))
    return base.model_copy(update=update)


def field_ir(name: str, type_ref: str) -> FieldIr:
    return FieldIr(name=name, type=type_ref, description=f"field {name}")


def answer_inference(**update: object) -> CompiledInference:
    base = CompiledInference(
        inference_id=InferenceId("answer"),
        description="reply",
        input_fields=(field_ir("question", "Text"), field_ir("product", "Product?")),
        output_fields=(field_ir("reply", "Text"), field_ir("confidence", "Float")),
        input_schema=SCHEMA,
        output_schema=SCHEMA,
        prompt=TemplatePrompt(level=2, template="Q: {{ question }}\n{{ output_format }}"),
    )
    return base.model_copy(update=update)


def pick_node(mode: OutputMode = "tool") -> CompiledLlmNode:
    return CompiledLlmNode(
        node_id=NODE,
        description="node",
        agent=AgentId("writer"),
        inference=InferenceId("pick"),
        output_mode=mode,
        inputs=(
            RefBinding(name="question", ref="$input.question"),
            RefBinding(name="policies", ref="$input.policies"),
        ),
        input_schema=SCHEMA,
        output_schema=SCHEMA,
    )


def answer_node(mode: OutputMode = "tool") -> CompiledLlmNode:
    return CompiledLlmNode(
        node_id=NODE,
        description="node",
        agent=AgentId("writer"),
        inference=InferenceId("answer"),
        output_mode=mode,
        inputs=(
            RefBinding(name="question", ref="$input.question"),
            RefBinding(name="product", ref="$input.product"),
        ),
        input_schema=SCHEMA,
        output_schema=SCHEMA,
    )


def project(
    node: CompiledLlmNode,
    agents: Sequence[CompiledAgent],
    inferences: Sequence[CompiledInference],
    tools: Sequence[CompiledTool] = (),
    mcp_servers: Sequence[CompiledMcpServer] = (),
) -> tuple[CompiledProject, CompiledFlow]:
    flow = CompiledFlow(
        flow_id=FLOW,
        description="flow",
        input_type="CaseRequest",
        output_type="CaseOutcome",
        input_schema=SCHEMA,
        output_schema=SCHEMA,
        returns=(RefBinding(name="result", ref="$answer.out"),),
        order=(node.node_id,),
        nodes={node.node_id: node},
    )
    compiled = CompiledProject(
        package="shop",
        description="project",
        agents={item.agent_id: item for item in agents},
        inferences={item.inference_id: item for item in inferences},
        tools={item.tool_id: item for item in tools},
        mcp_servers={item.server_id: item for item in mcp_servers},
        flows={flow.flow_id: flow},
    )
    return compiled, flow


@dataclass(slots=True)
class LlmBed:
    scripted: ScriptedModel
    scope: FakeScope
    executor: LlmNodeExecutor
    contexts: RecordingToolContexts
    approvals: ScriptedApprovals
    steps: RecordingSteps


def llm_bed(
    turns: Sequence[Sequence[Chunk]],
    node: CompiledLlmNode,
    agents: Sequence[CompiledAgent],
    inferences: Sequence[CompiledInference],
    run_input: JsonObject,
    *,
    tools: Sequence[CompiledTool] = (),
    code: Mapping[str, object] | None = None,
    approve: bool = True,
    expire: bool = False,
    max_enum: int = 50,
    delta_batch_ms: int = 80,
    models: Callable[[ScriptedModel], Model] | None = None,
) -> LlmBed:
    scripted = ScriptedModel(turns)
    compiled, flow = project(node, agents, inferences, tools)
    scope = FakeScope(compiled, flow, run_input)
    contexts = RecordingToolContexts()
    approvals = ScriptedApprovals(approve, expire)
    steps = RecordingSteps()
    dependencies = LlmDependencies(
        models=FixedModels(models(scripted) if models is not None else scripted.model()),
        inference_models=MODELS,
        tool_contexts=contexts,
        approvals=approvals,
        code=MappedCode(dict(code or {})),
        secrets=MemorySecrets({}),
        steps=steps,
        max_enum=max_enum,
        delta_batch_ms=delta_batch_ms,
    )
    return LlmBed(scripted, scope, llm_node_executor(dependencies), contexts, approvals, steps)


def no_bad_words(value: BaseModel, context: object, params: NoParams) -> Verdict:
    reply = value.model_dump().get("reply", "")
    passed = "bad" not in str(reply)
    return Verdict(passed=passed, reason=None if passed else "reply contains the forbidden word bad")


def level_three_prompt(question: str, product: Product | None) -> RenderedPrompt:
    kind = product.kind if product is not None else "none"
    return RenderedPrompt(messages=(system("You are a support operator"), user(f"{question} [{kind}]")))


type OrderLookup = Callable[..., Awaitable[OrderInfo]]
type RefundCall = Callable[..., Awaitable[RefundOut]]


def order_lookup(calls: list[str]) -> OrderLookup:
    async def lookup_order(ctx: ToolContext, order_id: OrderId) -> OrderInfo:
        calls.append(order_id)
        return OrderInfo(order_id=order_id, status="shipped")

    return lookup_order


def refund_issuer(calls: list[str]) -> RefundCall:
    async def issue_refund(ctx: ToolContext, order_id: OrderId) -> RefundOut:
        calls.append(f"{order_id}:{ctx.idempotency_key}")
        return RefundOut(refund_id=f"rf-{order_id}")

    return issue_refund


def request_texts(messages: Sequence[ModelMessage]) -> list[str]:
    return [
        part.content
        for message in messages
        if isinstance(message, ModelRequest)
        for part in message.parts
        if isinstance(part, UserPromptPart) and isinstance(part.content, str)
    ]


def retry_texts(messages: Sequence[ModelMessage]) -> list[str]:
    return [
        part.model_response()
        for message in messages
        if isinstance(message, ModelRequest)
        for part in message.parts
        if isinstance(part, RetryPromptPart)
    ]


def tool_returns(messages: Sequence[ModelMessage]) -> list[object]:
    return [
        part.content
        for message in messages
        if isinstance(message, ModelRequest)
        for part in message.parts
        if isinstance(part, ToolReturnPart)
    ]
