import keyword
import posixpath
import re
from collections.abc import Callable, Iterable, Iterator, Mapping
from dataclasses import dataclass
from typing import Final

from pydantic import JsonValue

from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.loader.layout import FLOW_PATH_PREFIX, ROOT_PATH_PREFIX, ancestors, code_file_ref
from aqven.loader.strict_yaml import YamlPath
from aqven.spec import CODE_ALIAS_BODY, FUNCTION_BODY, TEXT_SUFFIX, SpecKind

HERE: Final = "here"
FLOW: Final = "flow"
ROOT: Final = "root"
RESERVED_ALIASES: Final = frozenset({HERE, FLOW, ROOT})
BARE: Final = re.compile(FUNCTION_BODY)
ALIASED: Final = re.compile(CODE_ALIAS_BODY)
ANY: Final = None

type Pattern = tuple[str | None, ...]


@dataclass(frozen=True, slots=True)
class Alias:
    written: str
    resolved: str | None


@dataclass(frozen=True, slots=True)
class AliasFailure:
    code: DiagnosticCode
    message: str


@dataclass(frozen=True, slots=True)
class Aliased:
    data: JsonValue
    aliases: Mapping[YamlPath, Alias]
    diagnostics: tuple[Diagnostic, ...]


@dataclass(frozen=True, slots=True)
class AliasScope:
    package: str
    flow_folders: tuple[str, ...]

    def flow_of(self, folder: str) -> str | None:
        return next((candidate for candidate in ancestors(folder) if candidate in self.flow_folders), None)

    def folder_of(self, alias: str, folder: str) -> str | None:
        special = SPECIAL_FOLDERS.get(alias)
        if special is not None:
            return special(self, folder)
        return next((found for found in self.flow_folders if posixpath.basename(found) == alias), None)

    def import_path(self, folder: str, module: str, function: str) -> str | AliasFailure:
        parts = [self.package, *(part for part in folder.split("/") if part), *module.split(".")]
        if all(part.isidentifier() and not keyword.iskeyword(part) for part in parts):
            return f"{'.'.join(parts)}:{function}"
        message = f"folder {folder or '.'} with module {module} is not importable from package {self.package}"
        return AliasFailure(DiagnosticCode.E_ALIAS_OUTSIDE_PACKAGE, message)


type Resolver = Callable[[AliasScope, str, str], str | AliasFailure]

SPECIAL_FOLDERS: Final[Mapping[str, Callable[[AliasScope, str], str | None]]] = {
    HERE: lambda _, folder: folder,
    FLOW: AliasScope.flow_of,
    ROOT: lambda _, __: "",
}


def is_bare(text: str) -> bool:
    return BARE.fullmatch(text) is not None


def resolve_code(scope: AliasScope, file: str, text: str) -> str | AliasFailure:
    if is_bare(text):
        return code_file_ref(file, text)
    if ALIASED.fullmatch(text) is None:
        return text
    head, _, function = text.partition(":")
    alias, _, module = head.removeprefix("@").partition(".")
    base = scope.folder_of(alias, posixpath.dirname(file))
    if base is None:
        message = f"@{alias} does not resolve: expected here, root, flow inside a flow, or a project flow id"
        return AliasFailure(DiagnosticCode.E_ALIAS_UNKNOWN, message)
    return scope.import_path(base, module, function)


def resolve_path(scope: AliasScope, file: str, text: str) -> str | AliasFailure:
    if not text.startswith(FLOW_PATH_PREFIX):
        return text
    flow = scope.flow_of(posixpath.dirname(file))
    if flow is None:
        return AliasFailure(DiagnosticCode.E_ALIAS_UNKNOWN, "@flow/ outside a flow: no flow.yaml above the file")
    return f"{ROOT_PATH_PREFIX}{posixpath.join(flow, text.removeprefix(FLOW_PATH_PREFIX))}"


def resolve_prompt(scope: AliasScope, file: str, text: str) -> str | AliasFailure:
    resolver = resolve_path if text.endswith(TEXT_SUFFIX) else resolve_code
    return resolver(scope, file, text)


SITES: Final[Mapping[SpecKind, tuple[tuple[Pattern, Resolver], ...]]] = {
    SpecKind.NODE: (
        (("run",), resolve_code),
        (("join", "run"), resolve_code),
        (("on_item_error", "run"), resolve_code),
        (("stop", ANY, "run"), resolve_code),
        (("select", "run"), resolve_code),
    ),
    SpecKind.TOOL: ((("run",), resolve_code), (("wait", "poll"), resolve_code)),
    SpecKind.INFERENCE: (
        (("prompt",), resolve_prompt),
        (("variants", ANY, "cases", ANY), resolve_path),
        (("variants", ANY, "default"), resolve_path),
        (("checks", ANY, "run"), resolve_code),
    ),
    SpecKind.EVAL: ((("scorers", ANY, "run"), resolve_code),),
    SpecKind.AGENT: ((("instructions",), resolve_path),),
}


def resolve_aliases(scope: AliasScope, file: str, kind: SpecKind, data: JsonValue) -> Aliased:
    outcomes = {
        path: (text, resolver(scope, file, text))
        for pattern, resolver in SITES.get(kind, ())
        for path, text in sites(data, pattern)
    }
    changed = {path: (text, outcome) for path, (text, outcome) in outcomes.items() if outcome != text}
    replacements = {path: outcome for path, (_, outcome) in changed.items() if isinstance(outcome, str)}
    aliases = {path: Alias(text, replacements.get(path)) for path, (text, _) in changed.items()}
    diagnostics = tuple(
        diagnostic(outcome.code, file, path, f"{text}: {outcome.message}")
        for path, (text, outcome) in changed.items()
        if isinstance(outcome, AliasFailure)
    )
    return Aliased(_replaced(data, replacements), aliases, diagnostics)


def reserved_flow(flow_id: str, file: str) -> Diagnostic:
    message = f"flow id {flow_id} collides with alias @{flow_id}: here, flow and root are reserved"
    return diagnostic(DiagnosticCode.E_ALIAS_RESERVED, file, (), message)


def sites(data: JsonValue, pattern: Pattern, path: YamlPath = ()) -> Iterator[tuple[YamlPath, str]]:
    if not pattern:
        yield from ((path, data),) if isinstance(data, str) else ()
        return
    for key, value in children(data):
        if pattern[0] in (ANY, key):
            yield from sites(value, pattern[1:], (*path, key))


def children(data: JsonValue) -> Iterable[tuple[str | int, JsonValue]]:
    if isinstance(data, dict):
        return data.items()
    if isinstance(data, list):
        return enumerate(data)
    return ()


def _replaced(data: JsonValue, replacements: Mapping[YamlPath, str], path: YamlPath = ()) -> JsonValue:
    if path in replacements:
        return replacements[path]
    if isinstance(data, dict):
        return {key: _replaced(value, replacements, (*path, key)) for key, value in data.items()}
    if isinstance(data, list):
        return [_replaced(value, replacements, (*path, index)) for index, value in enumerate(data)]
    return data
