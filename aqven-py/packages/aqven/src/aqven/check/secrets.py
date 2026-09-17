import re
from collections.abc import Iterable, Iterator
from typing import Final

from pydantic import BaseModel, JsonValue

from aqven.check.context import CheckContext
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.loader import YamlPath
from aqven.spec import SECRET_REF_PATTERN

SECRET_REF: Final = re.compile(SECRET_REF_PATTERN)
REF_PREFIX: Final = "ref:"
SECRET_SHAPES: Final[tuple[re.Pattern[str], ...]] = (
    re.compile(r"^sk-[A-Za-z0-9_-]{16,}$"),
    re.compile(r"^(sk|pk|rk)_(live|test)_[A-Za-z0-9]{16,}$"),
    re.compile(r"^(ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{20,}$"),
    re.compile(r"^xox[abprs]-[A-Za-z0-9-]{10,}$"),
    re.compile(r"^AKIA[0-9A-Z]{16}$"),
    re.compile(r"^AIza[0-9A-Za-z_-]{35}$"),
    re.compile(r"^Bearer\s+\S{16,}$"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
)
SKIPPED_KEYS: Final = frozenset({"inputs", "expected_output", "metadata", "examples"})


def check_secrets(context: CheckContext) -> Iterable[Diagnostic]:
    return (*_declared_refs(context), *_literals(context))


def _declared_refs(context: CheckContext) -> Iterator[Diagnostic]:
    for file, path, value in _secret_sites(context):
        yield from _secret_ref(file, path, value)


def _secret_sites(context: CheckContext) -> Iterator[tuple[str, YamlPath, str]]:
    spec = context.spec
    file = context.project_file
    project = context.project
    yield from ((file, ("providers", index, "api_key"), item.api_key) for index, item in enumerate(spec.providers))
    yield from (
        (source.path, ("headers", index, "value"), header.value)
        for source in project.mcp_servers.values()
        for index, header in enumerate(source.spec.headers or ())
    )
    yield from (
        (source.path, ("secrets", index, "ref"), binding.ref)
        for source in project.tools.values()
        for index, binding in enumerate(source.spec.secrets or ())
    )


def _secret_ref(file: str, path: YamlPath, value: str) -> Iterator[Diagnostic]:
    if SECRET_REF.fullmatch(value) is not None:
        return
    if value.startswith(REF_PREFIX):
        message = f"secret reference {value!r} does not match {SECRET_REF_PATTERN}"
        yield diagnostic(DiagnosticCode.E_SECRET_REF_SYNTAX, file, path, message)
        return
    yield diagnostic(
        DiagnosticCode.E_SECRET_LITERAL, file, path, "secret written as a literal: use a ref:env/NAME reference"
    )


def _literals(context: CheckContext) -> Iterator[Diagnostic]:
    for file, spec in _documents(context):
        data: JsonValue = spec.model_dump(mode="json", by_alias=True, exclude_none=True)
        yield from _walk(file, data, ())


def _documents(context: CheckContext) -> Iterator[tuple[str, BaseModel]]:
    project = context.project
    yield project.project.path, project.project.spec
    yield from ((source.path, source.spec) for source in project.datasets.values())
    yield from ((source.path, source.spec) for source in project.evals.values())
    yield from ((source.path, source.spec) for source in project.agents.values())
    yield from ((source.path, source.spec) for source in project.tools.values())
    yield from ((source.path, source.spec) for source in project.mcp_servers.values())
    yield from ((source.path, source.spec) for loaded in project.inferences.values() if (source := loaded.source))
    yield from ((entry.file, entry.spec) for entry in context.graph.all_entries())


def _walk(file: str, data: JsonValue, path: YamlPath) -> Iterator[Diagnostic]:
    match data:
        case str() if any(shape.search(data) for shape in SECRET_SHAPES):
            yield diagnostic(
                DiagnosticCode.E_SECRET_LITERAL, file, path, "value looks like a secret: use a ref:env/NAME reference"
            )
        case list():
            for index, item in enumerate(data):
                yield from _walk(file, item, (*path, index))
        case dict():
            for key, item in data.items():
                yield from () if key in SKIPPED_KEYS else _walk(file, item, (*path, key))
        case _:
            return
