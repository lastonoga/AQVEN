import json
from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Final

from pydantic import JsonValue, ValidationError
from pydantic_ai import ModelHTTPError, ModelRetry, UnexpectedModelBehavior
from pydantic_ai.exceptions import ToolRetryError, UserError
from pydantic_ai.messages import ModelMessage, ModelRequest, ModelResponse, RetryPromptPart, TextPart, ToolCallPart
from pydantic_core import ErrorDetails

from aqven.engine.llm.errors import LlmFailureCode
from aqven.engine.llm.instructions import Schema
from aqven.ir.nodes import OutputMode
from aqven.models.redaction import PATTERN_ORDER, PatternRedactor
from aqven.runtime.address import Problem
from aqven.runtime.executions import AttemptCause, ModelErrorDetails
from aqven.runtime.vocabulary import AttemptAction, AttemptCauseKind

MODEL_NO_STRUCTURED_OUTPUT: Final = "MODEL_NO_STRUCTURED_OUTPUT"
MODEL_INVALID_JSON: Final = "MODEL_INVALID_JSON"
MODEL_SCHEMA_MISMATCH: Final = "MODEL_SCHEMA_MISMATCH"
MODEL_FEATURE_UNSUPPORTED: Final = "MODEL_FEATURE_UNSUPPORTED"
MODEL_RETRIES_EXHAUSTED: Final = "MODEL_RETRIES_EXHAUSTED"
CHECK_FAILED: Final = LlmFailureCode.CHECK_FAILED.value

EXCERPT_LIMIT: Final = 300
EXCERPT_ELLIPSIS: Final = "…"
MISSING_OUTPUT_PREFIX: Final = "Please "
JSON_INVALID_TYPE: Final = "json_invalid"
MISSING_TYPE: Final = "missing"
CLIENT_ERROR_STATUSES: Final = range(400, 500)
CAUSE_CHAIN_LIMIT: Final = 8
REF_PREFIX: Final = "#/$defs/"
PATH_SEPARATOR: Final = "."
REPAIR_ACTION: Final[AttemptAction] = "repair"
FINAL_ACTION: Final[AttemptAction] = "none"
REDACTOR: Final = PatternRedactor(PATTERN_ORDER)

FEATURE_MARKERS: Final = (
    "tool_choice",
    "tools",
    "tool use",
    "function calling",
    "function_call",
    "response_format",
    "json_schema",
    "json schema",
    "structured output",
)
CLIENT_UNSUPPORTED_SUFFIX: Final = "output is not supported by this model"
UNSUPPORTED_MARKERS: Final = ("not support", "unsupported", "does not support", "no endpoints found", "not available")


@dataclass(frozen=True, slots=True)
class FailureContext:
    agent_id: str
    model: str
    mode: OutputMode
    output_tools: frozenset[str]
    schema: Schema
    inference_id: str
    agent_file: str | None = None
    inference_file: str | None = None

    @property
    def agent_location(self) -> str:
        return self.agent_file or f"agent {self.agent_id}"

    @property
    def inference_location(self) -> str:
        return self.inference_file or f"inference {self.inference_id}"

    def models_check(self) -> str:
        return f"aqven models check {self.agent_id}"


@dataclass(frozen=True, slots=True)
class Classified:
    kind: AttemptCauseKind
    code: str
    message: str
    hint: str
    violations: tuple[Problem, ...] = ()


@dataclass(frozen=True, slots=True)
class GuardFailure:
    code: str
    message: str
    hint_action: str
    violations: tuple[Problem, ...] = ()


@dataclass(frozen=True, slots=True)
class Exchange:
    attempt: int
    response: ModelResponse
    retry: RetryPromptPart


type Guards = Mapping[int, GuardFailure]
type RetryRule = Callable[[Exchange, FailureContext, Guards], Classified | None]


@dataclass(frozen=True, slots=True)
class LimitText:
    key: str
    phrase: str
    action: str


LIMIT_TEXTS: Final[Mapping[str, LimitText]] = {
    "string_too_long": LimitText("maxLength", "is longer than {limit} characters", "raise maxLength"),
    "string_too_short": LimitText("minLength", "is shorter than {limit} characters", "lower minLength"),
    "too_long": LimitText("maxItems", "has more than {limit} items", "raise maxItems"),
    "too_short": LimitText("minItems", "has fewer than {limit} items", "lower minItems"),
    "less_than_equal": LimitText("maximum", "is greater than {limit}", "raise maximum"),
    "less_than": LimitText("exclusiveMaximum", "is not less than {limit}", "raise exclusiveMaximum"),
    "greater_than_equal": LimitText("minimum", "is less than {limit}", "lower minimum"),
    "greater_than": LimitText("exclusiveMinimum", "is not greater than {limit}", "lower exclusiveMinimum"),
    "literal_error": LimitText("enum", "is not one of the allowed values {limit}", "extend the allowed values"),
    "enum": LimitText("enum", "is not one of the allowed values {limit}", "extend the allowed values"),
    "string_pattern_mismatch": LimitText("pattern", "does not match the pattern {limit}", "relax pattern"),
    MISSING_TYPE: LimitText("required", "is missing", "make the field optional"),
}

NO_OUTPUT_MESSAGES: Final[Mapping[OutputMode, str]] = {
    "tool": "model {model} answered with text instead of calling the output tool",
    "native": "model {model} returned no JSON answer",
    "prompted": "model {model} returned no JSON answer",
}
NO_OUTPUT_HINTS: Final[Mapping[OutputMode, str]] = {
    "tool": "set output.mode: prompted in {agent}",
    "native": "raise settings.max_tokens in {agent} or run {check} to choose a mode that works",
    "prompted": "raise settings.max_tokens in {agent} or run {check} to choose a mode that works",
}
INVALID_JSON_HINTS: Final[Mapping[OutputMode, str]] = {
    "tool": "set output.mode: native or prompted in {agent}; {check} shows which modes work",
    "native": "set output.mode: tool or prompted in {agent}; {check} shows which modes work",
    "prompted": "the model writes text around the JSON: set output.mode: tool or native in {agent} "
    "if {check} shows that they work",
}
FEATURE_HINTS: Final[Mapping[OutputMode, str]] = {
    "tool": "set output.mode: prompted in {agent}",
    "native": "set output.mode: tool or prompted in {agent}; {check} shows which modes work",
    "prompted": "the provider rejected the request: run {check} or choose another model in {agent}",
}


def excerpt(text: str) -> str:
    redacted = REDACTOR.redact(text)
    if len(redacted) <= EXCERPT_LIMIT:
        return redacted
    return redacted[: EXCERPT_LIMIT - len(EXCERPT_ELLIPSIS)] + EXCERPT_ELLIPSIS


def response_text(response: ModelResponse, output_tools: frozenset[str]) -> str:
    calls = [
        part.args_as_json_str()
        for part in response.parts
        if isinstance(part, ToolCallPart) and part.tool_name in output_tools
    ]
    texts = [part.content for part in response.parts if isinstance(part, TextPart)]
    return "\n".join((*calls, *texts))


def exchanges(messages: Sequence[ModelMessage], base: int, offset: int, tools: frozenset[str]) -> Iterator[Exchange]:
    attempt = offset
    fresh = messages[base:]
    for index, message in enumerate(fresh):
        if not isinstance(message, ModelResponse):
            continue
        attempt += 1
        following = fresh[index + 1] if index + 1 < len(fresh) else None
        retry = _output_retry(following, tools)
        if retry is not None:
            yield Exchange(attempt, message, retry)


def retry_kind(messages: Sequence[ModelMessage], tools: frozenset[str]) -> AttemptCauseKind | None:
    last = messages[-1] if messages else None
    retry = _output_retry(last, tools)
    return None if retry is None else retry_part_kind(retry)


def retry_part_kind(retry: RetryPromptPart) -> AttemptCauseKind:
    if _missing_output_part(retry):
        return "no_structured_output"
    if _error_types(retry) & {JSON_INVALID_TYPE}:
        return "invalid_json"
    return "schema_invalid"


def retry_from_error(error: BaseException) -> RetryPromptPart | None:
    current: BaseException | None = error
    for _ in range(CAUSE_CHAIN_LIMIT):
        if current is None:
            return None
        part = _retry_of(current)
        if part is not None:
            return part
        current = current.__cause__
    return None


@dataclass(slots=True)
class FailureAnalysis:
    context: FailureContext
    guards: Guards = field(default_factory=dict[int, GuardFailure])
    failures: list[tuple[Exchange, Classified]] = field(default_factory=list[tuple[Exchange, Classified]])

    def collect(self, messages: Sequence[ModelMessage], base: int, offset: int) -> None:
        for exchange in exchanges(messages, base, offset, self.context.output_tools):
            self.failures.append((exchange, classify(exchange, self.context, self.guards)))

    def collect_final(self, messages: Sequence[ModelMessage], base: int, offset: int, error: BaseException) -> None:
        retry = retry_from_error(error)
        responses = [message for message in messages[base:] if isinstance(message, ModelResponse)]
        attempt = offset + len(responses)
        recorded = {exchange.attempt for exchange, _ in self.failures}
        if retry is None or not responses or attempt in recorded:
            return
        exchange = Exchange(attempt, responses[-1], retry)
        self.failures.append((exchange, classify(exchange, self.context, self.guards)))

    def attempt_failures(self, exhausted: bool) -> tuple[tuple[int, AttemptCause, AttemptAction], ...]:
        last_index = len(self.failures) - 1
        return tuple(
            (exchange.attempt, self.cause(exchange, classified), _action(index == last_index and exhausted))
            for index, (exchange, classified) in enumerate(self.failures)
        )

    def cause(self, exchange: Exchange, classified: Classified) -> AttemptCause:
        return AttemptCause(
            kind=classified.kind,
            message=classified.message,
            schema_errors=classified.violations,
            code=classified.code,
            hint=classified.hint,
            details=self.details(exchange, classified),
        )

    def details(self, exchange: Exchange, classified: Classified) -> ModelErrorDetails:
        return ModelErrorDetails(
            agent=self.context.agent_id,
            model=self.context.model,
            output_mode=self.context.mode,
            attempt=exchange.attempt,
            raw_excerpt=excerpt(response_text(exchange.response, self.context.output_tools)),
            violations=classified.violations,
        )

    @property
    def last_kind(self) -> AttemptCauseKind | None:
        return self.failures[-1][1].kind if self.failures else None

    def final_error(self, error: BaseException, code: str, message: str) -> FinalError:
        feature = feature_unsupported(error, self.context)
        if feature is not None:
            return feature
        if not isinstance(error, UnexpectedModelBehavior) or not self.failures:
            return FinalError(code=code, message=message)
        exchange, classified = self.failures[-1]
        attempts = len(self.failures)
        return FinalError(
            code=MODEL_RETRIES_EXHAUSTED,
            message=(
                f"model {self.context.model} gave no valid output for agent {self.context.agent_id} "
                f"after {attempts} failed attempts; last error {classified.code}: {classified.message}"
            ),
            hint=classified.hint,
            details=self.details(exchange, classified),
        )


@dataclass(frozen=True, slots=True)
class FinalError:
    code: str
    message: str
    hint: str | None = None
    details: ModelErrorDetails | None = None


def feature_unsupported(error: BaseException, context: FailureContext) -> FinalError | None:
    if isinstance(error, UserError) and CLIENT_UNSUPPORTED_SUFFIX in str(error):
        return FinalError(
            code=MODEL_FEATURE_UNSUPPORTED,
            message=f"model {context.model} does not support the {context.mode} output mode: {error}",
            hint=_hint(FEATURE_HINTS[context.mode], context),
            details=ModelErrorDetails(agent=context.agent_id, model=context.model, output_mode=context.mode),
        )
    if not isinstance(error, ModelHTTPError) or error.status_code not in CLIENT_ERROR_STATUSES:
        return None
    body = _body_text(error.body).lower()
    if not any(marker in body for marker in FEATURE_MARKERS) or not any(item in body for item in UNSUPPORTED_MARKERS):
        return None
    return FinalError(
        code=MODEL_FEATURE_UNSUPPORTED,
        message=(
            f"provider of model {context.model} rejected the {context.mode} output mode "
            f"with HTTP {error.status_code}: {excerpt(_body_text(error.body))}"
        ),
        hint=_hint(FEATURE_HINTS[context.mode], context),
        details=ModelErrorDetails(
            agent=context.agent_id,
            model=context.model,
            output_mode=context.mode,
            raw_excerpt=excerpt(_body_text(error.body)),
        ),
    )


def classify(exchange: Exchange, context: FailureContext, guards: Guards) -> Classified:
    found = (rule(exchange, context, guards) for rule in RETRY_RULES)
    return next((item for item in found if item is not None), _schema_mismatch_text(exchange, context))


def _missing_output(
    exchange: Exchange, context: FailureContext, guards: Mapping[int, GuardFailure]
) -> Classified | None:
    if not _missing_output_part(exchange.retry):
        return None
    return Classified(
        kind="no_structured_output",
        code=MODEL_NO_STRUCTURED_OUTPUT,
        message=NO_OUTPUT_MESSAGES[context.mode].format(model=context.model),
        hint=_hint(NO_OUTPUT_HINTS[context.mode], context),
    )


def _invalid_json(exchange: Exchange, context: FailureContext, guards: Guards) -> Classified | None:
    errors = _errors(exchange.retry)
    invalid = next((error for error in errors if error["type"] == JSON_INVALID_TYPE), None)
    if invalid is None:
        return None
    return Classified(
        kind="invalid_json",
        code=MODEL_INVALID_JSON,
        message=f"model {context.model} returned output that is not valid JSON: {invalid['msg']}",
        hint=_hint(INVALID_JSON_HINTS[context.mode], context),
    )


def _schema_errors(
    exchange: Exchange, context: FailureContext, guards: Mapping[int, GuardFailure]
) -> Classified | None:
    errors = _errors(exchange.retry)
    if not errors:
        return None
    violations = tuple(Problem(path=tuple(error["loc"]), code=error["type"], message=error["msg"]) for error in errors)
    listed = "; ".join(f"{_path_text(item.path)}: {item.message}" for item in violations)
    return Classified(
        kind="schema_invalid",
        code=MODEL_SCHEMA_MISMATCH,
        message=f"output of model {context.model} does not match the schema of inference {context.inference_id}: "
        f"{listed}",
        hint=_violation_hint(errors[0], context),
        violations=violations,
    )


def _guard_failure(
    exchange: Exchange, context: FailureContext, guards: Mapping[int, GuardFailure]
) -> Classified | None:
    guard = guards.get(exchange.attempt)
    if guard is None or not isinstance(exchange.retry.content, str):
        return None
    return Classified(
        kind="schema_invalid",
        code=guard.code,
        message=guard.message,
        hint=f"{guard.hint_action} in {context.inference_location}",
        violations=guard.violations,
    )


RETRY_RULES: Final[tuple[RetryRule, ...]] = (_missing_output, _invalid_json, _schema_errors, _guard_failure)


def _schema_mismatch_text(exchange: Exchange, context: FailureContext) -> Classified:
    content = exchange.retry.content if isinstance(exchange.retry.content, str) else ""
    return Classified(
        kind="schema_invalid",
        code=MODEL_SCHEMA_MISMATCH,
        message=f"output of model {context.model} was rejected: {content}",
        hint=f"tighten the prompt of inference {context.inference_id} in {context.inference_location}",
    )


def _violation_hint(error: ErrorDetails, context: FailureContext) -> str:
    path = tuple(error["loc"])
    text = LIMIT_TEXTS.get(error["type"])
    location = _field_location(path, context)
    if text is None:
        return f"field {_path_text(path)} is invalid ({error['msg']}): tighten the prompt in {location}"
    limit = _limit(path, text.key, context.schema)
    phrase = text.phrase.format(limit=limit)
    return f"field {_path_text(path)} {phrase}: tighten the prompt or {text.action} in {location}"


def _field_location(path: tuple[int | str, ...], context: FailureContext) -> str:
    owner = _owner_type(path, context.schema)
    return context.inference_location if owner is None else f"type {owner}"


def _owner_type(path: tuple[int | str, ...], schema: Schema) -> str | None:
    defs = _mapping(schema.get("$defs"))
    current: Schema = schema
    owner: str | None = None
    for segment in path[:-1]:
        name, current = _step(current, segment, defs)
        owner = name or owner
    return owner


def _limit(path: tuple[int | str, ...], key: str, schema: Schema) -> str:
    defs = _mapping(schema.get("$defs"))
    current: Schema = schema
    for segment in path:
        _, current = _step(current, segment, defs)
    value = _lookup(current, key, defs)
    return "" if value is None else json.dumps(value, ensure_ascii=False)


def _lookup(schema: Schema, key: str, defs: Schema) -> JsonValue:
    resolved = _resolve(schema, defs)[1]
    if key in resolved:
        return resolved[key]
    options = [_resolve(option, defs)[1] for option in _list_of_maps(resolved.get("anyOf"))]
    return next((option[key] for option in options if key in option), None)


def _step(schema: Schema, segment: int | str, defs: Schema) -> tuple[str | None, Schema]:
    name, resolved = _resolve(schema, defs)
    options = [resolved, *(_resolve(option, defs)[1] for option in _list_of_maps(resolved.get("anyOf")))]
    key = "items" if isinstance(segment, int) else "properties"
    for option in options:
        container = _mapping(option.get(key))
        child = container if isinstance(segment, int) else _mapping(container.get(segment))
        if child:
            child_name, child_schema = _resolve(child, defs)
            return child_name or name, child_schema
    return name, {}


def _resolve(schema: Schema, defs: Schema) -> tuple[str | None, Schema]:
    ref = schema.get("$ref")
    if not isinstance(ref, str) or not ref.startswith(REF_PREFIX):
        return None, schema
    name = ref.removeprefix(REF_PREFIX)
    return name, _mapping(defs.get(name))


def _mapping(value: JsonValue) -> Schema:
    return value if isinstance(value, dict) else {}


def _list_of_maps(value: JsonValue) -> list[Schema]:
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _path_text(path: Sequence[int | str]) -> str:
    return PATH_SEPARATOR.join(str(segment) for segment in path) or "output"


def _hint(template: str, context: FailureContext) -> str:
    return template.format(agent=context.agent_location, check=context.models_check())


def _action(final: bool) -> AttemptAction:
    return FINAL_ACTION if final else REPAIR_ACTION


def _output_retry(message: ModelMessage | None, tools: frozenset[str]) -> RetryPromptPart | None:
    if not isinstance(message, ModelRequest):
        return None
    return next(
        (
            part
            for part in message.parts
            if isinstance(part, RetryPromptPart) and (part.tool_name is None or part.tool_name in tools)
        ),
        None,
    )


def _missing_output_part(retry: RetryPromptPart) -> bool:
    return (
        retry.tool_name is None and isinstance(retry.content, str) and retry.content.startswith(MISSING_OUTPUT_PREFIX)
    )


def _errors(retry: RetryPromptPart) -> list[ErrorDetails]:
    return [] if isinstance(retry.content, str) else list(retry.content)


def _error_types(retry: RetryPromptPart) -> frozenset[str]:
    return frozenset(error["type"] for error in _errors(retry))


def _retry_of(error: BaseException) -> RetryPromptPart | None:
    match error:
        case ToolRetryError():
            return error.tool_retry
        case ValidationError():
            return RetryPromptPart.from_error(error)
        case ModelRetry():
            return RetryPromptPart.from_error(error)
        case _:
            return None


def _body_text(body: object) -> str:
    if body is None:
        return ""
    if isinstance(body, str):
        return body
    return json.dumps(body, ensure_ascii=False, default=str)
