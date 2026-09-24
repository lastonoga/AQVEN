from collections.abc import Mapping
from dataclasses import dataclass, field
from importlib.metadata import PackageNotFoundError, version
from typing import Final

from aqven.ports.engine import EngineFacade
from aqven.ports.settings import SettingsStore
from aqven.series.ports import SeriesJobs
from aqven.server.blobs import BlobFiles
from aqven.server.event_feeds import EventFeed, EventFeeds
from aqven.server.probes import StatusProbes
from aqven.server.spec_channel import SpecEventHub
from aqven.server.workspace import ProjectWorkspace

ENGINE_DISTRIBUTION: Final = "aqven"
UNKNOWN_VERSION: Final = "0.0.0+unknown"
OPERATION_KEY: Final = "x-aqven-operation"
REST_ONLY_KEY: Final = "x-aqven-rest-only"


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
    series: SeriesJobs | None = None
    feeds: EventFeeds = field(default_factory=dict[str, EventFeed])
