import json
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum
from typing import Final

from pydantic import BaseModel, ConfigDict


class Severity(StrEnum):
    ERROR = "error"
    WARNING = "warning"


class DiagnosticCode(StrEnum):
    E_PROJECT_NOT_FOUND = "E_PROJECT_NOT_FOUND"
    E_YAML_SYNTAX = "E_YAML_SYNTAX"
    E_YAML_DUPLICATE_KEY = "E_YAML_DUPLICATE_KEY"
    E_YAML_COMMENT = "E_YAML_COMMENT"
    E_YAML_ANCHOR = "E_YAML_ANCHOR"
    E_YAML_TAG = "E_YAML_TAG"
    E_YAML_DIRECTIVE = "E_YAML_DIRECTIVE"
    E_YAML_FLOW_STYLE = "E_YAML_FLOW_STYLE"
    E_YAML_BLOCK_SCALAR = "E_YAML_BLOCK_SCALAR"
    E_YAML_MULTI_DOCUMENT = "E_YAML_MULTI_DOCUMENT"
    E_YAML_NOT_MAPPING = "E_YAML_NOT_MAPPING"
    E_API_VERSION = "E_API_VERSION"
    E_KIND_UNKNOWN = "E_KIND_UNKNOWN"
    E_KIND_PATH_MISMATCH = "E_KIND_PATH_MISMATCH"
    E_UNKNOWN_KEY = "E_UNKNOWN_KEY"
    E_SPEC_INVALID = "E_SPEC_INVALID"
    E_NODE_KIND_UNSUPPORTED = "E_NODE_KIND_UNSUPPORTED"
    E_BAD_NAME = "E_BAD_NAME"
    E_ID_DUPLICATE = "E_ID_DUPLICATE"
    E_PACKAGE_MISMATCH = "E_PACKAGE_MISMATCH"
    E_SOURCE_CONFLICT = "E_SOURCE_CONFLICT"
    E_BUILDER_FAILED = "E_BUILDER_FAILED"
    E_NODE_UNORDERED = "E_NODE_UNORDERED"
    E_ORPHAN_FILE = "E_ORPHAN_FILE"
    E_TYPE_REF_SYNTAX = "E_TYPE_REF_SYNTAX"
    E_TYPE_UNKNOWN = "E_TYPE_UNKNOWN"
    E_TYPE_CONSTRAINT_MISMATCH = "E_TYPE_CONSTRAINT_MISMATCH"
    E_TYPE_RECURSIVE = "E_TYPE_RECURSIVE"
    E_REF_SYNTAX = "E_REF_SYNTAX"
    E_REF_MISSING = "E_REF_MISSING"
    E_REF_SCOPE = "E_REF_SCOPE"
    E_CYCLE = "E_CYCLE"
    E_BINDING_TYPE = "E_BINDING_TYPE"
    E_INPUT_UNBOUND = "E_INPUT_UNBOUND"
    E_INPUT_UNKNOWN = "E_INPUT_UNKNOWN"
    E_INFERENCE_UNKNOWN = "E_INFERENCE_UNKNOWN"
    E_AGENT_UNKNOWN = "E_AGENT_UNKNOWN"
    E_AGENT_RECURSION = "E_AGENT_RECURSION"
    E_TOOL_UNKNOWN = "E_TOOL_UNKNOWN"
    E_PROVIDER_UNKNOWN = "E_PROVIDER_UNKNOWN"
    E_MODALITY_UNSUPPORTED = "E_MODALITY_UNSUPPORTED"
    E_STRICT_UNSUPPORTED = "E_STRICT_UNSUPPORTED"
    E_TEXT_OUTPUT = "E_TEXT_OUTPUT"
    E_SECRET_LITERAL = "E_SECRET_LITERAL"
    E_SECRET_REF_SYNTAX = "E_SECRET_REF_SYNTAX"
    E_PII_PROVIDER = "E_PII_PROVIDER"
    E_PROMPT_MISSING = "E_PROMPT_MISSING"
    E_FRAGMENT_MISSING = "E_FRAGMENT_MISSING"
    E_PROMPT_SYNTAX = "E_PROMPT_SYNTAX"
    E_PROMPT_TAG_FORBIDDEN = "E_PROMPT_TAG_FORBIDDEN"
    E_PROMPT_FILTER_FORBIDDEN = "E_PROMPT_FILTER_FORBIDDEN"
    E_PROMPT_MESSAGE_NESTED = "E_PROMPT_MESSAGE_NESTED"
    E_PROMPT_VARIABLE_UNDECLARED = "E_PROMPT_VARIABLE_UNDECLARED"
    E_PROMPT_INPUT_UNUSED = "E_PROMPT_INPUT_UNUSED"
    E_PROMPT_OUTPUT_FORMAT = "E_PROMPT_OUTPUT_FORMAT"
    E_PROMPT_CASE_NOT_EXHAUSTIVE = "E_PROMPT_CASE_NOT_EXHAUSTIVE"
    E_PROMPT_MEDIA_RENDERED = "E_PROMPT_MEDIA_RENDERED"
    E_VARIANT_MISSING = "E_VARIANT_MISSING"
    E_VARIANT_NOT_EXHAUSTIVE = "E_VARIANT_NOT_EXHAUSTIVE"
    E_EXAMPLE_INVALID = "E_EXAMPLE_INVALID"
    E_CHECK_PARAMS = "E_CHECK_PARAMS"
    E_POLICY_UNKNOWN = "E_POLICY_UNKNOWN"
    E_POLICY_PARAMS = "E_POLICY_PARAMS"
    E_CODE_REF_UNRESOLVED = "E_CODE_REF_UNRESOLVED"
    E_CODE_SIGNATURE_MISMATCH = "E_CODE_SIGNATURE_MISMATCH"
    E_CODE_NOT_FOUND = "E_CODE_NOT_FOUND"
    E_ALIAS_UNKNOWN = "E_ALIAS_UNKNOWN"
    E_ALIAS_RESERVED = "E_ALIAS_RESERVED"
    E_ALIAS_OUTSIDE_PACKAGE = "E_ALIAS_OUTSIDE_PACKAGE"
    E_DOCSTRING = "E_DOCSTRING"
    E_TOOL_IDEMPOTENCY = "E_TOOL_IDEMPOTENCY"
    E_OUTPUT_UNBOUNDED = "E_OUTPUT_UNBOUNDED"
    E_SWITCH_NOT_EXHAUSTIVE = "E_SWITCH_NOT_EXHAUSTIVE"
    E_SWITCH_ON_TYPE = "E_SWITCH_ON_TYPE"
    E_HUMAN_FORM_TYPE = "E_HUMAN_FORM_TYPE"
    E_HUMAN_DEFAULT_INVALID = "E_HUMAN_DEFAULT_INVALID"
    E_APPROVAL_TOOL = "E_APPROVAL_TOOL"
    E_DYNAMIC_LIMITS = "E_DYNAMIC_LIMITS"
    E_DYNAMIC_SOURCE = "E_DYNAMIC_SOURCE"
    E_OPAQUE_ACCESS = "E_OPAQUE_ACCESS"
    E_NARROW_TARGET = "E_NARROW_TARGET"
    E_ALLOWED_SET_TYPE = "E_ALLOWED_SET_TYPE"
    E_FLOW_UNKNOWN = "E_FLOW_UNKNOWN"
    E_CONTRACT_VIOLATION = "E_CONTRACT_VIOLATION"
    E_FLOW_RECURSION = "E_FLOW_RECURSION"
    E_MCP_SERVER_UNKNOWN = "E_MCP_SERVER_UNKNOWN"
    E_DATASET_UNKNOWN = "E_DATASET_UNKNOWN"
    E_GATE_POLICY = "E_GATE_POLICY"
    E_OPTIMIZATION_TARGET = "E_OPTIMIZATION_TARGET"
    E_PROVIDER_EXTRA_MISSING = "E_PROVIDER_EXTRA_MISSING"
    E_PROVIDER_NO_STREAMING = "E_PROVIDER_NO_STREAMING"
    E_OUTPUT_MODE_UNSUPPORTED = "E_OUTPUT_MODE_UNSUPPORTED"
    E_TYPES_PACKAGE = "E_TYPES_PACKAGE"
    W_PROMPT_SHADOWED = "W_PROMPT_SHADOWED"
    W_GENERATED_STALE = "W_GENERATED_STALE"
    W_OUTPUT_MODE_RESOLVED = "W_OUTPUT_MODE_RESOLVED"
    W_TYPES_SHADOWS_STDLIB = "W_TYPES_SHADOWS_STDLIB"


SEVERITY_BY_PREFIX: Final[Mapping[str, Severity]] = {"E": Severity.ERROR, "W": Severity.WARNING}

SEVERITY_BY_CODE: Final[Mapping[DiagnosticCode, Severity]] = {
    code: SEVERITY_BY_PREFIX[code.value[0]] for code in DiagnosticCode
}

RULE_BY_CODE: Final[Mapping[DiagnosticCode, str]] = {
    DiagnosticCode.E_TYPE_RECURSIVE: "R-36",
    DiagnosticCode.E_CYCLE: "R-44",
    DiagnosticCode.E_BINDING_TYPE: "R-09",
    DiagnosticCode.E_INPUT_UNBOUND: "R-09",
    DiagnosticCode.E_INPUT_UNKNOWN: "R-09",
    DiagnosticCode.E_PROVIDER_UNKNOWN: "R-03",
    DiagnosticCode.E_STRICT_UNSUPPORTED: "R-D5",
    DiagnosticCode.E_SECRET_LITERAL: "R-S16",
    DiagnosticCode.E_SECRET_REF_SYNTAX: "R-S16",
    DiagnosticCode.E_PII_PROVIDER: "R-S12",
    DiagnosticCode.E_PROMPT_VARIABLE_UNDECLARED: "R-T1",
    DiagnosticCode.E_PROMPT_INPUT_UNUSED: "R-T2",
    DiagnosticCode.E_PROMPT_OUTPUT_FORMAT: "R-T6",
    DiagnosticCode.E_PROMPT_CASE_NOT_EXHAUSTIVE: "R-T4",
    DiagnosticCode.E_OUTPUT_UNBOUNDED: "R-42",
    DiagnosticCode.E_SWITCH_NOT_EXHAUSTIVE: "R-41",
    DiagnosticCode.E_SWITCH_ON_TYPE: "R-41",
    DiagnosticCode.E_DYNAMIC_LIMITS: "R-D2",
    DiagnosticCode.E_DYNAMIC_SOURCE: "R-D3",
    DiagnosticCode.E_OPAQUE_ACCESS: "R-D1",
    DiagnosticCode.E_NARROW_TARGET: "R-D1",
    DiagnosticCode.E_ALLOWED_SET_TYPE: "R-37a",
    DiagnosticCode.E_CONTRACT_VIOLATION: "R-J2",
}

SUMMARY_TEMPLATE: Final = "errors: {errors}, warnings: {warnings}"
HINT_PREFIX: Final = "\n  hint: "


@dataclass(frozen=True, slots=True)
class DiagnosticText:
    message: str
    hint: str | None = None

    def render(self, values: Mapping[str, str]) -> tuple[str, str | None]:
        hint = None if self.hint is None else self.hint.format_map(values)
        return self.message.format_map(values), hint


DIAGNOSTIC_TEXTS: Final[Mapping[DiagnosticCode, DiagnosticText]] = {
    DiagnosticCode.E_PROVIDER_EXTRA_MISSING: DiagnosticText(
        "model {model} needs provider {provider}, which is not installed",
        "install the extra: uv add 'aqven[{extra}]'",
    ),
    DiagnosticCode.E_PROVIDER_NO_STREAMING: DiagnosticText(
        "model {model}: provider {provider} does not support streaming, and aqven streams every model request",
        "choose a model of a provider with streaming support",
    ),
    DiagnosticCode.E_OUTPUT_MODE_UNSUPPORTED: DiagnosticText(
        "output.mode {mode} is not supported by model {model}",
        "set output.mode to one of: {supported}",
    ),
    DiagnosticCode.W_OUTPUT_MODE_RESOLVED: DiagnosticText(
        "output.mode auto resolves to {mode} for model {model} ({source})",
        "set output.mode: {mode} to pin it",
    ),
    DiagnosticCode.W_TYPES_SHADOWS_STDLIB: DiagnosticText(
        "generated {module}/types.py shadows the standard library module types while {folder} is on sys.path",
        "remove {folder} from sys.path and PYTHONPATH; import the models as {module}.types",
    ),
}


class Diagnostic(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    code: DiagnosticCode
    severity: Severity
    file: str
    path: tuple[str | int, ...]
    message: str
    rule: str | None = None
    line: int | None = None
    column: int | None = None
    hint: str | None = None


def diagnostic(
    code: DiagnosticCode,
    file: str,
    path: Sequence[str | int],
    message: str,
    *,
    line: int | None = None,
    column: int | None = None,
    rule: str | None = None,
    hint: str | None = None,
) -> Diagnostic:
    return Diagnostic(
        code=code,
        severity=SEVERITY_BY_CODE[code],
        file=file,
        path=tuple(path),
        message=message,
        rule=RULE_BY_CODE.get(code) if rule is None else rule,
        line=line,
        column=column,
        hint=hint,
    )


def templated_diagnostic(
    code: DiagnosticCode,
    file: str,
    path: Sequence[str | int],
    values: Mapping[str, str],
    *,
    line: int | None = None,
    column: int | None = None,
) -> Diagnostic:
    message, hint = DIAGNOSTIC_TEXTS[code].render(values)
    return diagnostic(code, file, path, message, line=line, column=column, hint=hint)


def has_errors(items: Iterable[Diagnostic]) -> bool:
    return any(item.severity is Severity.ERROR for item in items)


def sort_diagnostics(items: Iterable[Diagnostic]) -> tuple[Diagnostic, ...]:
    return tuple(sorted(items, key=_sort_key))


def format_text(items: Iterable[Diagnostic]) -> str:
    ordered = sort_diagnostics(items)
    lines = [_text_line(item) for item in ordered]
    lines.append(SUMMARY_TEMPLATE.format(**_counts(ordered)))
    return "\n".join(lines)


def format_json(items: Iterable[Diagnostic]) -> str:
    ordered = sort_diagnostics(items)
    counts = _counts(ordered)
    document = {
        "ok": counts["errors"] == 0,
        **counts,
        "diagnostics": [item.model_dump(mode="json") for item in ordered],
    }
    return json.dumps(document, ensure_ascii=False, indent=2)


def render_path(path: Sequence[str | int]) -> str:
    return "".join(_path_segment(index, segment) for index, segment in enumerate(path))


def _path_segment(index: int, segment: str | int) -> str:
    if isinstance(segment, int):
        return f"[{segment}]"
    if index == 0:
        return segment
    return f".{segment}"


def _location(item: Diagnostic) -> str:
    if item.line is None:
        return item.file
    if item.column is None:
        return f"{item.file}:{item.line}"
    return f"{item.file}:{item.line}:{item.column}"


def _text_line(item: Diagnostic) -> str:
    rule = f" {item.rule}" if item.rule else ""
    head = f"{_location(item)}: {item.severity.value} {item.code.value}{rule}"
    path = render_path(item.path)
    hint = f"{HINT_PREFIX}{item.hint}" if item.hint else ""
    if not path:
        return f"{head}: {item.message}{hint}"
    return f"{head} {path}: {item.message}{hint}"


def _sort_key(item: Diagnostic) -> tuple[str, int, int, str, str]:
    return (item.file, item.line or 0, item.column or 0, item.code.value, render_path(item.path))


def _counts(items: Sequence[Diagnostic]) -> dict[str, int]:
    errors = sum(1 for item in items if item.severity is Severity.ERROR)
    return {"errors": errors, "warnings": len(items) - errors}
