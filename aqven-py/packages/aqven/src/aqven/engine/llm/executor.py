import asyncio
import os
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from functools import partial
from typing import Final, assert_never

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
from pydantic_ai.messages import ModelMessage, ModelMessagesTypeAdapter, ToolCallPart
from pydantic_ai.run import AgentRunResult
from pydantic_ai.usage import RunUsage

from aqven.engine.llm.adapters import EnvironmentSecrets, ImportCodeLoader, InlineSteps, UrlMediaLoader
from aqven.engine.llm.agents import InferenceAgents, InferenceCall, PreparedRun, response_cost, response_count
from aqven.engine.llm.allowed import DEFAULT_MAX_ENUM
from aqven.engine.llm.dynamic import TypeAnnotations
from aqven.engine.llm.errors import FAILURE_BY_EXCEPTION, LlmFailureCode, LlmNodeError, abandon_cause, failure_code
from aqven.engine.llm.failures import FailureAnalysis, FailureContext
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
    PendingToolCall,
    SegmentCompleted,
    SegmentDeferred,
    SegmentFailed,
    SegmentOutcome,
    SegmentResult,
    SegmentState,
    ToolCallResult,
    ToolCallRetried,
    ToolCallReturned,
    add_usage,
)
from aqven.engine.llm.streaming import DeltaBatcher, StreamObserver
from aqven.engine.llm.telemetry import report_attempt_failure, report_node_failure
from aqven.engine.llm.tools import ExternalTools, McpServers
from aqven.ir import CompiledLlmNode
from aqven.models.declared import declared_model_ref
from aqven.ports.execution import (
    EventStamp,
    ExecutionScope,
    NodeFailed,
    NodeOutcome,
    NodeSucceeded,
    NodeUsage,
    OutputSink,
)
from aqven.runtime.address import ExecutionAddress
from aqven.runtime.events import NodeAttemptFailed, RunEvent
from aqven.runtime.executions import RunError
from aqven.runtime.human import ToolApprovalDecision

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


@dataclass(frozen=True, slots=True)
class LlmSegmentRunner:
    agents: InferenceAgents
    failures: Mapping[type[BaseException], LlmFailureCode]
    delta_batch_ms: int | None
    media_store: MediaStore | None = None

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
        usage = RunUsage()
        try:
            return await self._run(node, scope, state, usage)
        except Exception as error:
            code = failure_code(error, self.failures)
            if code is None:
                raise
            failed = SegmentFailed(code=code, message=str(error))
            return SegmentResult(outcome=failed, usage=_node_usage(usage, ()))

    async def _run(
        self, node: CompiledLlmNode, scope: ExecutionScope, state: SegmentState, usage: RunUsage
    ) -> SegmentResult:
        call = InferenceCall(node.agent, node.inference, node.output_mode, node.limits)
        prepared = await self.agents.prepare(scope, call, scope.bind(node.inputs), state.attempt_offset)
        analysis = FailureAnalysis(_failure_context(scope, node, prepared), prepared.deps.guard_failures)
        sink = _output_sink(scope.output, self.delta_batch_ms)
        observer = StreamObserver(sink, prepared.plan.text_kind, prepared.plan.output_tools)
        resumed = state.messages_json is not None
        history = _history(state, prepared)
        base = len(history or ())
        with capture_run_messages() as captured:
            try:
                async with asyncio.timeout(prepared.seconds):
                    result = await prepared.agent.run(
                        None if resumed else prepared.prompt,
                        message_history=history,
                        deferred_tool_results=_deferred_results(state) if resumed else None,
                        deps=prepared.deps,
                        usage=usage,
                        usage_limits=prepared.limits,
                        model_settings=prepared.settings,
                        event_stream_handler=observer,
                    )
            except Exception as error:
                code = failure_code(error, self.failures)
                analysis.collect(captured, base, state.attempt_offset)
                analysis.collect_final(captured, base, state.attempt_offset, error)
                await observer.abandon(analysis.last_kind or abandon_cause(code))
                await sink.flush()
                if code is None:
                    raise
                return _failed_segment(scope.address, analysis, error, code, usage)
        await sink.flush()
        analysis.collect(result.all_messages(), base, state.attempt_offset)
        messages = result.new_messages()
        attempts = response_count(messages)
        output = await self.output_of(scope, prepared, result.output)
        outcome = _outcome(output, result, prepared, state.attempt_offset + attempts)
        failures = _attempt_failures(scope.address, analysis, exhausted=False)
        return SegmentResult(outcome=outcome, usage=_node_usage(usage, messages), attempts=attempts, failures=failures)


@dataclass(frozen=True, slots=True)
class LlmNodeExecutor:
    segments: LlmSegmentRunner
    steps: SegmentSteps
    approvals: ApprovalGate
    external: ExternalTools

    async def execute(self, node: CompiledLlmNode, scope: ExecutionScope) -> NodeOutcome:
        try:
            return await self._execute(node, scope)
        except LlmNodeError as error:
            return NodeFailed(error=RunError(code=error.code, message=error.message, address=scope.address))

    async def _execute(self, node: CompiledLlmNode, scope: ExecutionScope) -> NodeOutcome:
        state = SegmentState()
        usage = NodeUsage()
        while True:
            result = await self.steps.segment(scope, state, partial(self.segments.run, node, scope, state))
            usage = add_usage(usage, result.usage)
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
                    return NodeFailed(error=error, usage=usage)
                case SegmentDeferred():
                    state = await self._resume(node, scope, state, result, outcome)
                case _:
                    assert_never(outcome)

    async def _resume(
        self,
        node: CompiledLlmNode,
        scope: ExecutionScope,
        state: SegmentState,
        result: SegmentResult,
        outcome: SegmentDeferred,
    ) -> SegmentState:
        attempt_offset = state.attempt_offset + result.attempts
        decisions = await self._decisions(node, scope, outcome.approvals, max(attempt_offset, 1))
        results = {call.tool_call_id: await self._call(scope, call) for call in outcome.calls}
        return SegmentState(
            segment=state.segment + 1,
            attempt_offset=attempt_offset,
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
    segments = LlmSegmentRunner(agents, dependencies.failures, dependencies.delta_batch_ms, dependencies.media_store)
    external = ExternalTools(dependencies.code, dependencies.tool_contexts)
    return LlmNodeExecutor(segments, dependencies.steps, dependencies.approvals, external)


def _failure_context(scope: ExecutionScope, node: CompiledLlmNode, prepared: PreparedRun) -> FailureContext:
    agent = scope.project.agent(node.agent)
    inference = scope.project.inference(node.inference)
    return FailureContext(
        agent_id=agent.agent_id,
        model=agent.primary.model,
        mode=prepared.plan.mode,
        output_tools=prepared.plan.output_tools,
        schema=prepared.deps.shaped.model.model_json_schema(),
        inference_id=inference.inference_id,
        agent_file=agent.file,
        inference_file=inference.file,
    )


def _attempt_failures(
    address: ExecutionAddress, analysis: FailureAnalysis, *, exhausted: bool
) -> tuple[AttemptFailure, ...]:
    failures = tuple(
        AttemptFailure(attempt=attempt, cause=cause, action=action)
        for attempt, cause, action in analysis.attempt_failures(exhausted)
    )
    for failure in failures:
        cause = failure.cause
        report_attempt_failure(address, cause.code or cause.kind, cause.message, cause.hint, cause.details)
    return failures


def _failed_segment(
    address: ExecutionAddress, analysis: FailureAnalysis, error: Exception, code: LlmFailureCode, usage: RunUsage
) -> SegmentResult:
    failures = _attempt_failures(address, analysis, exhausted=True)
    final = analysis.final_error(error, code, str(error))
    if final.hint is not None:
        report_node_failure(address, final.code, final.message, final.hint, final.details)
    failed = SegmentFailed(code=final.code, message=final.message, hint=final.hint, details=final.details)
    return SegmentResult(outcome=failed, usage=_node_usage(usage, ()), failures=failures)


async def _emit_failures(scope: ExecutionScope, failures: Sequence[AttemptFailure]) -> None:
    for failure in failures:
        await scope.events.emit(partial(_attempt_failed_event, scope.address, failure))


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


def _node_usage(usage: RunUsage, messages: Sequence[ModelMessage]) -> NodeUsage:
    return NodeUsage(
        cost_usd=response_cost(messages),
        tokens_in=usage.input_tokens,
        tokens_out=usage.output_tokens,
        requests=usage.requests,
        tool_calls=usage.tool_calls,
    )
