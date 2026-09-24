from collections.abc import Iterable, Iterator
from typing import Final

from pydantic_ai.profiles import ModelProfile as ProviderProfile
from pydantic_ai.profiles.openai import SAMPLING_PARAMS

from aqven.check.context import CheckContext, ResolvedAgent
from aqven.check.output_modes import provider_profile
from aqven.diagnostics import Diagnostic, DiagnosticCode, templated_diagnostic
from aqven.spec import ModelSettingsSpec

SETTINGS_KEY: Final = "settings"
REASONING_SAMPLING: Final[frozenset[str]] = frozenset(SAMPLING_PARAMS)


def reasons_on_every_request(profile: ProviderProfile) -> bool:
    if not profile.get("openai_supports_reasoning", False):
        return False
    if not profile.get("openai_supports_reasoning_effort_none", False):
        return True
    return bool(profile.get("openai_reasoning_enabled_by_default", False))


def declared_sampling(settings: ModelSettingsSpec | None) -> tuple[str, ...]:
    if settings is None:
        return ()
    declared = settings.model_dump(exclude_none=True, by_alias=False)
    return tuple(name for name in declared if name in REASONING_SAMPLING)


def ignored_sampling(model: str, settings: ModelSettingsSpec | None) -> tuple[str, ...]:
    if not reasons_on_every_request(provider_profile(model)):
        return ()
    return declared_sampling(settings)


def check_sampling(context: CheckContext) -> Iterable[Diagnostic]:
    return tuple(
        item
        for agent_id, resolved in context.agents.items()
        for item in _agent_diagnostics(context.project.agents[agent_id].path, resolved)
    )


def _agent_diagnostics(file: str, agent: ResolvedAgent) -> Iterator[Diagnostic]:
    return (
        templated_diagnostic(
            DiagnosticCode.W_SAMPLING_IGNORED,
            file,
            (SETTINGS_KEY, setting),
            {"setting": setting, "model": model.model},
        )
        for model in agent.models
        for setting in ignored_sampling(model.model, agent.agent.settings)
    )
