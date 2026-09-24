from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Final, Literal

from pydantic_ai.messages import FinishReason, ModelMessage, ModelRequest, ModelResponse

from aqven.engine.llm.errors import LlmFailureCode
from aqven.engine.llm.segments import AttemptFailure, ModelSlot, SegmentAbandoned, SegmentResult, SegmentState
from aqven.ir import CompiledAgent, CompiledAgentOutput
from aqven.models import ErroredOutput, RefusedOutput, TruncatedOutput, declared_position
from aqven.runtime.address import ExecutionAddress
from aqven.runtime.executions import AttemptCause, RunError
from aqven.runtime.vocabulary import AbandonedOutcome, AttemptAction, AttemptCauseKind
from aqven.spec import OutcomePolicy

GIVE_UP_ACTION: Final[AttemptAction] = "none"

OUTCOME_BY_EXCEPTION: Final[Mapping[type[BaseException], AbandonedOutcome]] = {
    ErroredOutput: "error",
    RefusedOutput: "refusal",
    TruncatedOutput: "truncated",
}
OUTCOME_FINISHES: Final[Mapping[AbandonedOutcome, FinishReason]] = {
    "error": "error",
    "refusal": "content_filter",
    "truncated": "length",
}
OUTCOME_CAUSES: Final[Mapping[AbandonedOutcome, AttemptCauseKind]] = {
    "error": "provider_error",
    "refusal": "refusal",
    "truncated": "truncated",
}
OUTCOME_CODES: Final[Mapping[AbandonedOutcome, LlmFailureCode]] = {
    "error": LlmFailureCode.PROVIDER_ERROR,
    "refusal": LlmFailureCode.REFUSAL,
    "truncated": LlmFailureCode.TRUNCATED,
}
OUTCOME_FIELDS: Final[Mapping[AbandonedOutcome, str]] = {
    "error": "on_error",
    "refusal": "on_refusal",
    "truncated": "on_truncated",
}
OUTCOME_PHRASES: Final[Mapping[AbandonedOutcome, str]] = {
    "error": "ended its response with an error",
    "refusal": "refused to answer",
    "truncated": "was cut off at the output token limit",
}
OUTCOME_REMEDIES: Final[Mapping[AbandonedOutcome, str]] = {
    "error": "",
    "refusal": "",
    "truncated": "raise settings.max_tokens or ",
}


@dataclass(frozen=True, slots=True)
class Abandonment:
    outcome: AbandonedOutcome
    response: ModelResponse
    error: BaseException


def abandonment(error: BaseException, messages: Sequence[ModelMessage]) -> Abandonment | None:
    outcomes: list[AbandonedOutcome] = [
        OUTCOME_BY_EXCEPTION[kind] for kind in type(error).__mro__ if kind in OUTCOME_BY_EXCEPTION
    ]
    outcome = outcomes[0] if outcomes else None
    last = messages[-1] if messages else None
    if outcome is None or not isinstance(last, ModelResponse) or last.finish_reason != OUTCOME_FINISHES[outcome]:
        return None
    return Abandonment(outcome, last, error)


def outcome_message(found: Abandonment, model: str) -> str:
    return f"model {model} {OUTCOME_PHRASES[found.outcome]} ({found.error})"


def reissued_history(messages: Sequence[ModelMessage]) -> list[ModelMessage]:
    last = max((index for index, message in enumerate(messages) if isinstance(message, ModelRequest)), default=-1)
    return list(messages[: last + 1])


def answered_slot(slot: ModelSlot, response: ModelResponse, repairs: int) -> ModelSlot:
    position = declared_position(response)
    if position is None or position == slot.index:
        return ModelSlot(index=slot.index, retries_spent=slot.retries_spent + repairs)
    return ModelSlot(index=position, retries_spent=repairs)


def outcome_policy(output: CompiledAgentOutput, outcome: AbandonedOutcome) -> OutcomePolicy:
    policies: Mapping[AbandonedOutcome, OutcomePolicy] = {
        "error": output.on_error,
        "refusal": output.on_refusal,
        "truncated": output.on_truncated,
    }
    return policies[outcome]


@dataclass(frozen=True, slots=True)
class OutcomeCase:
    agent: CompiledAgent
    abandoned: SegmentAbandoned

    @property
    def setting(self) -> str:
        return f"output.{OUTCOME_FIELDS[self.abandoned.outcome]}"

    @property
    def location(self) -> str:
        return self.agent.file or f"agent {self.agent.agent_id}"

    @property
    def remedy(self) -> str:
        return OUTCOME_REMEDIES[self.abandoned.outcome]

    @property
    def alternative(self) -> OutcomePolicy:
        return OutcomePolicy.FALLBACK if self.agent.fallbacks else OutcomePolicy.RETRY


@dataclass(frozen=True, slots=True)
class Reissue:
    action: Literal["retry", "fallback"]
    slot: ModelSlot


@dataclass(frozen=True, slots=True)
class GiveUp:
    reason: str
    hint: str


type OutcomeStep = Reissue | GiveUp
type OutcomeStrategy = Callable[[OutcomeCase], OutcomeStep]


def fail_outcome(case: OutcomeCase) -> OutcomeStep:
    return GiveUp(
        reason=f"{case.setting} is {OutcomePolicy.FAIL.value}",
        hint=f"{case.remedy}set {case.setting}: {case.alternative.value} in {case.location}",
    )


def retry_outcome(case: OutcomeCase) -> OutcomeStep:
    slot = case.abandoned.slot
    retries = case.agent.output.retries
    if slot.retries_spent >= retries:
        return GiveUp(
            reason=f"the model used up output.retries ({retries})",
            hint=f"{case.remedy}raise output.retries or set {case.setting}: fallback in {case.location}",
        )
    return Reissue("retry", ModelSlot(index=slot.index, retries_spent=slot.retries_spent + 1))


def fallback_outcome(case: OutcomeCase) -> OutcomeStep:
    following = case.abandoned.slot.index + 1
    if following >= len(case.agent.models):
        return GiveUp(
            reason="no fallback model is left",
            hint=f"{case.remedy}add a model to fallback_models or set {case.setting}: retry in {case.location}",
        )
    return Reissue("fallback", ModelSlot(index=following))


OUTCOME_STRATEGIES: Final[Mapping[OutcomePolicy, OutcomeStrategy]] = {
    OutcomePolicy.FAIL: fail_outcome,
    OutcomePolicy.RETRY: retry_outcome,
    OutcomePolicy.FALLBACK: fallback_outcome,
}


def outcome_step(agent: CompiledAgent, abandoned: SegmentAbandoned) -> OutcomeStep:
    strategy = OUTCOME_STRATEGIES[outcome_policy(agent.output, abandoned.outcome)]
    return strategy(OutcomeCase(agent, abandoned))


def outcome_hint(step: OutcomeStep) -> str | None:
    return step.hint if isinstance(step, GiveUp) else None


def outcome_action(step: OutcomeStep) -> AttemptAction:
    return step.action if isinstance(step, Reissue) else GIVE_UP_ACTION


def outcome_failure(abandoned: SegmentAbandoned, step: OutcomeStep) -> AttemptFailure:
    cause = AttemptCause(
        kind=OUTCOME_CAUSES[abandoned.outcome],
        message=abandoned.message,
        schema_errors=(),
        code=OUTCOME_CODES[abandoned.outcome].value,
        hint=outcome_hint(step),
        details=abandoned.details,
    )
    return AttemptFailure(attempt=abandoned.attempt, cause=cause, action=outcome_action(step))


def given_up_error(address: ExecutionAddress, abandoned: SegmentAbandoned, step: GiveUp) -> RunError:
    return RunError(
        code=OUTCOME_CODES[abandoned.outcome].value,
        message=f"{abandoned.message}; {step.reason}",
        address=address,
        hint=step.hint,
        details=abandoned.details,
    )


def reissued_state(
    state: SegmentState, result: SegmentResult, abandoned: SegmentAbandoned, step: Reissue
) -> SegmentState:
    return SegmentState(
        segment=state.segment + 1,
        attempt_offset=state.attempt_offset + result.attempts,
        approval_round=state.approval_round,
        start="reissue",
        slot=step.slot,
        messages_json=abandoned.messages_json,
    )
