from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final, Protocol, TextIO

import httpx2

from aqven.app.instance import HttpServerProbe, ServerProbe, live_server
from aqven.app.locations import ProjectState
from aqven.app.runtime_file import ServerRecord
from aqven.client import ApiErrorResponse, AqvenClient, EventStreamLost, UnexpectedResponse
from aqven.console.command import PROGRAM
from aqven.console.run_watch import EXIT_FAILED, EventPrinter, watch_run
from aqven.console.series_wait import failure_reason
from aqven.runtime import HumanWait, RunEvent, RunId, RunStartRequest

COMMAND: Final = "run"
HTTP_TIMEOUT_SECONDS: Final = 60.0


class ServerLookup(Protocol):
    async def live(self, root: Path) -> ServerRecord | None: ...


@dataclass(frozen=True, slots=True)
class ProjectServers:
    probe: ServerProbe = field(default_factory=HttpServerProbe)

    async def live(self, root: Path) -> ServerRecord | None:
        return await live_server(ProjectState(root.resolve()), self.probe)


@dataclass(frozen=True, slots=True)
class ServerRun:
    client: AqvenClient
    run_id: RunId

    def events(self) -> AsyncIterator[RunEvent]:
        return self.client.run_events(self.run_id)

    async def waits(self) -> tuple[HumanWait, ...]:
        return (await self.client.get_run(self.run_id)).waits


def refusal_lines(failure: ApiErrorResponse) -> tuple[str, ...]:
    error = failure.error
    problems = tuple(
        f"  {'.'.join(str(part) for part in problem.path)}: {problem.message}" for problem in error.problems
    )
    return (f"{PROGRAM} {COMMAND}: {error.code}: {error.message}", *problems)


@dataclass(frozen=True, slots=True)
class ServerRunner:
    record: ServerRecord
    err: TextIO
    transport: httpx2.AsyncBaseTransport | None = None

    async def run(self, start: RunStartRequest, printer: EventPrinter) -> int:
        async with httpx2.AsyncClient(
            headers=self.record.authorization(),
            timeout=HTTP_TIMEOUT_SECONDS,
            trust_env=False,
            transport=self.transport,
        ) as http:
            try:
                return await self._follow(AqvenClient(self.record.url, http=http), start, printer)
            except ApiErrorResponse as failure:
                self._say(*refusal_lines(failure))
            except EventStreamLost as lost:
                self._say(f"{PROGRAM} {COMMAND}: {lost}; the run goes on in the project server {self.record.url}")
            except (httpx2.TransportError, UnexpectedResponse) as failure:
                reason = failure_reason(failure)
                self._say(f"{PROGRAM} {COMMAND}: the project server {self.record.url} did not answer: {reason}")
        return EXIT_FAILED

    async def _follow(self, client: AqvenClient, start: RunStartRequest, printer: EventPrinter) -> int:
        self._say(f"{PROGRAM} {COMMAND}: through the project server {self.record.url}")
        started = await client.start_run(start)
        self._say(f"run {started.run_id}")
        self._say(*(f"{PROGRAM} {COMMAND}: {warning.code}: {warning.message}" for warning in started.warnings))
        return await watch_run(ServerRun(client, started.run_id), printer)

    def _say(self, *lines: str) -> None:
        for line in lines:
            print(line, file=self.err, flush=True)
