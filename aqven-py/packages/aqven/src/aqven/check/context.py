from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Protocol

from aqven.check.graph import ProjectGraph
from aqven.check.resolver import CodeResolver
from aqven.check.scopes import RefResolver
from aqven.diagnostics import Diagnostic
from aqven.loader import Alias, LoadedProject, YamlPath
from aqven.spec import (
    AgentId,
    AgentSpec,
    InferenceId,
    InferenceSpec,
    ModelFamily,
    ModelProfile,
    ModelString,
    ProjectSpec,
    ProviderSpec,
    ToolId,
    ToolSpec,
    TypeModels,
    resolve_profile,
)

PROVIDER_SEPARATOR = ":"


@dataclass(frozen=True, slots=True)
class ResolvedModel:
    model: ModelString
    provider: ProviderSpec | None
    profile: ModelProfile


@dataclass(frozen=True, slots=True)
class ResolvedAgent:
    agent: AgentSpec
    models: tuple[ResolvedModel, ...]

    @property
    def family(self) -> ModelFamily:
        return self.models[0].profile.family

    @property
    def families(self) -> frozenset[ModelFamily]:
        return frozenset(model.profile.family for model in self.models)


@dataclass(frozen=True, slots=True)
class CheckContext:
    project: LoadedProject
    type_models: TypeModels
    code: CodeResolver
    graph: ProjectGraph
    refs: RefResolver
    agents: Mapping[AgentId, ResolvedAgent]

    @property
    def spec(self) -> ProjectSpec:
        return self.project.project.spec

    @property
    def project_file(self) -> str:
        return self.project.project.path

    def inference(self, inference_id: str | None) -> InferenceSpec | None:
        loaded = self.project.inferences.get(InferenceId(inference_id)) if inference_id is not None else None
        source = loaded.source if loaded is not None else None
        return source.spec if source is not None else None

    def alias(self, file: str, path: YamlPath) -> Alias | None:
        return self.project.aliases.get(file, {}).get(path)

    def alias_failed(self, file: str, path: YamlPath) -> bool:
        alias = self.alias(file, path)
        return alias is not None and alias.resolved is None

    def tool(self, tool_id: str) -> ToolSpec | None:
        source = self.project.tools.get(ToolId(tool_id))
        return source.spec if source is not None else None


class CheckRule(Protocol):
    def __call__(self, context: CheckContext) -> Iterable[Diagnostic]: ...


def resolve_agents(project: LoadedProject) -> Mapping[AgentId, ResolvedAgent]:
    providers = {provider.id.value: provider for provider in project.project.spec.providers}
    return {
        agent_id: ResolvedAgent(source.spec, _models(source.spec, providers))
        for agent_id, source in project.agents.items()
    }


def _models(agent: AgentSpec, providers: Mapping[str, ProviderSpec]) -> tuple[ResolvedModel, ...]:
    return tuple(
        ResolvedModel(
            model=model,
            provider=providers.get(model.partition(PROVIDER_SEPARATOR)[0]),
            profile=resolve_profile(model, agent.capabilities),
        )
        for model in (agent.model, *(agent.fallback_models or ()))
    )
