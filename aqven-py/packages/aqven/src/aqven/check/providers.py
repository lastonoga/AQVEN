from collections.abc import Callable, Iterable, Iterator, Mapping
from dataclasses import dataclass
from typing import Final

from aqven.check.context import CheckContext
from aqven.check.resolver import CodeFailure
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic, templated_diagnostic
from aqven.loader import LoadedProject, YamlPath
from aqven.spec import AgentSpec, ProviderKind, ProviderSpec
from aqven_llm import (
    OPENAI_COMPATIBLE_KIND,
    PROVIDERS,
    ProviderSupport,
    Readiness,
    factory_signature,
    installed_providers,
    provider_support,
)

type SupportLookup = Callable[[str], ProviderSupport | None]
type ReadinessDiagnostic = Callable[[str, YamlPath, str, ProviderSupport], tuple[Diagnostic, ...]]
type EntryCheck = Callable[[CheckContext, ProviderEntry], Iterator[Diagnostic]]

PROVIDER_SEPARATOR: Final = ":"
CODE_KIND: Final[ProviderKind] = "code"
RUN_HINT: Final = "write run: <module>:<function> of a factory (model_name: str, context: ProviderContext) -> Model"
BASE_URL_HINT: Final = "set base_url of the server, for example http://127.0.0.1:8000/v1"
ADAPTER_HINT: Final = (
    "declare kind: code with run: <module>:<function>, or kind: openai_compatible with base_url, "
    "or name one of the built-in providers"
)
RENAME_SUFFIX: Final = "_custom"


@dataclass(frozen=True, slots=True)
class ProviderEntry:
    file: str
    path: YamlPath
    spec: ProviderSpec

    def at(self, *keys: str) -> YamlPath:
        return (*self.path, *keys)


def check_providers(context: CheckContext) -> Iterable[Diagnostic]:
    entries = (item for entry in provider_entries(context) for item in ENTRY_CHECKS[entry.spec.kind](context, entry))
    return (*entries, *provider_diagnostics(context.project, provider_support))


def provider_entries(context: CheckContext) -> Iterator[ProviderEntry]:
    file = context.project_file
    for index, spec in enumerate(context.spec.providers):
        yield ProviderEntry(file, ("providers", index), spec)


def factory_invalid(entry: ProviderEntry, path: YamlPath, problem: str, fix: str) -> Diagnostic:
    values = {"provider": entry.spec.id, "problem": problem, "fix": fix}
    return templated_diagnostic(DiagnosticCode.E_PROVIDER_FACTORY_INVALID, entry.file, path, values)


def reserved_id(entry: ProviderEntry) -> Iterator[Diagnostic]:
    if entry.spec.id not in PROVIDERS:
        return
    values = {
        "provider": entry.spec.id,
        "kind": entry.spec.kind,
        "suggestion": f"{entry.spec.id}{RENAME_SUFFIX}",
    }
    yield templated_diagnostic(DiagnosticCode.E_PROVIDER_ID_RESERVED, entry.file, entry.at("id"), values)


def run_outside_code_kind(entry: ProviderEntry) -> Iterator[Diagnostic]:
    if entry.spec.run is None:
        return
    problem = f"run is only read with kind: {CODE_KIND}, and this entry declares kind: {entry.spec.kind}"
    yield factory_invalid(entry, entry.at("run"), problem, f"set kind: {CODE_KIND} or remove run")


def catalog_entry(context: CheckContext, entry: ProviderEntry) -> Iterator[Diagnostic]:
    yield from run_outside_code_kind(entry)
    provider = entry.spec.id
    if provider in PROVIDERS or provider in installed_providers():
        return
    message = f"provider {provider} is not a built-in provider and declares no adapter"
    yield diagnostic(DiagnosticCode.E_PROVIDER_UNKNOWN, entry.file, entry.at("id"), message, hint=ADAPTER_HINT)


def code_entry(context: CheckContext, entry: ProviderEntry) -> Iterator[Diagnostic]:
    yield from reserved_id(entry)
    run = entry.spec.run
    if run is None:
        yield factory_invalid(entry, entry.at("kind"), f"kind {CODE_KIND} needs run", RUN_HINT)
        return
    resolved = context.code.resolve(run)
    if isinstance(resolved, CodeFailure):
        yield factory_invalid(entry, entry.at("run"), f"{run} does not resolve: {resolved.message}", RUN_HINT)
        return
    signature = factory_signature(resolved.value)
    for problem in signature.problems:
        yield factory_invalid(entry, entry.at("run"), problem.message, problem.hint)
    if signature.streams is False:
        message = (
            f"provider {entry.spec.id}: the model class returned by {run} has no request_stream, "
            "and aqven streams every model request"
        )
        hint = "return a model class that implements request_stream"
        yield diagnostic(DiagnosticCode.E_PROVIDER_NO_STREAMING, entry.file, entry.at("run"), message, hint=hint)


def openai_compatible_entry(context: CheckContext, entry: ProviderEntry) -> Iterator[Diagnostic]:
    yield from reserved_id(entry)
    yield from run_outside_code_kind(entry)
    if entry.spec.base_url is not None:
        return
    problem = f"kind {OPENAI_COMPATIBLE_KIND} needs base_url"
    yield factory_invalid(entry, entry.at("kind"), problem, BASE_URL_HINT)


ENTRY_CHECKS: Final[Mapping[ProviderKind, EntryCheck]] = {
    "catalog": catalog_entry,
    "code": code_entry,
    "openai_compatible": openai_compatible_entry,
}


def provider_diagnostics(project: LoadedProject, lookup: SupportLookup) -> Iterator[Diagnostic]:
    for source in project.agents.values():
        for path, model in agent_models(source.spec):
            yield from model_diagnostics(source.path, path, model, lookup)


def agent_models(agent: AgentSpec) -> tuple[tuple[YamlPath, str], ...]:
    fallbacks = tuple((("fallback_models", index), model) for index, model in enumerate(agent.fallback_models or ()))
    return ((("model",), agent.model), *fallbacks)


def model_diagnostics(file: str, path: YamlPath, model: str, lookup: SupportLookup) -> tuple[Diagnostic, ...]:
    support = lookup(model.partition(PROVIDER_SEPARATOR)[0])
    if support is None:
        return ()
    return READINESS_DIAGNOSTICS[support.readiness](file, path, model, support)


def ready(_file: str, _path: YamlPath, _model: str, _support: ProviderSupport) -> tuple[Diagnostic, ...]:
    return ()


def no_streaming(file: str, path: YamlPath, model: str, support: ProviderSupport) -> tuple[Diagnostic, ...]:
    values = {"model": model, "provider": support.provider}
    return (templated_diagnostic(DiagnosticCode.E_PROVIDER_NO_STREAMING, file, path, values),)


def extra_missing(file: str, path: YamlPath, model: str, support: ProviderSupport) -> tuple[Diagnostic, ...]:
    values = {"model": model, "provider": support.provider, "extra": support.extra or support.provider}
    return (templated_diagnostic(DiagnosticCode.E_PROVIDER_EXTRA_MISSING, file, path, values),)


READINESS_DIAGNOSTICS: Final[Mapping[Readiness, ReadinessDiagnostic]] = {
    Readiness.READY: ready,
    Readiness.NO_STREAMING: no_streaming,
    Readiness.EXTRA_MISSING: extra_missing,
}
