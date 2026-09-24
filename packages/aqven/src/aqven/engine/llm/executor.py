import os
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from functools import partial
from typing import Final, Literal, assert_never

from pydantic import BaseModel
from pydantic_ai import (
    BinaryImage,
    DeferredToolRequests,
    DeferredToolResults,
    ModelRetry,
    ToolApproved,
    ToolDenied,
    capture_run_messages,
)
from pydantic_ai.messages import ModelMessage, ModelMessagesTypeAdapter, ModelResponse, ToolCallPart, UserContent
from pydantic_ai.run import AgentRunResult
from pydantic_ai.usage import RunUsage

from aqven.engine.failures import failure_of
from aqven.engine.llm.adapters import EnvironmentSecrets, ImportCodeLoader, InlineSteps, UrlMediaLoader
from aqven.engine.llm.agents import InferenceAgents, InferenceCall, PreparedRun, response_count
from aqven.engine.llm.allowed import DEFAULT_MAX_ENUM
from aqven.engine.llm.dynamic import TypeAnnotations
from aqven.engine.llm.errors import FAILURE_BY_EXCEPTION, LlmFailureCode, LlmNodeError, abandon_cause, failure_code
from aqven.engine.llm.failures import FailureAnalysis, FailureContext
from aqven.engine.llm.outcomes import (
    OUTCOME_CAUSES,
    Abandonment,
    GiveUp,
    abandonment,
    answered_slot,
    given_up_error,
    outcome_failure,
    outcome_message,
    outcome_step,
    reissued_history,
    reissued_state,
)
from aqven.engine.llm.ports import (
    ApprovalGate,
    ApprovalRequest,
    CodeLoader,
    InferenceModels,
    MediaLoader,
    MediaStore,
    ModelSource,
    SecretSource,
    SegmentSteps,
    ToolContexts,
)
from aqven.engine.llm.segments import (
    AttemptFailure,
    ModelSlot,
    PendingToolCall,
    SegmentAbandoned,
    SegmentCompleted,
    SegmentDeferred,
    SegmentFailed,
    SegmentOutcome,
    SegmentResult,
    SegmentStart,
    SegmentState,
    ToolCallResult,
    ToolCallRetried,
    ToolCallReturned,
    add_usage,
)
from aqven.engine.llm.streaming import DeltaBatcher, StreamObserver
from aqven.engine.llm.telemetry import report_attempt_failure, report_node_failure
from aqven.engine.llm.tools import ExternalTools, McpServers
from aqven.engine.llm.watch import DEFAULT_STREAM_IDLE_SECONDS, CallWatch
from aqven.ir import CompiledLlmNode
from aqven.models.callsite import FIRST_ISSUE, reissued_call_site
from aqven.models.declared import declared_model_ref
from aqven.models.usage import UsageLog, node_usage_log
from aqven.ports.execution import (
    EventStamp,
    ExecutionScope,
    NodeFailed,
    NodeOutcome,
    NodeSucceeded,
    NodeUsage,
    OutputSink,
)
from aqven.runtime.address import ExecutionAddress, JsonObject
from aqven.runtime.events import (
    InferenceChecksCaptured,
    InferenceInputCaptured,
    InferencePromptCaptured,
    NodeAttemptFailed,
    RunEvent,
)
from aqven.runtime.executions import CheckOutcome, PromptTrace, RunError
from aqven.runtime.human import ToolApprovalDecision
from aqven.runtime.values import InlineValue
from aqven.spec import AgentId, InferenceId

DENIED_WITHOUT_APPROVAL: Final = "agent does not declare approval: tool call denied"


@dataclass(frozen=True, slots=True)
class LlmDependencies:
    models: ModelSource
    inference_models: InferenceModels
    tool_contexts: ToolContexts
    approvals: ApprovalGate
    code: CodeLoader = field(default_factory=ImportCodeLoader)
    secrets: SecretSource = field(default_factory=lambda: EnvironmentSecrets(os.environ))
    media: MediaLoader = field(default_factory=UrlMediaLoader)
    steps: SegmentSteps = field(default_factory=InlineSteps)
    failures: Mapping[type[BaseException], LlmFailureCode] = field(default_factory=lambda: FAILURE_BY_EXCEPTION)
    max_enum: int = DEFAULT_MAX_ENUM
    delta_batch_ms: int | None = None
    mcp_servers: McpServers | None = None
    media_store: MediaStore | None = None
    types: TypeAnnotations | None = None
    stream_idle_seconds: float | None = DEFAULT_STREAM_IDLE_SECONDS


@dataclass(frozen=True, slots=True)
class LlmSegmentRunner:
    agents: InferenceAgents
    failures: Mapping[type[BaseException], LlmFailureCode]
    delta_batch_ms: int | None
    media_store: MediaStore | None = None
    stream_idle_seconds: float | None = DEFAULT_STREAM_IDLE_SECONDS

    async def output_of(self, scope: ExecutionScope, prepared: PreparedRun, output: object) -> object:
        field_name = prepared.plan.image_field
        if field_name is None or not isinstance(output, BinaryImage):
            return output
        if self.media_store is None:
            raise LlmNodeError(LlmFailureCode.MEDIA_UNAVAILABLE, "cannot store the model image: no media store")
        name = f"{field_name}.{output.format}"
        stored = await self.media_store.put(scope, output.data, output.media_type, name)
        document = {field_name: stored.model_dump(mode="json", by_alias=True)}
        return prepared.deps.shaped.model.model_validate(document)

    async def run(self, node: CompiledLlmNode, scope: ExecutionScope, state: SegmentState) -> SegmentResult:
        with node_usage_log() as log:
            return await self._guarded(node, scope, state, log)

    async def _guarded(
        self, node: CompiledLlmNode, scope: ExecutionScope, state: SegmentState, log: UsageLog
    ) -> SegmentResult:
        usage = RunUsage()
        try:
            return await self._run(node, scope, state, usage, log)
        except Exception as error:
            code = failure_code(error, self.failures)
            if code is None:
                raise
            failed = SegmentFailed(code=code, message=str(error))
            return SegmentResult(outcome=failed, usage=_node_usage(usage, log))

    async def _run(
        self, node: CompiledLlmNode, scope: ExecutionScope, state: SegmentState, usage: RunUsage, log: UsageLog
    ) -> SegmentResult:
        call = InferenceCall(node.agent, node.inference, node.output_mode, node.limits)
        bound = scope.bind(node.inputs)
        await scope.events.emit(
            partial(_captured_input_event, scope.address, node.agent, node.inference, "bound", bound, {})
        )
        prepared = await self.agents.prepare(scope, call, bound, state.attempt_offset, state.slot)
        await scope.events.emit(
            partial(
                _captured_input_event,
                scope.address,
                node.agent,
                node.inference,
                "normalized",
                prepared.deps.document,
                prepared.variants,
            )
        )
        if state.start == "prompt":
            await scope.events.emit(partial(_captured_prompt_event, scope.address, prepared.prompt_trace))
        sink = _output_sink(scope.output, self.delta_batch_ms)
        live = LiveCall(
            scope=scope,
            state=state,
            prepared=prepared,
            analysis=FailureAnalysis(_failure_context(scope, node, prepared, state.slot), prepared.deps.guard_failures),
            observer=StreamObserver(sink, prepared.plan.text_kind, prepared.plan.output_tools),
            sink=sink,
            history=_history(state, prepared),
            usage=usage,
            log=log,
            watch=CallWatch(prepared.seconds, self.stream_idle_seconds),
        )
        entry = RUN_ENTRIES[state.start](state, prepared)
        with capture_run_messages() as captured, reissued_call_site(_reissue_mark(state)):
            try:
                async with live.watch.guard():
                    result = await prepared.agent.run(
                        entry.prompt,
                        message_history=live.history,
                        deferred_tool_results=entry.deferred,
                        deps=prepared.deps,
                        usage=usage,
                        usage_limits=prepared.limits,
                        model_settings=prepared.settings,
                        event_stream_handler=live.watch.watched(live.observer),
                    )
            except Exception as caught:
                return await self._interrupted(live, captured, live.watch.explain(caught, live.analysis.context))
        await sink.flush()
        await _emit_checks(scope, prepared.deps.checks)
        live.analysis.collect(result.all_messages(), live.base, state.attempt_offset)
        messages = result.new_messages()
        attempts = response_count(messages)
        output = await self.output_of(scope, prepared, result.output)
        outcome = _outcome(output, result, prepared, state.attempt_offset + attempts)
        failures = _attempt_failures(scope.address, live.analysis, exhausted=False)
        return SegmentResult(outcome=outcome, usage=live.node_usage, attempts=attempts, failures=failures)

    async def _interrupted(self, live: LiveCall, captured: list[ModelMessage], error: Exception) -> SegmentResult:
        found = abandonment(error, captured[live.base :])
        if found is None:
            return await self._failed(live, captured, error)
        return await self._abandoned(live, captured, found)

    async def _failed(self, live: LiveCall, captured: list[ModelMessage], error: Exception) -> SegmentResult:
        offset = live.state.attempt_offset
        code = failure_code(error, self.failures)
        live.analysis.collect(captured, live.base, offset)
        live.analysis.collect_final(captured, live.base, offset, error)
        await live.observer.abandon(live.analysis.last_kind or abandon_cause(code))
        await live.sink.flush()
        await _emit_checks(live.scope, live.prepared.deps.checks)
        if code is None:
            raise error
        failed = FailedCall(error, code, _last_model(captured[live.base :]), live.node_usage)
        return _failed_segment(live.scope.address, live.analysis, failed)

    async def _abandoned(self, live: LiveCall, captured: list[ModelMessage], found: Abandonment) -> SegmentResult:
        offset = live.state.attempt_offset
        live.analysis.collect(captured, live.base, offset)
        await live.observer.abandon(OUTCOME_CAUSES[found.outcome])
        await live.sink.flush()
        await _emit_checks(live.scope, live.prepared.deps.checks)
        attempts = response_count(captured[live.base :])
        attempt = offset + attempts
        model = declared_model_ref(found.response) or live.analysis.context.model
        abandoned = SegmentAbandoned(
            outcome=found.outcome,
            message=outcome_message(found, model),
            messages_json=ModelMessagesTypeAdapter.dump_json(reissued_history(captured)).decode(),
            attempt=attempt,
            slot=answered_slot(live.state.slot, found.response, len(live.analysis.failures)),
            model=model,
            details=live.analysis.response_details(found.response, attempt, model),
        )
        failures = _attempt_failures(live.scope.address, live.analysis, exhausted=False)
        return SegmentResult(outcome=abandoned, usage=live.node_usage, attempts=attempts, failures=failures)


@dataclass(frozen=True, slots=True)
class LiveCall:
    scope: ExecutionScope
    state: SegmentState
    prepared: PreparedRun
    analysis: FailureAnalysis
    observer: StreamObserver
    sink: OutputSink
    history: list[ModelMessage] | None
    usage: RunUsage
    log: UsageLog
    watch: CallWatch

    @property
    def base(self) -> int:
        return len(self.history or ())

    @property
    def node_usage(self) -> NodeUsage:
        return _node_usage(self.usage, self.log)


@dataclass(frozen=True, slots=True)
class RunEntry:
    prompt: str | Sequence[UserContent] | None
    deferred: DeferredToolResults | None = None


def _prompt_entry(state: SegmentState, prepared: PreparedRun) -> RunEntry:
    return RunEntry(prepared.prompt)


def _deferred_entry(state: SegmentState, prepared: PreparedRun) -> RunEntry:
    return RunEntry(None, _deferred_results(state))


def _reissue_entry(state: SegmentState, prepared: PreparedRun) -> RunEntry:
    return RunEntry(None)


RUN_ENTRIES: Final[Mapping[SegmentStart, Callable[[SegmentState, PreparedRun], RunEntry]]] = {
    "prompt": _prompt_entry,
    "deferred": _deferred_entry,
    "reissue": _reissue_entry,
}


def _reissue_mark(state: SegmentState) -> int:
    return state.attempt_offset if state.start == "reissue" else FIRST_ISSUE


@dataclass(slots=True)
class SpentUsage:
    usage: NodeUsage = field(default_factory=NodeUsage)

    def add(self, more: NodeUsage) -> NodeUsage:
        self.usage = add_usage(self.usage, more)
        return self.usage


@dataclass(frozen=True, slots=True)
class LlmNodeExecutor:
    segments: LlmSegmentRunner
    steps: SegmentSteps
    approvals: ApprovalGate
    external: ExternalTools

    async def execute(self, node: CompiledLlmNode, scope: ExecutionScope) -> NodeOutcome:
        spent = SpentUsage()
        try:
            return await self._execute(node, scope, spent)
        except LlmNodeError as error:
            failed = RunError(code=error.code, message=error.message, address=scope.address)
            return NodeFailed(error=failed, usage=spent.usage)
        except Exception as error:
            return NodeFailed(error=failure_of(error, scope.address).error, usage=spent.usage)

    async def _execute(self, node: CompiledLlmNode, scope: ExecutionScope, spent: SpentUsage) -> NodeOutcome:
        state = SegmentState()
        while True:
            result = await self.steps.segment(scope, state, partial(self.segments.run, node, scope, state))
            usage = spent.add(result.usage)
            await _emit_failures(scope, result.failures)
            outcome: SegmentOutcome = result.outcome
            match outcome:
                case SegmentCompleted():
                    return NodeSucceeded(
                        output=outcome.output, usage=usage, model=outcome.model, checks_failed=outcome.checks_failed
                    )
                case SegmentFailed():
                    error = RunError(
                        code=outcome.code,
                        message=outcome.message,
                        address=scope.address,
                        hint=outcome.hint,
                        details=outcome.details,
                    )
                    return NodeFailed(error=error, usage=usage, model=outcome.model)
                case SegmentDeferred():
                    state = await self._resume(node, scope, state, result, outcome)
                case SegmentAbandoned():
                    step = await self._abandoned(node, scope, state, result, outcome)
                    if isinstance(step, RunError):
                        return NodeFailed(error=step, usage=usage, model=outcome.model)
                    state = step
                case _:
                    assert_never(outcome)

    async def _abandoned(
        self,
        node: CompiledLlmNode,
        scope: ExecutionScope,
        state: SegmentState,
        result: SegmentResult,
        outcome: SegmentAbandoned,
    ) -> SegmentState | RunError:
        step = outcome_step(scope.project.agent(node.agent), outcome)
        failure = outcome_failure(outcome, step)
        _report_attempt(scope.address, failure)
        await _emit_failures(scope, (failure,))
        if isinstance(step, GiveUp):
            error = given_up_error(scope.address, outcome, step)
            report_node_failure(scope.address, error.code, error.message, error.hint, error.details)
            return error
        return reissued_state(state, result, outcome, step)

    async def _resume(
        self,
        node: CompiledLlmNode,
        scope: ExecutionScope,
        state: SegmentState,
        result: SegmentResult,
        outcome: SegmentDeferred,
    ) -> SegmentState:
        attempt_offset = state.attempt_offset + result.attempts
        approval_round = state.approval_round + (1 if outcome.approvals else 0)
        decisions = await self._decisions(node, scope, outcome.approvals, approval_round)
        results = {call.tool_call_id: await self._call(scope, call) for call in outcome.calls}
        return SegmentState(
            segment=state.segment + 1,
            attempt_offset=attempt_offset,
            approval_round=approval_round,
            start="deferred",
            slot=state.slot,
            messages_json=outcome.messages_json,
            approvals=dict(decisions),
            call_results=results,
        )

    async def _decisions(
        self, node: CompiledLlmNode, scope: ExecutionScope, calls: Sequence[PendingToolCall], attempt: int
    ) -> Mapping[str, ToolApprovalDecision]:
        if not calls:
            return {}
        spec = scope.project.agent(node.agent).approval
        if spec is None:
            denied = ToolApprovalDecision(approve=False, message=DENIED_WITHOUT_APPROVAL)
            return {call.tool_call_id: denied for call in calls}
        request = ApprovalRequest(address=scope.address, attempt=attempt, spec=spec, calls=tuple(calls))
        return await self.approvals.decide(scope, request)

    async def _call(self, scope: ExecutionScope, call: PendingToolCall) -> ToolCallResult:
        return await self.steps.tool_call(scope, call, partial(self.external.invoke, scope, call))


def llm_node_executor(dependencies: LlmDependencies) -> LlmNodeExecutor:
    agents = InferenceAgents(
        models=dependencies.models,
        inference_models=dependencies.inference_models,
        code=dependencies.code,
        secrets=dependencies.secrets,
        media=dependencies.media,
        tool_contexts=dependencies.tool_contexts,
        max_enum=dependencies.max_enum,
        mcp_servers=dependencies.mcp_servers,
        types=dependencies.types,
    )
    segments = LlmSegmentRunner(
        agents,
        dependencies.failures,
        dependencies.delta_batch_ms,
        dependencies.media_store,
        dependencies.stream_idle_seconds,
    )
    external = ExternalTools(dependencies.code, dependencies.tool_contexts)
    return LlmNodeExecutor(segments, dependencies.steps, dependencies.approvals, external)


def _failure_context(
    scope: ExecutionScope, node: CompiledLlmNode, prepared: PreparedRun, slot: ModelSlot
) -> FailureContext:
    agent = scope.project.agent(node.agent)
    inference = scope.project.inference(node.inference)
    return FailureContext(
        agent_id=agent.agent_id,
        model=agent.models[slot.index].model,
        mode=prepared.plan.mode,
        output_tools=prepared.plan.output_tools,
        schema=prepared.deps.shaped.model.model_json_schema(),
        inference_id=inference.inference_id,
        agent_file=agent.file,
        inference_file=inference.file,
        node_id=scope.address.node_id,
        models=tuple(choice.model for choice in agent.models),
    )


def _attempt_failures(
    address: ExecutionAddress, analysis: FailureAnalysis, *, exhausted: bool
) -> tuple[AttemptFailure, ...]:
    failures = tuple(
        AttemptFailure(attempt=attempt, cause=cause, action=action)
        for attempt, cause, action in analysis.attempt_failures(exhausted)
    )
    for failure in failures:
        _report_attempt(address, failure)
    return failures


def _report_attempt(address: ExecutionAddress, failure: AttemptFailure) -> None:
    cause = failure.cause
    report_attempt_failure(address, cause.code or cause.kind, cause.message, cause.hint, cause.details)


@dataclass(frozen=True, slots=True)
class FailedCall:
    error: Exception
    code: LlmFailureCode
    model: str | None
    usage: NodeUsage


def _failed_segment(address: ExecutionAddress, analysis: FailureAnalysis, call: FailedCall) -> SegmentResult:
    failures = _attempt_failures(address, analysis, exhausted=True)
    final = analysis.final_error(call.error, call.code, str(call.error))
    if final.hint is not None:
        report_node_failure(address, final.code, final.message, final.hint, final.details)
    failed = SegmentFailed(
        code=final.code, message=final.message, hint=final.hint, details=final.details, model=call.model
    )
    return SegmentResult(outcome=failed, usage=call.usage, failures=failures)


def _last_model(messages: Sequence[ModelMessage]) -> str | None:
    response = next((item for item in reversed(messages) if isinstance(item, ModelResponse)), None)
    if response is None:
        return None
    return declared_model_ref(response) or response.model_name


async def _emit_failures(scope: ExecutionScope, failures: Sequence[AttemptFailure]) -> None:
    for failure in failures:
        await scope.events.emit(partial(_attempt_failed_event, scope.address, failure))


async def _emit_checks(scope: ExecutionScope, checks: Sequence[CheckOutcome]) -> None:
    if checks:
        await scope.events.emit(partial(_captured_checks_event, scope.address, tuple(checks)))


def _captured_input_event(
    address: ExecutionAddress,
    agent: AgentId,
    inference: InferenceId,
    stage: Literal["bound", "normalized"],
    document: JsonObject,
    variants: Mapping[str, str],
    stamp: EventStamp,
) -> RunEvent:
    return InferenceInputCaptured(
        seq=stamp.seq,
        at=stamp.at,
        run_id=stamp.run_id,
        address=address,
        stage=stage,
        agent=agent,
        inference=inference,
        input_ref=InlineValue(value=document),
        variants=dict(variants),
    )


def _captured_prompt_event(address: ExecutionAddress, prompt: PromptTrace, stamp: EventStamp) -> RunEvent:
    return InferencePromptCaptured(seq=stamp.seq, at=stamp.at, run_id=stamp.run_id, address=address, prompt=prompt)


def _captured_checks_event(address: ExecutionAddress, checks: tuple[CheckOutcome, ...], stamp: EventStamp) -> RunEvent:
    return InferenceChecksCaptured(seq=stamp.seq, at=stamp.at, run_id=stamp.run_id, address=address, checks=checks)


def _attempt_failed_event(address: ExecutionAddress, failure: AttemptFailure, stamp: EventStamp) -> RunEvent:
    return NodeAttemptFailed(
        seq=stamp.seq,
        at=stamp.at,
        run_id=stamp.run_id,
        address=address,
        attempt=failure.attempt,
        cause=failure.cause,
        action=failure.action,
    )


def _output_sink(inner: OutputSink, delta_batch_ms: int | None) -> OutputSink:
    if delta_batch_ms is None:
        return inner
    return DeltaBatcher(inner, delta_batch_ms)


def _history(state: SegmentState, prepared: PreparedRun) -> list[ModelMessage] | None:
    if state.messages_json is None:
        return prepared.history
    return ModelMessagesTypeAdapter.validate_json(state.messages_json)


def _approval(decision: ToolApprovalDecision) -> ToolApproved | ToolDenied:
    if decision.approve:
        return ToolApproved()
    return ToolDenied(decision.message) if decision.message else ToolDenied()


def _call_result(result: ToolCallResult) -> object:
    match result:
        case ToolCallReturned():
            return result.value
        case ToolCallRetried():
            return ModelRetry(result.message)
        case _:
            assert_never(result)


def _deferred_results(state: SegmentState) -> DeferredToolResults:
    return DeferredToolResults(
        approvals={call_id: _approval(decision) for call_id, decision in state.approvals.items()},
        calls={call_id: _call_result(result) for call_id, result in state.call_results.items()},
    )


def _pending(parts: Sequence[ToolCallPart]) -> tuple[PendingToolCall, ...]:
    return tuple(
        PendingToolCall(tool_call_id=part.tool_call_id, tool_name=part.tool_name, args=part.args_as_dict())
        for part in parts
    )


def _outcome(
    output: object, result: AgentRunResult[object], prepared: PreparedRun, final_attempt: int
) -> SegmentOutcome:
    if isinstance(output, DeferredToolRequests):
        messages_json = ModelMessagesTypeAdapter.dump_json(result.all_messages()).decode()
        return SegmentDeferred(
            approvals=_pending(output.approvals), calls=_pending(output.calls), messages_json=messages_json
        )
    if isinstance(output, BaseModel):
        return SegmentCompleted(
            output=prepared.dynamic.wrap(output.model_dump(mode="json", by_alias=True)),
            model=declared_model_ref(result.response) or result.response.model_name,
            checks=tuple(prepared.deps.checks),
            variants=prepared.variants,
            final_attempt=final_attempt,
        )
    return SegmentFailed(
        code=LlmFailureCode.OUTPUT_INVALID, message=f"model output is not the output model: {type(output)}"
    )


def _node_usage(usage: RunUsage, log: UsageLog) -> NodeUsage:
    return NodeUsage(
        cost_usd=log.total_cost(),
        tokens_in=usage.input_tokens,
        tokens_out=usage.output_tokens,
        requests=usage.requests,
        tool_calls=usage.tool_calls,
        cost_source=log.cost_source(),
        unpriced_calls=log.unpriced_calls(),
    )
