from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from typing import Final, Literal

from aqven.app.secret_names import ProjectSecretNames
from aqven.loader import LoadedProject
from aqven.ports.models import model_provider
from aqven.ports.settings import EnvName, SettingKey, env_name
from aqven.spec import AgentSpec, ProviderName

SECRET_REF_PREFIX: Final = "ref:env/"
PROVIDER_SECRET_NAME: Final = "api_key"

type SecretScope = Literal["provider", "tool", "mcp_server"]


@dataclass(frozen=True, slots=True)
class SecretDeclaration:
    name: str
    env_var: EnvName
    declared_by: str
    scope: SecretScope
    declared_in: str
    setting_key: SettingKey


def env_of(ref: str) -> EnvName | None:
    return env_name(ref.removeprefix(SECRET_REF_PREFIX))


def agent_providers(spec: AgentSpec) -> Iterator[ProviderName]:
    for model in (spec.model, *(spec.fallback_models or ())):
        try:
            yield model_provider(model)
        except ValueError:
            continue


def used_providers(project: LoadedProject) -> tuple[ProviderName, ...]:
    declared = [spec.id for spec in project.project.spec.providers]
    referenced = [provider for source in project.agents.values() for provider in agent_providers(source.spec)]
    return tuple(dict.fromkeys((*declared, *referenced)))


def provider_declarations(project: LoadedProject, names: ProjectSecretNames) -> Iterator[SecretDeclaration]:
    for provider in used_providers(project):
        env_var = names.provider_env_var(provider)
        if env_var is None:
            continue
        yield SecretDeclaration(
            name=PROVIDER_SECRET_NAME,
            env_var=env_var,
            declared_by=provider,
            scope="provider",
            declared_in=project.project.path,
            setting_key=names.setting_key(env_var),
        )


def tool_declarations(project: LoadedProject, names: ProjectSecretNames) -> Iterator[SecretDeclaration]:
    for tool_id, source in sorted(project.tools.items()):
        for binding in source.spec.secrets or ():
            env_var = env_of(binding.ref)
            if env_var is None:
                continue
            yield SecretDeclaration(
                name=binding.name,
                env_var=env_var,
                declared_by=tool_id,
                scope="tool",
                declared_in=source.path,
                setting_key=names.setting_key(env_var),
            )


def mcp_declarations(project: LoadedProject, names: ProjectSecretNames) -> Iterator[SecretDeclaration]:
    for server_id, source in sorted(project.mcp_servers.items()):
        for header in source.spec.headers or ():
            env_var = env_of(header.value)
            if env_var is None:
                continue
            yield SecretDeclaration(
                name=header.name,
                env_var=env_var,
                declared_by=server_id,
                scope="mcp_server",
                declared_in=source.path,
                setting_key=names.setting_key(env_var),
            )


def declared_secrets(project: LoadedProject, names: ProjectSecretNames) -> tuple[SecretDeclaration, ...]:
    found = (
        *provider_declarations(project, names),
        *tool_declarations(project, names),
        *mcp_declarations(project, names),
    )
    return tuple(_distinct(found))


def _distinct(found: Sequence[SecretDeclaration]) -> Iterator[SecretDeclaration]:
    seen: set[tuple[str, str, str]] = set()
    for declaration in found:
        key = (declaration.scope, declaration.declared_by, declaration.env_var)
        if key in seen:
            continue
        seen.add(key)
        yield declaration
