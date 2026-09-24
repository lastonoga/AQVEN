from collections.abc import Mapping
from dataclasses import dataclass
from importlib.metadata import PackageNotFoundError, version
from typing import Final

from aqven.ports.engine import EngineFacade
from aqven.ports.identity import local_user
from aqven.ports.settings import SettingsStore
from aqven.series.ports import SeriesJobs
from aqven.server.blobs import BlobFiles
from aqven.server.probes import StatusProbes
from aqven.server.spec_channel import SpecEventHub
from aqven.server.workspace import ProjectWorkspace
from aqven.write import WriteService
from aqven.write.model import WriteActor

ENGINE_DISTRIBUTION: Final = "aqven"
UNKNOWN_VERSION: Final = "0.0.0+unknown"
OPERATION_KEY: Final = "x-aqven-operation"
REST_ONLY_KEY: Final = "x-aqven-rest-only"
HUMAN_KIND: Final = "human"


def engine_version() -> str:
    try:
        return version(ENGINE_DISTRIBUTION)
    except PackageNotFoundError:
        return UNKNOWN_VERSION


def operation(name: str) -> dict[str, object]:
    return {OPERATION_KEY: name}


def rest_only(reason: str) -> dict[str, object]:
    return {REST_ONLY_KEY: reason}


@dataclass(frozen=True, slots=True)
class ServerContext:
    facade: EngineFacade
    settings: SettingsStore
    workspace: ProjectWorkspace
    hub: SpecEventHub
    blobs: BlobFiles
    environ: Mapping[str, str]
    engine_version: str
    mcp_url: str | None
    probes: StatusProbes
    writer: WriteService
    series: SeriesJobs | None = None

    async def human(self) -> WriteActor:
        user = await local_user(self.settings, self.environ)
        return WriteActor(kind=HUMAN_KIND, id=user.assignee)
