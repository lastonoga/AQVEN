from dataclasses import dataclass, field
from functools import partial

from aqven.app.console_log.observers import (
    Followers,
    ObservedEngineFacade,
    ObservedSeriesJobs,
    RunWatch,
    SeriesWatch,
    WorkspaceAgentFiles,
    console_lifespan,
)
from aqven.app.observation import ObservationTargets, ObservedLaunch


@dataclass(frozen=True, slots=True)
class DevConsoleObserver:
    followers: Followers = field(default_factory=Followers)

    def observe(self, targets: ObservationTargets) -> ObservedLaunch:
        runs = RunWatch(
            engine=targets.engine,
            followers=self.followers,
            agent_files=WorkspaceAgentFiles(targets.workspace),
            studio_url=targets.studio_url,
        )
        series = SeriesWatch(jobs=targets.series, followers=self.followers, studio_url=targets.studio_url)
        return ObservedLaunch(
            engine=ObservedEngineFacade(targets.engine, runs),
            series=ObservedSeriesJobs(targets.series, series),
            lifespan=partial(console_lifespan, self.followers),
        )
