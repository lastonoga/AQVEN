from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Annotated, Final, Literal, assert_never

from dbos import DBOS, DBOSClient, SetWorkflowID, WorkflowHandleAsync
from pydantic import BaseModel, ConfigDict, Field, JsonValue
from pydantic_ai import Agent, DeferredToolRequests
from pydantic_ai.messages import (
    ModelMessage,
    ModelMessagesTypeAdapter,
    ModelRequest,
    ModelResponse,
    RetryPromptPart,
    TextPart,
    ToolCallPart,
    ToolReturnPart,
)
from pydantic_ai.models.function import AgentInfo, FunctionModel

from aqven.engine.human import (
    DefaultOnExpiry,
    EscalateOnExpiry,
    ExpiryPlan,
    FailOnExpiry,
    HumanNodeExecutor,
    HumanWaiter,
    HumanWaits,
    ScriptedAnswerBook,
    SqliteWaitIndex,
    StaticScriptedAnswers,
    ToolApprovalAnswer,
    WaitRequest,
    child_workflow_id,
    node_outcome,
    static_forms,
)
from aqven.engine.human.approval import (
    PendingToolCall,
    ToolApprovalFailed,
    ToolApprovalGate,
    deferred_tool_results,
    pending_approvals,
)
from aqven.engine.human.dbos_adapters import DbosWaitJournal
from aqven.engine.request import RunSpec
from aqven.ir import CompiledBinding, CompiledFlow, CompiledHumanNode, CompiledProject, IrHash, LiteralBinding
from aqven.ports.execution import ChildEntry, EventBuilder, EventStamp, NodeOutcome, OutputSink, ScopeFrame
from aqven.runtime import ExecutionAddress, JsonObject, RunEvent, RunId, ScriptedAnswer, node_address
from aqven.runtime.vocabulary import RunMode
from aqven.spec import FailOnTimeout, FlowId, NodeId, ToolApprovalSpec, ToolId, TypeId
from aqven.testing.human import HumanResponder

REFUND_FORM: Final = TypeId("RefundDecision")
FLOW_ID: Final = FlowId("refunds")
APPROVAL_NODE: Final = "refund_agent"
IR_HASH: Final = IrHash("sha256-" + "0" * 64)
CHILD_POLL_SECONDS: Final = 0.02


class RefundDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    verdict: Literal["approve", "reject"]
    comment: Annotated[str, Field(max_length=40)] = ""


FORMS: Final = static_forms({REFUND_FORM: RefundDecision})
PROJECT: Final = CompiledProject(package="shop", description="human wait test project")


@dataclass(frozen=True, slots=True)
class HumanTestbed:
    index: SqliteWaitIndex
    client: DBOSClient
    waits: HumanWaits
    responder: HumanResponder


class NotInHarness(NotImplementedError):
    def __init__(self, member: str) -> None:
        super().__init__(f"{member} is not needed by human wait tests")


@dataclass
class HarnessState:
    index: SqliteWaitIndex | None = None
    events: defaultdict[str, list[RunEvent]] = field(default_factory=lambda: defaultdict[str, list[RunEvent]](list))
    refunds: list[str] = field(default_factory=list[str])

    def journal(self) -> DbosWaitJournal:
        if self.index is None:
            raise NotInHarness("wait index")
        return DbosWaitJournal(self.index)


HARNESS: Final = HarnessState()


@dataclass(frozen=True, slots=True)
class MemoryEventSink:
    run_id: RunId

    async def emit(self, build: EventBuilder) -> RunEvent:
        store = HARNESS.events[self.run_id]
        event = build(EventStamp(run_id=self.run_id, seq=len(store) + 1, at=datetime.now(UTC)))
        store.append(event)
        return event


@dataclass(frozen=True, slots=True)
class HarnessScope:
    run_id: RunId
    address: ExecutionAddress
    events: MemoryEventSink
    mode: RunMode = "live"
    ir_hash: IrHash = IR_HASH
    project: CompiledProject = PROJECT
    frame: ScopeFrame = field(default_factory=ScopeFrame)
    run_spec: RunSpec = field(default_factory=lambda: RunSpec(flow_id=FLOW_ID))
    attempt: int = 1

    @property
    def root_run_id(self) -> RunId:
        return self.run_id

    @property
    def flow(self) -> CompiledFlow:
        raise NotInHarness("flow")

    @property
    def output(self) -> OutputSink:
        raise NotInHarness("output")

    def resolve(self, ref: str) -> JsonValue:
        raise NotInHarness("resolve")

    def bind(self, bindings: Sequence[CompiledBinding]) -> JsonObject:
        return {binding.name: binding.value for binding in bindings if isinstance(binding, LiteralBinding)}

    def output_of(self, node_id: NodeId) -> JsonValue:
        raise NotInHarness("output_of")

    async def run_child(self, node_id: NodeId, entry: ChildEntry) -> NodeOutcome:
        raise NotInHarness("run_child")

    async def run_flow(self, flow_id: FlowId, flow_input: JsonObject) -> NodeOutcome:
        raise NotInHarness("run_flow")


def harness_scope(run_id: RunId, address: ExecutionAddress, answers: tuple[ScriptedAnswer, ...] = ()) -> HarnessScope:
    spec = RunSpec(flow_id=FLOW_ID, human_answers=answers)
    return HarnessScope(run_id=run_id, address=address, events=MemoryEventSink(run_id), run_spec=spec)


def current_workflow() -> str:
    workflow_id = DBOS.workflow_id
    if workflow_id is None:
        raise NotInHarness("workflow outside DBOS")
    return workflow_id


def refund_node(timeout_seconds: int = 60) -> CompiledHumanNode:
    return CompiledHumanNode(
        node_id=NodeId("approve_refund"),
        description="refund decision",
        output_schema={},
        inputs=(LiteralBinding(name="ticket", value="T-1"),),
        input_schema={},
        form=REFUND_FORM,
        assignee="support",
        timeout_seconds=timeout_seconds,
        on_timeout=FailOnTimeout(policy="fail"),
    )


def answers_of(answers: list[JsonObject]) -> tuple[ScriptedAnswer, ...]:
    return tuple(ScriptedAnswer.model_validate(answer) for answer in answers)


@DBOS.workflow(name="aqven_tests.human.node")
async def human_node_workflow(node: JsonObject, answers: list[JsonObject]) -> JsonObject:
    compiled = CompiledHumanNode.model_validate(node)
    run_id = RunId(current_workflow())
    executor = HumanNodeExecutor(HARNESS.journal(), FORMS)
    scope = harness_scope(run_id, node_address(compiled.node_id), answers_of(answers))
    outcome = await executor.execute(compiled, scope)
    return outcome.model_dump(mode="json")


class FailPlan(BaseModel):
    policy: Literal["fail"] = "fail"


class DefaultPlan(BaseModel):
    policy: Literal["default"] = "default"
    value: JsonValue


class EscalatePlan(BaseModel):
    policy: Literal["escalate"] = "escalate"
    assignee: str
    timeout_seconds: float


type PlanSpec = Annotated[FailPlan | DefaultPlan | EscalatePlan, Field(discriminator="policy")]


def plan_of(plan: PlanSpec) -> ExpiryPlan:
    match plan:
        case FailPlan():
            return FailOnExpiry()
        case DefaultPlan():
            return DefaultOnExpiry(plan.value)
        case EscalatePlan():
            return EscalateOnExpiry(plan.assignee, plan.timeout_seconds)
        case _:
            assert_never(plan)


class WaitSpec(BaseModel):
    node_id: str = "review"
    branch_key: str | None = None
    run_id: str | None = None
    assignee: str = "support"
    timeout_seconds: float = 60.0
    plan: PlanSpec = Field(default_factory=FailPlan)
    delay_seconds: float = 0.0
    answers: tuple[ScriptedAnswer, ...] = ()

    def address(self) -> ExecutionAddress:
        return node_address(self.node_id, branch_key=self.branch_key)


@DBOS.workflow(name="aqven_tests.human.wait")
async def wait_workflow(spec_json: JsonObject) -> JsonObject:
    spec = WaitSpec.model_validate(spec_json)
    run_id = RunId(spec.run_id or current_workflow())
    await DBOS.sleep_async(spec.delay_seconds)
    request = WaitRequest(
        run_id=run_id,
        address=spec.address(),
        wait_kind="form",
        form=FORMS.form(REFUND_FORM),
        form_type_id=REFUND_FORM,
        form_schema=RefundDecision.model_json_schema(),
        suspend_data={"ticket": "T-2"},
        assignee=spec.assignee,
        timeout_seconds=spec.timeout_seconds,
        expiry=plan_of(spec.plan),
    )
    waiter = HumanWaiter(HARNESS.journal(), MemoryEventSink(run_id), ScriptedAnswerBook(spec.answers))
    outcome = await waiter.wait(request)
    return node_outcome(request.address, outcome).model_dump(mode="json")


@DBOS.workflow(name="aqven_tests.human.parallel")
async def parallel_waits_workflow(branches: list[JsonObject]) -> JsonObject:
    parent = current_workflow()
    handles: list[WorkflowHandleAsync[JsonObject]] = []
    for branch in branches:
        spec = WaitSpec.model_validate({**branch, "run_id": parent})
        with SetWorkflowID(child_workflow_id(parent, spec.address())):
            handles.append(await DBOS.start_workflow_async(wait_workflow, spec.model_dump(mode="json")))
    results: list[JsonValue] = [await handle.get_result(polling_interval_sec=CHILD_POLL_SECONDS) for handle in handles]
    return {"results": results}


def refund_model(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
    last = messages[-1]
    replies = [
        f"final: {part.content}"
        for part in (last.parts if isinstance(last, ModelRequest) else ())
        if isinstance(part, ToolReturnPart | RetryPromptPart)
    ]
    if replies:
        return ModelResponse(parts=[TextPart(replies[-1])])
    call = ToolCallPart("refund", {"ticket": "T-10", "amount": 42}, tool_call_id="call-refund-1")
    return ModelResponse(parts=[call])


refund_agent: Agent[None, str | DeferredToolRequests] = Agent(
    FunctionModel(refund_model),
    output_type=[str, DeferredToolRequests],
    name="aqven_tests_refund",
)


@refund_agent.tool_plain(requires_approval=True)
def refund(ticket: str, amount: int) -> str:
    HARNESS.refunds.append(ticket)
    return f"refunded {amount} for {ticket}"


class FirstSegment(BaseModel):
    calls: tuple[PendingToolCall, ...]
    messages: str


class DeferredOutputMissing(AssertionError):
    def __init__(self) -> None:
        super().__init__("the model should have requested tool approval")


def deferred_or_fail(output: str | DeferredToolRequests) -> DeferredToolRequests:
    if isinstance(output, DeferredToolRequests):
        return output
    raise DeferredOutputMissing()


@DBOS.step(name="aqven_tests.human.approval_first")
async def first_segment(prompt: str) -> JsonObject:
    result = await refund_agent.run(prompt)
    requests = deferred_or_fail(result.output)
    messages = ModelMessagesTypeAdapter.dump_json(result.all_messages()).decode()
    return FirstSegment(calls=pending_approvals(requests), messages=messages).model_dump(mode="json")


@DBOS.step(name="aqven_tests.human.approval_resume")
async def resume_segment(segment: JsonObject, answer: JsonObject) -> str:
    first = FirstSegment.model_validate(segment)
    results = deferred_tool_results(ToolApprovalAnswer.model_validate(answer), first.calls)
    history = ModelMessagesTypeAdapter.validate_json(first.messages)
    result = await refund_agent.run(message_history=history, deferred_tool_results=results)
    return str(result.output)


APPROVAL_SPEC: Final = ToolApprovalSpec(
    tools=[ToolId("refund")],
    assignee="finance",
    timeout_seconds=60,
    on_timeout=FailOnTimeout(policy="fail"),
)


@DBOS.workflow(name="aqven_tests.human.tool_approval")
async def tool_approval_workflow(prompt: str, answers: list[JsonObject]) -> JsonObject:
    run_id = RunId(current_workflow())
    segment = await first_segment(prompt)
    calls = FirstSegment.model_validate(segment).calls
    gate = ToolApprovalGate(HARNESS.journal(), StaticScriptedAnswers({run_id: ScriptedAnswerBook(answers_of(answers))}))
    outcome = await gate.decide(harness_scope(run_id, node_address(APPROVAL_NODE)), APPROVAL_SPEC, calls)
    if isinstance(outcome, ToolApprovalFailed):
        return {"error": outcome.error.code}
    final = await resume_segment(segment, outcome.answer.model_dump(mode="json"))
    return {"output": final, "attempt": outcome.attempt}
