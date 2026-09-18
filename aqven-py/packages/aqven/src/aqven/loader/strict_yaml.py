import io
from collections.abc import Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from typing import Final, Protocol, cast

from pydantic import JsonValue
from ruamel.yaml import YAML
from ruamel.yaml.comments import CommentedMap, CommentedSeq
from ruamel.yaml.constructor import DuplicateKeyError
from ruamel.yaml.error import MarkedYAMLError, YAMLError
from ruamel.yaml.events import DocumentStartEvent, ScalarEvent
from ruamel.yaml.tokens import (
    AliasToken,
    AnchorToken,
    CommentToken,
    DirectiveToken,
    FlowMappingStartToken,
    FlowSequenceEndToken,
    FlowSequenceStartToken,
    TagToken,
    Token,
)

from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic

type YamlPath = tuple[str | int, ...]
type Position = tuple[int, int]

BLOCK_SCALAR_STYLES: Final = frozenset({"|", ">"})
COMMENT_MARK: Final = "#"

TOKEN_VIOLATIONS: Final[Mapping[type[Token], tuple[DiagnosticCode, str]]] = {
    DirectiveToken: (DiagnosticCode.E_YAML_DIRECTIVE, "YAML directives are forbidden"),
    AnchorToken: (DiagnosticCode.E_YAML_ANCHOR, "YAML anchors are forbidden"),
    AliasToken: (DiagnosticCode.E_YAML_ANCHOR, "YAML aliases are forbidden"),
    TagToken: (DiagnosticCode.E_YAML_TAG, "YAML tags are forbidden"),
    FlowSequenceStartToken: (
        DiagnosticCode.E_YAML_FLOW_STYLE,
        "nonempty flow-style lists are forbidden: use block style",
    ),
    FlowMappingStartToken: (DiagnosticCode.E_YAML_FLOW_STYLE, "flow-style mappings {} are forbidden: use block style"),
}


class _Reader(Protocol):
    allow_duplicate_keys: bool

    def scan(self, stream: io.StringIO) -> Iterable[object]: ...

    def parse(self, stream: io.StringIO) -> Iterable[object]: ...

    def load(self, stream: str) -> object: ...


class _Mark(Protocol):
    line: int
    column: int


class _Marked(Protocol):
    start_mark: _Mark


class _Commented(Protocol):
    comment: object


class _Styled(Protocol):
    style: str | None


class _MarkedError(Protocol):
    problem_mark: object
    context_mark: object


class _LineCol(Protocol):
    def key(self, key: object) -> object: ...

    def item(self, index: int) -> object: ...


class _Located(Protocol):
    lc: _LineCol


@dataclass(frozen=True, slots=True)
class YamlDocument:
    data: JsonValue
    positions: Mapping[YamlPath, Position]


def read_strict_yaml(text: str, file: str) -> tuple[YamlDocument | None, tuple[Diagnostic, ...]]:
    try:
        tokens = _scan(text)
        events = _parse(text)
    except YAMLError as error:
        return None, (_syntax_diagnostic(error, file),)
    violations = (*_token_violations(tokens, file), *_event_violations(events, file))
    if violations:
        return None, violations
    return _load(text, file)


def locate(positions: Mapping[YamlPath, Position], path: Sequence[str | int]) -> Position | None:
    prefixes = (tuple(path[:length]) for length in range(len(path), -1, -1))
    return next((positions[prefix] for prefix in prefixes if prefix in positions), None)


def _reader() -> _Reader:
    return cast("_Reader", YAML(typ="rt"))


def _scan(text: str) -> list[object]:
    return list(_reader().scan(io.StringIO(text)))


def _parse(text: str) -> list[object]:
    return list(_reader().parse(io.StringIO(text)))


def _start(item: object) -> Position:
    mark = cast("_Marked", item).start_mark
    return mark.line + 1, mark.column + 1


def _token_violations(tokens: Iterable[object], file: str) -> tuple[Diagnostic, ...]:
    typed = [token for token in tokens if isinstance(token, Token)]
    comments = {_start(comment) for token in typed for comment in _comments(cast("_Commented", token).comment)}
    comment_diagnostics = [
        diagnostic(DiagnosticCode.E_YAML_COMMENT, file, (), "YAML comments are forbidden", line=line, column=column)
        for line, column in sorted(comments)
    ]
    token_diagnostics = [
        _token_diagnostic(token, file)
        for index, token in enumerate(typed)
        if type(token) in TOKEN_VIOLATIONS
        and not (
            isinstance(token, FlowSequenceStartToken)
            and index + 1 < len(typed)
            and isinstance(typed[index + 1], FlowSequenceEndToken)
        )
    ]
    return (*comment_diagnostics, *token_diagnostics)


def _token_diagnostic(token: Token, file: str) -> Diagnostic:
    code, message = TOKEN_VIOLATIONS[type(token)]
    line, column = _start(token)
    return diagnostic(code, file, (), message, line=line, column=column)


def _comments(attached: object) -> Iterator[CommentToken]:
    if isinstance(attached, CommentToken):
        yield from _marked_comment(attached)
        return
    if not isinstance(attached, list | tuple):
        return
    for item in cast("Sequence[object]", attached):
        yield from _comments(item)


def _marked_comment(token: CommentToken) -> Iterator[CommentToken]:
    if COMMENT_MARK in str(token.value):
        yield token


def _event_violations(events: Iterable[object], file: str) -> tuple[Diagnostic, ...]:
    listed = list(events)
    blocks = [_start(event) for event in listed if _is_block_scalar(event)]
    documents = [_start(event) for event in listed if isinstance(event, DocumentStartEvent)]
    block_message = "block scalars | and > are forbidden: write strings in double quotes"
    document_message = "a spec file holds exactly one YAML document"
    return (
        *(_at(DiagnosticCode.E_YAML_BLOCK_SCALAR, file, block_message, position) for position in blocks),
        *(_at(DiagnosticCode.E_YAML_MULTI_DOCUMENT, file, document_message, position) for position in documents[1:]),
    )


def _is_block_scalar(event: object) -> bool:
    return isinstance(event, ScalarEvent) and cast("_Styled", event).style in BLOCK_SCALAR_STYLES


def _at(code: DiagnosticCode, file: str, message: str, position: Position) -> Diagnostic:
    line, column = position
    return diagnostic(code, file, (), message, line=line, column=column)


def _load(text: str, file: str) -> tuple[YamlDocument | None, tuple[Diagnostic, ...]]:
    loader = _reader()
    loader.allow_duplicate_keys = False
    try:
        raw: object = loader.load(text)
    except DuplicateKeyError as error:
        return None, (_marked_diagnostic(DiagnosticCode.E_YAML_DUPLICATE_KEY, error, file, "duplicate key"),)
    except YAMLError as error:
        return None, (_syntax_diagnostic(error, file),)
    if not isinstance(raw, CommentedMap):
        return None, (diagnostic(DiagnosticCode.E_YAML_NOT_MAPPING, file, (), "a spec file must be a mapping of keys"),)
    positions: dict[YamlPath, Position] = {}
    data = _plain_map(raw, (), positions)
    return YamlDocument(data=data, positions=positions), ()


def _syntax_diagnostic(error: YAMLError, file: str) -> Diagnostic:
    return _marked_diagnostic(DiagnosticCode.E_YAML_SYNTAX, error, file, "YAML syntax error")


def _marked_diagnostic(code: DiagnosticCode, error: YAMLError, file: str, prefix: str) -> Diagnostic:
    problem = str(error).splitlines()[0] if str(error) else type(error).__name__
    if not isinstance(error, MarkedYAMLError):
        return diagnostic(code, file, (), f"{prefix}: {problem}")
    marked = cast("_MarkedError", error)
    mark = marked.problem_mark or marked.context_mark
    line, column = _mark_position(mark)
    return diagnostic(code, file, (), f"{prefix}: {problem}", line=line, column=column)


def _mark_position(mark: object) -> tuple[int | None, int | None]:
    line: object = getattr(mark, "line", None)
    column: object = getattr(mark, "column", None)
    if not isinstance(line, int) or not isinstance(column, int):
        return None, None
    return line + 1, column + 1


def _plain(value: object, path: YamlPath, positions: dict[YamlPath, Position]) -> JsonValue:
    match value:
        case CommentedMap():
            return _plain_map(value, path, positions)
        case CommentedSeq():
            return _plain_seq(value, path, positions)
        case bool() | str() | None:
            return value
        case int():
            return int(value)
        case float():
            return float(value)
        case date():
            return value.isoformat()
        case _:
            return str(value)


def _plain_map(value: CommentedMap, path: YamlPath, positions: dict[YamlPath, Position]) -> dict[str, JsonValue]:
    items = cast("Mapping[object, object]", value)
    result: dict[str, JsonValue] = {}
    for key, item in items.items():
        name = str(key)
        child = (*path, name)
        positions[child] = _line_col(cast("_Located", value).lc.key(key))
        result[name] = _plain(item, child, positions)
    return result


def _plain_seq(value: CommentedSeq, path: YamlPath, positions: dict[YamlPath, Position]) -> list[JsonValue]:
    items = cast("Sequence[object]", value)
    result: list[JsonValue] = []
    for index, item in enumerate(items):
        child = (*path, index)
        positions[child] = _line_col(cast("_Located", value).lc.item(index))
        result.append(_plain(item, child, positions))
    return result


def _line_col(raw: object) -> Position:
    if not isinstance(raw, tuple):
        return 1, 1
    pair = cast("tuple[object, ...]", raw)
    line, column = pair[0], pair[1]
    if not isinstance(line, int) or not isinstance(column, int):
        return 1, 1
    return line + 1, column + 1
