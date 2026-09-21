import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

from aqven.engine.assembly.approvals import HumanApprovalGate
from aqven.engine.assembly.code import GeneratedForms, LoaderCode, LoaderInferenceModels, LoaderTypes
from aqven.engine.assembly.models import (
    EngineModelSource,
    FaultingModel,
    ModelFactories,
    ProjectModelFactories,
    ProviderKeys,
)
from aqven.engine.assembly.steps import LLM_SEGMENT_STEP, LLM_TOOL_CALL_STEP, DbosSegmentSteps
from aqven.engine.assembly.tools import (
    BlobMediaLoader,
    BlobMediaStore,
    EngineSecrets,
    EngineToolContexts,
    RunMcpServers,
)
from aqven.engine.branches import BranchSupervisor, branch_supervisor
from aqven.engine.control import control_executors
from aqven.engine.executors.tool import ToolContextFactory
from aqven.engine.extensions import EngineExtensions
from aqven.engine.human import (
    HumanNodeExecutor,
    HumanWaits,
    ModelFormRegistry,
    SqliteWaitIndex,
)
from aqven.engine.human.approval import ToolApprovalGate
from aqven.engine.human.dbos_adapters import DbosAnswerChannel, DbosStatusReader, DbosWaitJournal, IndexedRunStatus
from aqven.engine.lifecycle import EngineSetup
from aqven.engine.llm import FAILURE_BY_EXCEPTION, LlmDependencies, LlmFailureCode, llm_node_executor
from aqven.engine.llm.tools import LiveMcpServers
from aqven.engine.policies import PolicyFactory
from aqven.engine.runtime import ToolServices
from aqven.models import AmbiguousReplay, CassetteMiss, RefusedOutput, TruncatedOutput
from aqven.ports.settings import SettingsStore

WAITS_DATABASE: Final = "aqven.sqlite"

ENGINE_FAILURES: Final[Mapping[type[BaseException], LlmFailureCode]] = {
    **FAILURE_BY_EXCEPTION,
    TruncatedOutput: LlmFailureCode.TRUNCATED,
    RefusedOutput: LlmFailureCode.REFUSAL,
    CassetteMiss: LlmFailureCode.CASSETTE_MISS,
    AmbiguousReplay: LlmFailureCode.AMBIGUOUS_REPLAY,
}


@dataclass(frozen=True, slots=True)
class StandardExtensions:
    factories: ModelFactories = field(default_factory=ProjectModelFactories)

    def __call__(self, services: ToolServices) -> EngineExtensions:
        index = SqliteWaitIndex.open(services.paths.state / WAITS_DATABASE)
        journal = DbosWaitJournal(index)
        forms = ModelFormRegistry(GeneratedForms(services.loader, services.package).model)
        control = control_executors(policies=self.policies(services), supervisors=branch_supervisor)
        return EngineExtensions(
            llm=llm_node_executor(self.llm_dependencies(services, journal)),
            human=HumanNodeExecutor(journal, forms),
            parallel=control.parallel,
            map=control.map,
            loop=control.loop,
            human_layer=HumanWaits(
                index=index,
                channel=DbosAnswerChannel(),
                forms=forms,
                statuses=IndexedRunStatus(DbosStatusReader(), index),
            ),
        )

    def policies(self, services: ToolServices) -> PolicyFactory:
        return PolicyFactory(loader=LoaderCode(services.loader))

    def llm_dependencies(self, services: ToolServices, journal: DbosWaitJournal) -> LlmDependencies:
        return LlmDependencies(
            models=EngineModelSource(self.factories, ProviderKeys(services.settings, services.environ)),
            inference_models=LoaderInferenceModels(services.loader, services.package),
            tool_contexts=EngineToolContexts(ToolContextFactory(services)),
            approvals=HumanApprovalGate(ToolApprovalGate(journal)),
            code=LoaderCode(services.loader),
            secrets=EngineSecrets(services),
            media=BlobMediaLoader(services),
            steps=DbosSegmentSteps(),
            failures=ENGINE_FAILURES,
            mcp_servers=RunMcpServers(LiveMcpServers(EngineSecrets(services))),
            media_store=BlobMediaStore(services),
            types=LoaderTypes(services.loader),
        )


def process_environment() -> Mapping[str, str]:
    return os.environ


def standard_engine_setup(
    *,
    settings: SettingsStore | None = None,
    environ: Mapping[str, str] | None = None,
    state_dir: Path | None = None,
    factories: ModelFactories | None = None,
) -> EngineSetup:
    extensions = StandardExtensions() if factories is None else StandardExtensions(factories)
    return EngineSetup(
        settings=settings,
        environ=process_environment() if environ is None else environ,
        extensions=extensions,
        state_dir=state_dir,
    )


__all__ = [
    "ENGINE_FAILURES",
    "LLM_SEGMENT_STEP",
    "LLM_TOOL_CALL_STEP",
    "WAITS_DATABASE",
    "BlobMediaLoader",
    "BlobMediaStore",
    "BranchSupervisor",
    "DbosSegmentSteps",
    "EngineModelSource",
    "EngineSecrets",
    "EngineToolContexts",
    "FaultingModel",
    "GeneratedForms",
    "HumanApprovalGate",
    "LoaderCode",
    "LoaderInferenceModels",
    "LoaderTypes",
    "ModelFactories",
    "ProjectModelFactories",
    "ProviderKeys",
    "RunMcpServers",
    "StandardExtensions",
    "standard_engine_setup",
]
