from collections.abc import Callable, Iterable, Iterator, Mapping
from typing import Final

from aqven.check.context import CheckContext
from aqven.diagnostics import Diagnostic, DiagnosticCode, templated_diagnostic
from aqven.loader import LoadedProject, YamlPath
from aqven.spec import AgentSpec
from aqven_llm import ProviderSupport, Readiness, provider_support

type SupportLookup = Callable[[str], ProviderSupport | None]
type ReadinessDiagnostic = Callable[[str, YamlPath, str, ProviderSupport], tuple[Diagnostic, ...]]

PROVIDER_SEPARATOR: Final = ":"


def check_providers(context: CheckContext) -> Iterable[Diagnostic]:
    return tuple(provider_diagnostics(context.project, provider_support))


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
