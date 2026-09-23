import re
from collections.abc import Iterable, Iterator
from typing import Final

from pydantic import BaseModel, JsonValue

from aqven.check.context import CheckContext
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.loader import NODE_ID_SEPARATOR, YamlPath
from aqven.spec import NAME_PATTERN

NAME: Final = re.compile(NAME_PATTERN)
OPAQUE_KEYS: Final = frozenset({"value", "inputs", "expected_output", "metadata", "evaluators", "report_evaluators"})
OPAQUE_MAPPINGS: Final = frozenset({"in", "out", "with", "provider_options"})

VALUE_RULES: Final[tuple[re.Pattern[str], ...]] = (
    re.compile(r"(^|\.)(in|out|fields|returns|bind|variants)\.#\.name$"),
    re.compile(r"^init\.[^.]+\.#\.name$"),
    re.compile(r"(^|\.)values\.#\.value$"),
    re.compile(r"^(order|body)\.#$"),
    re.compile(r"^body(\.[^.#]+)?$"),
    re.compile(r"^cases\.[^.]+\.node$"),
    re.compile(r"^(subagents|examples)\.#\.name$"),
)
KEY_RULES: Final[tuple[re.Pattern[str], ...]] = (re.compile(r"^(cases|body|init|variants)$"),)


def check_names(context: CheckContext) -> Iterable[Diagnostic]:
    return (*_package(context), *_spec_names(context))


def _package(context: CheckContext) -> Iterator[Diagnostic]:
    package = context.spec.package
    if package == context.project.root.name:
        return
    yield diagnostic(
        DiagnosticCode.E_PACKAGE_MISMATCH,
        context.project_file,
        ("package",),
        f"package {package} does not match the project root folder name {context.project.root.name}",
    )


def _sources(context: CheckContext) -> Iterator[tuple[str, BaseModel]]:
    project = context.project
    yield project.project.path, project.project.spec
    yield from ((source.path, source.spec) for source in project.types.values())
    yield from ((source.path, source.spec) for source in project.agents.values())
    yield from ((source.path, source.spec) for source in project.tools.values())
    yield from ((source.path, source.spec) for source in project.mcp_servers.values())
    yield from ((source.path, source.spec) for loaded in project.inferences.values() if (source := loaded.source))
    for flow in project.flows.values():
        yield from ((source.path, source.spec) for source in (flow.source,) if source is not None)
        yield from ((source.path, source.spec) for source in flow.nodes.values())


def _spec_names(context: CheckContext) -> Iterator[Diagnostic]:
    for path, spec in _sources(context):
        data: JsonValue = spec.model_dump(mode="json", by_alias=True, exclude_none=True)
        yield from _walk(path, data, ())


def _walk(file: str, data: JsonValue, path: YamlPath) -> Iterator[Diagnostic]:
    pattern = _pattern(path)
    if isinstance(data, str) and any(rule.search(pattern) for rule in VALUE_RULES) and not _valid(data):
        yield diagnostic(DiagnosticCode.E_BAD_NAME, file, path, _message(data))
    if isinstance(data, list):
        for index, item in enumerate(data):
            yield from _walk(file, item, (*path, index))
    if isinstance(data, dict):
        yield from _walk_mapping(file, data, path, pattern)


def _walk_mapping(file: str, data: dict[str, JsonValue], path: YamlPath, pattern: str) -> Iterator[Diagnostic]:
    keyed = any(rule.search(pattern) for rule in KEY_RULES)
    for key, item in data.items():
        if keyed and not _valid(key):
            yield diagnostic(DiagnosticCode.E_BAD_NAME, file, (*path, key), _message(key))
        if key in OPAQUE_KEYS and isinstance(item, dict | list) or key in OPAQUE_MAPPINGS and isinstance(item, dict):
            continue
        yield from _walk(file, item, (*path, key))


def _pattern(path: YamlPath) -> str:
    return ".".join("#" if isinstance(segment, int) else segment for segment in path)


def _valid(name: str) -> bool:
    return NAME.fullmatch(name) is not None


def _message(name: str) -> str:
    return f"name {name!r} does not match {NAME_PATTERN}; a node name must not contain {NODE_ID_SEPARATOR}"
