from collections.abc import Mapping
from dataclasses import dataclass

from aqven.engine.runtime import engine_blob_store
from aqven.ports.engine import EngineFacade
from aqven.ports.settings import SettingsStore
from aqven.runtime.runs import RunStarted, RunStartRequest
from aqven.server.case_media import BlobWriters, case_media_resolver
from aqven.server.context import ServerContext
from aqven.server.run_inputs import check_start
from aqven.server.views.datasets import resolve_dataset_run
from aqven.server.views.secrets import missing_secret_warnings
from aqven.server.workspace import ProjectWorkspace


@dataclass(frozen=True, slots=True)
class RunStartService:
    facade: EngineFacade
    settings: SettingsStore
    workspace: ProjectWorkspace
    environ: Mapping[str, str]
    blobs: BlobWriters = engine_blob_store

    async def start(self, request: RunStartRequest) -> RunStarted:
        state = await self.workspace.state()
        resolved = await resolve_dataset_run(state, request, case_media_resolver(state.root, self.blobs))
        check_start(state, resolved)
        warnings = await missing_secret_warnings(self.settings, self.environ, state)
        started = await self.facade.start_run(resolved, dataset_item_id=request.dataset_item_id)
        return started.model_copy(update={"warnings": warnings})


def run_start_service(context: ServerContext) -> RunStartService:
    return RunStartService(
        facade=context.facade,
        settings=context.settings,
        workspace=context.workspace,
        environ=context.environ,
    )
