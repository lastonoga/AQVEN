from collections.abc import Iterable, Iterator, Mapping
from dataclasses import dataclass
from typing import Final

from aqven.check.context import CheckContext, ResolvedAgent
from aqven.check.output_modes import provider_profile
from aqven.check.providers import agent_models
from aqven.diagnostics import Diagnostic, DiagnosticCode, templated_diagnostic
from aqven.loader import YamlPath
from aqven.spec import AgentId, ModelSettingsSpec
from aqven_llm import PROVIDERS, OptionsRequest, ProviderEntry, RequestOptions

PROVIDER_SEPARATOR: Final = ":"
KEY_SEPARATOR: Final = ", "
MODEL_PATH: Final[YamlPath] = ("model",)
OPTIONS_PATH: Final[YamlPath] = ("settings", "provider_options")
NO_OPTIONS: Final[RequestOptions] = {}


@dataclass(frozen=True, slots=True)
class IgnoredOptions:
    provider: str
    keys: tuple[str, ...]
    accepted: str


def request_options(settings: ModelSettingsSpec | None) -> RequestOptions:
    if settings is None or settings.provider_options is None:
        return NO_OPTIONS
    return settings.provider_options


def ignored_options(
    model: str, options: RequestOptions, catalog: Mapping[str, ProviderEntry] = PROVIDERS
) -> IgnoredOptions | None:
    provider = model.partition(PROVIDER_SEPARATOR)[0]
    entry = catalog.get(provider)
    if entry is None or not options:
        return None
    delivery = entry.request_options
    keys = delivery.split(OptionsRequest(options, provider_profile(model))).ignored
    return IgnoredOptions(provider, keys, delivery.describe()) if keys else None


def check_provider_options(context: CheckContext) -> Iterable[Diagnostic]:
    return tuple(
        item
        for agent_id, resolved in context.agents.items()
        for item in _agent_diagnostics(agent_id, context.project.agents[agent_id].path, resolved)
    )


def _agent_diagnostics(agent_id: AgentId, file: str, agent: ResolvedAgent) -> Iterator[Diagnostic]:
    options = request_options(agent.agent.settings)
    found = ((path, model, ignored_options(model, options)) for path, model in agent_models(agent.agent))
    return (_warning(agent_id, file, path, model, ignored) for path, model, ignored in found if ignored is not None)


def _warning(agent_id: AgentId, file: str, path: YamlPath, model: str, ignored: IgnoredOptions) -> Diagnostic:
    values = {
        "agent": agent_id,
        "model": model,
        "provider": ignored.provider,
        "keys": KEY_SEPARATOR.join(ignored.keys),
        "accepted": ignored.accepted,
    }
    location = OPTIONS_PATH if path == MODEL_PATH else path
    return templated_diagnostic(DiagnosticCode.W_PROVIDER_OPTIONS_IGNORED, file, location, values)
