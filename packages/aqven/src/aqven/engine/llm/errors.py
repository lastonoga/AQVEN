from collections.abc import Mapping
from enum import StrEnum
from typing import Final

from pydantic_ai import (
    IncompleteToolCall,
    ModelAPIError,
    ModelHTTPError,
    UnexpectedModelBehavior,
    UsageLimitExceeded,
)
from pydantic_ai.exceptions import ContentFilterError

from aqven.runtime.vocabulary import AttemptCauseKind


class LlmFailureCode(StrEnum):
    PROVIDER_KEY_MISSING = "provider_key_missing"
    INPUT_INVALID = "input_invalid"
    PROMPT_INVALID = "prompt_invalid"
    ALLOWED_SET_INVALID = "allowed_set_invalid"
    MEDIA_UNAVAILABLE = "media_unavailable"
    CODE_INVALID = "code_invalid"
    CHECK_FAILED = "check_failed"
    OUTPUT_INVALID = "output_invalid"
    BUDGET_EXCEEDED = "budget_exceeded"
    PROVIDER_ERROR = "provider_error"
    REFUSAL = "refusal"
    TRUNCATED = "truncated"
    TIMEOUT = "timeout"
    APPROVAL_MISSING = "approval_missing"
    TOOL_UNKNOWN = "tool_unknown"
    CASSETTE_MISS = "cassette_miss"
    AMBIGUOUS_REPLAY = "AMBIGUOUS_REPLAY"
    HUMAN_TIMED_OUT = "HUMAN_TIMED_OUT"
    HUMAN_DEFAULT_INVALID = "HUMAN_DEFAULT_INVALID"


class LlmNodeError(Exception):
    def __init__(self, code: LlmFailureCode, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


FAILURE_BY_EXCEPTION: Final[Mapping[type[BaseException], LlmFailureCode]] = {
    UsageLimitExceeded: LlmFailureCode.BUDGET_EXCEEDED,
    ContentFilterError: LlmFailureCode.REFUSAL,
    IncompleteToolCall: LlmFailureCode.TRUNCATED,
    UnexpectedModelBehavior: LlmFailureCode.OUTPUT_INVALID,
    ModelHTTPError: LlmFailureCode.PROVIDER_ERROR,
    ModelAPIError: LlmFailureCode.PROVIDER_ERROR,
    TimeoutError: LlmFailureCode.TIMEOUT,
}


def failure_code_of(code: str) -> LlmFailureCode:
    return LlmFailureCode(code) if code in LlmFailureCode else LlmFailureCode.PROVIDER_ERROR


ABANDON_CAUSES: Final[Mapping[LlmFailureCode, AttemptCauseKind]] = {
    LlmFailureCode.OUTPUT_INVALID: "schema_invalid",
    LlmFailureCode.CHECK_FAILED: "schema_invalid",
    LlmFailureCode.BUDGET_EXCEEDED: "budget_exceeded",
    LlmFailureCode.REFUSAL: "refusal",
    LlmFailureCode.TRUNCATED: "truncated",
    LlmFailureCode.CASSETTE_MISS: "cassette_miss",
}
UNKNOWN_ABANDON_CAUSE: Final[AttemptCauseKind] = "provider_error"


def abandon_cause(code: LlmFailureCode | None) -> AttemptCauseKind:
    if code is None:
        return UNKNOWN_ABANDON_CAUSE
    return ABANDON_CAUSES.get(code, UNKNOWN_ABANDON_CAUSE)


def failure_code(
    error: BaseException, table: Mapping[type[BaseException], LlmFailureCode] = FAILURE_BY_EXCEPTION
) -> LlmFailureCode | None:
    if isinstance(error, LlmNodeError):
        return error.code
    return next((table[kind] for kind in type(error).__mro__ if kind in table), None)
