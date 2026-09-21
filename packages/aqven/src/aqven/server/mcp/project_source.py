import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Protocol

from aqven.loader import LoadedProject, load_project
from aqven.server.errors import ApiFailure, diagnostic_problem

PROJECT_UNLOADED: Final = "project did not load: aqven.yaml is missing or could not be parsed"


class ProjectSource(Protocol):
    async def load(self) -> LoadedProject: ...


@dataclass(frozen=True, slots=True)
class LoaderProjectSource:
    root: Path

    async def load(self) -> LoadedProject:
        result = await asyncio.to_thread(load_project, self.root)
        if result.project is None:
            problems = tuple(diagnostic_problem(item) for item in result.diagnostics)
            raise ApiFailure("NOT_RUNNABLE", PROJECT_UNLOADED, problems=problems)
        return result.project
