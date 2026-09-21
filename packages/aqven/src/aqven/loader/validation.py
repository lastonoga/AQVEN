from collections.abc import Callable, Mapping, Sequence
from typing import Final

from pydantic import JsonValue, ValidationError
from pydantic_core import ErrorDetails

from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.loader.strict_yaml import Position, YamlPath, locate
from aqven.spec import API_VERSION, SpecKind
from aqven.spec.nodes import UNSUPPORTED_NODE_KINDS

type CodePredicate = Callable[[str, YamlPath, JsonValue], bool]

API_VERSION_KEY: Final = "apiVersion"
KIND_KEY: Final = "kind"
NODE_KEY: Final = "node"
LIMITS_KEY: Final = "limits"
OUT_KEY: Final = "out"
DISCRIMINATOR_KEYS: Final = ("node", "type", "kind", "policy", "rule")
TEXT_OUTPUT_KEYS: Final = frozenset({"mode", "text", "output_type", "text_output"})
TEXT_OUTPUT_KINDS: Final = frozenset({SpecKind.AGENT.value, SpecKind.INFERENCE.value, SpecKind.NODE.value})
MISSING_OUT_ERRORS: Final = frozenset({"missing", "too_short"})
OUTPUT_MODE_PATH: Final[YamlPath] = ("output", "mode")
TEXT_MODE_VALUES: Final = frozenset({"text", "text_output"})
KNOWN_KINDS: Final = frozenset(item.value for item in SpecKind)

MESSAGES_BY_ERROR: Final[Mapping[str, str]] = {
    "extra_forbidden": "unknown key {key}",
    "missing": "required key {key} is missing",
    "literal_error": "invalid value: {message}",
    "enum": "invalid value: {message}",
}
FALLBACK_MESSAGE: Final = "value does not pass the spec model: {message}"
TEXT_OUTPUT_MESSAGE: Final = "there is no text mode; the answer is an object with a bounded Text field"


def _kind_of(data: JsonValue) -> JsonValue:
    return data.get(KIND_KEY) if isinstance(data, dict) else None


def _is_text_mode_key(error_type: str, path: YamlPath, data: JsonValue) -> bool:
    return (
        error_type == "extra_forbidden"
        and bool(path)
        and path[-1] in TEXT_OUTPUT_KEYS
        and _kind_of(data) in TEXT_OUTPUT_KINDS
    )


def _is_text_mode_value(error_type: str, path: YamlPath, data: JsonValue) -> bool:
    output = data.get("output") if isinstance(data, dict) else None
    mode = output.get("mode") if isinstance(output, dict) else None
    return path == OUTPUT_MODE_PATH and _kind_of(data) == SpecKind.AGENT.value and mode in TEXT_MODE_VALUES


def _is_inference_without_out(error_type: str, path: YamlPath, data: JsonValue) -> bool:
    return error_type in MISSING_OUT_ERRORS and path == (OUT_KEY,) and _kind_of(data) == SpecKind.INFERENCE.value


def _is_unknown_key(error_type: str, path: YamlPath, data: JsonValue) -> bool:
    return error_type == "extra_forbidden"


def _is_dynamic_limits(error_type: str, path: YamlPath, data: JsonValue) -> bool:
    return any(
        segment == LIMITS_KEY and index >= 2 and path[index - 2] == OUT_KEY and isinstance(path[index - 1], int)
        for index, segment in enumerate(path)
    )


MESSAGE_BY_CODE: Final[Mapping[DiagnosticCode, str]] = {
    DiagnosticCode.E_TEXT_OUTPUT: TEXT_OUTPUT_MESSAGE,
}

CODE_RULES: Final[tuple[tuple[CodePredicate, DiagnosticCode], ...]] = (
    (_is_text_mode_key, DiagnosticCode.E_TEXT_OUTPUT),
    (_is_text_mode_value, DiagnosticCode.E_TEXT_OUTPUT),
    (_is_inference_without_out, DiagnosticCode.E_TEXT_OUTPUT),
    (_is_unknown_key, DiagnosticCode.E_UNKNOWN_KEY),
    (_is_dynamic_limits, DiagnosticCode.E_DYNAMIC_LIMITS),
)


def validation_diagnostics(
    error: ValidationError,
    file: str,
    positions: Mapping[YamlPath, Position],
    data: JsonValue = None,
) -> tuple[Diagnostic, ...]:
    return tuple(_error_diagnostic(details, file, positions, data) for details in error.errors())


def spec_kind(data: JsonValue) -> SpecKind | None:
    kind = data.get(KIND_KEY) if isinstance(data, dict) else None
    return SpecKind(kind) if isinstance(kind, str) and kind in KNOWN_KINDS else None


def header_diagnostics(data: JsonValue, file: str, expected: SpecKind | None) -> tuple[Diagnostic, ...]:
    if not isinstance(data, dict):
        return (diagnostic(DiagnosticCode.E_YAML_NOT_MAPPING, file, (), "a spec file must be a mapping of keys"),)
    api_version = data.get(API_VERSION_KEY)
    if api_version != API_VERSION:
        return (
            diagnostic(
                DiagnosticCode.E_API_VERSION,
                file,
                (API_VERSION_KEY,),
                f"unknown format version {api_version!r}: expected {API_VERSION!r}",
            ),
        )
    return _kind_diagnostics(data, file, expected)


def _kind_diagnostics(data: dict[str, JsonValue], file: str, expected: SpecKind | None) -> tuple[Diagnostic, ...]:
    kind = spec_kind(data)
    if kind is None:
        message = f"unknown file kind {data.get(KIND_KEY)!r}"
        return (diagnostic(DiagnosticCode.E_KIND_UNKNOWN, file, (KIND_KEY,), message),)
    problem = _placement_problem(kind, expected)
    if problem is not None:
        return (diagnostic(DiagnosticCode.E_KIND_PATH_MISMATCH, file, (KIND_KEY,), problem),)
    return _node_kind_diagnostics(data, file, kind)


def _placement_problem(kind: SpecKind, expected: SpecKind | None) -> str | None:
    if expected is None and kind is SpecKind.PROJECT:
        return "kind Project is allowed only for aqven.yaml at the project root"
    if expected is None or kind is expected:
        return None
    return f"kind {kind.value} does not match the file name: only {expected.value} uses this name"


def _node_kind_diagnostics(data: dict[str, JsonValue], file: str, kind: SpecKind) -> tuple[Diagnostic, ...]:
    node = data.get(NODE_KEY)
    if kind is not SpecKind.NODE or node not in UNSUPPORTED_NODE_KINDS:
        return ()
    return (
        diagnostic(
            DiagnosticCode.E_NODE_KIND_UNSUPPORTED,
            file,
            (NODE_KEY,),
            f"node kind {node!r} is not supported yet",
        ),
    )


def _error_diagnostic(
    details: ErrorDetails,
    file: str,
    positions: Mapping[YamlPath, Position],
    data: JsonValue,
) -> Diagnostic:
    path = _document_path(details["loc"], positions, data)
    code = next(
        (code for matches, code in CODE_RULES if matches(details["type"], path, data)), DiagnosticCode.E_SPEC_INVALID
    )
    template = MESSAGES_BY_ERROR.get(details["type"], FALLBACK_MESSAGE)
    key = path[-1] if path else ""
    message = MESSAGE_BY_CODE.get(code, template.format(key=key, message=details["msg"]))
    position = locate(positions, path)
    line, column = position if position is not None else (None, None)
    return diagnostic(code, file, path, message, line=line, column=column)


def _document_path(loc: Sequence[str | int], positions: Mapping[YamlPath, Position], data: JsonValue) -> YamlPath:
    path: YamlPath = ()
    node = data
    for segment in loc:
        candidate = (*path, segment)
        if candidate in positions:
            path, node = candidate, _child(node, segment)
            continue
        if _is_tag(node, segment):
            continue
        path, node = candidate, None
    return path


def _child(node: JsonValue, segment: str | int) -> JsonValue:
    if isinstance(node, dict) and isinstance(segment, str):
        return node.get(segment)
    if isinstance(node, list) and isinstance(segment, int) and 0 <= segment < len(node):
        return node[segment]
    return None


def _is_tag(node: JsonValue, segment: str | int) -> bool:
    if not isinstance(node, dict) or not isinstance(segment, str) or segment in node:
        return False
    return segment[:1].isupper() or any(node.get(key) == segment for key in DISCRIMINATOR_KEYS)
