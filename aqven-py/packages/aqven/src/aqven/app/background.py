import asyncio
import subprocess
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Protocol

from aqven.app.host_os import OWNER_ONLY_FILE, detach_options, ensure_private_file, restrict
from aqven.app.instance import HttpServerProbe, ServerProbe, live_server
from aqven.app.locations import ProjectState
from aqven.app.options import POLL_SECONDS, STARTUP_TIMEOUT_SECONDS
from aqven.app.runtime_file import ServerRecord

HEADLESS_SERVER_COMMAND: Final = (sys.executable, "-P", "-m", "aqven", "serve", "--headless", "--no-browser")
LOG_TAIL_BYTES: Final = 4000
CLEAN_EXIT: Final = 0


class LaunchedServer(Protocol):
    def poll(self) -> int | None: ...


class ServerLauncher(Protocol):
    def launch(self, state: ProjectState, arguments: Sequence[str]) -> LaunchedServer: ...


class BackgroundStartFailed(RuntimeError):
    def __init__(self, root: Path, reason: str, log_tail: str) -> None:
        super().__init__(f"background aqven server for {root} did not start: {reason}\n{log_tail}".rstrip())
        self.root = root
        self.reason = reason
        self.log_tail = log_tail


def log_tail(path: Path, limit: int = LOG_TAIL_BYTES) -> str:
    try:
        content = path.read_bytes()
    except OSError:
        return ""
    return content[-limit:].decode("utf-8", errors="replace")


@dataclass(frozen=True, slots=True)
class DetachedServerLauncher:
    command: tuple[str, ...] = HEADLESS_SERVER_COMMAND

    def launch(self, state: ProjectState, arguments: Sequence[str]) -> subprocess.Popen[bytes]:
        log_path = ensure_private_file(state.server_log)
        options = detach_options()
        with log_path.open("ab") as log:
            process = subprocess.Popen(
                [*self.command, *arguments],
                cwd=state.root,
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=subprocess.STDOUT,
                start_new_session=options.new_session,
                creationflags=options.creation_flags,
            )
        restrict(log_path, OWNER_ONLY_FILE)
        return process


@dataclass(frozen=True, slots=True)
class BackgroundServer:
    launcher: ServerLauncher = DetachedServerLauncher()
    probe: ServerProbe = HttpServerProbe()
    timeout_seconds: float = STARTUP_TIMEOUT_SECONDS
    poll_seconds: float = POLL_SECONDS

    async def ensure(self, root: Path, arguments: Sequence[str] = ()) -> ServerRecord:
        state = ProjectState(root.resolve())
        existing = await live_server(state, self.probe)
        if existing is not None:
            return existing
        state.ensure()
        launched = self.launcher.launch(state, ("--root", str(state.root), *arguments))
        try:
            async with asyncio.timeout(self.timeout_seconds):
                return await self._ready(state, launched)
        except TimeoutError as error:
            reason = f"server was not ready within {self.timeout_seconds} s"
            raise BackgroundStartFailed(state.root, reason, log_tail(state.server_log)) from error

    async def _ready(self, state: ProjectState, launched: LaunchedServer) -> ServerRecord:
        while (record := await live_server(state, self.probe)) is None:
            self._raise_if_failed(state, launched)
            await asyncio.sleep(self.poll_seconds)
        return record

    def _raise_if_failed(self, state: ProjectState, launched: LaunchedServer) -> None:
        exit_code = launched.poll()
        if exit_code is None or exit_code == CLEAN_EXIT:
            return
        reason = f"process exited with code {exit_code}"
        raise BackgroundStartFailed(state.root, reason, log_tail(state.server_log))
