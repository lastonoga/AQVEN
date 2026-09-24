from dataclasses import dataclass
from pathlib import Path

from aqven.app.locations import ProjectState
from aqven.engine.runtime import RUNTIME_SLOT
from aqven.ports.settings import SettingsStore
from aqven.runtime.address import RunId
from aqven.runtime.human import OpenWaitFilter
from aqven.series.feed import SILENT_FEED, ResearchFeed
from aqven.series.observed import ObservedSeriesStore
from aqven.series.ports import FindingsSink, ModelPrices, OpenWaits, SeriesAnalyst, SeriesStore
from aqven.series.split import SplitAssigner, WorkspacePackage
from aqven.series.store import SqliteSeriesStore
from aqven.server.workspace import ProjectWorkspace


@dataclass(frozen=True, slots=True)
class SeriesServices:
    root: Path
    workspace: ProjectWorkspace
    settings: SettingsStore
    store: SeriesStore
    splits: SplitAssigner
    analyst: SeriesAnalyst
    findings: FindingsSink
    waits: OpenWaits
    prices: ModelPrices
    engine_version: str
    feed: ResearchFeed = SILENT_FEED


@dataclass(frozen=True, slots=True)
class RuntimeWaits:
    async def open_runs(self) -> frozenset[RunId]:
        runtime = RUNTIME_SLOT.current
        if runtime is None:
            return frozenset()
        return frozenset(await runtime.human_layer.open_runs(OpenWaitFilter()))


def build_series_services(
    root: Path,
    workspace: ProjectWorkspace,
    settings: SettingsStore,
    analyst: SeriesAnalyst,
    findings: FindingsSink,
    prices: ModelPrices,
    engine_version: str,
    feed: ResearchFeed = SILENT_FEED,
) -> SeriesServices:
    return SeriesServices(
        root=root,
        workspace=workspace,
        settings=settings,
        store=ObservedSeriesStore(SqliteSeriesStore.open(ProjectState(root).database), feed),
        splits=SplitAssigner(WorkspacePackage(workspace)),
        analyst=analyst,
        findings=findings,
        waits=RuntimeWaits(),
        prices=prices,
        engine_version=engine_version,
        feed=feed,
    )
