import asyncio
import os
import signal
import subprocess
import sys
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

import httpx2
import pytest
from local_stubs import ENGINE_LOG, make_project

from aqven.app.background import BackgroundServer, BackgroundStartFailed, DetachedServerLauncher, LaunchedServer
from aqven.app.health import HEALTH_PATH
from aqven.app.host_os import OWNER_PERMISSIONS, permission_bits, process_alive
from aqven.app.instance import HttpServerProbe, await_live_server, live_server
from aqven.app.locations import ProjectState
from aqven.app.runtime_file import read_server_record

HARNESS: Final = Path(__file__).with_name("local_server_harness.py")
HARNESS_COMMAND: Final = (sys.executable, str(HARNESS), "--headless", "--no-browser")
EXIT_WAIT_SECONDS: Final = 20.0
START_TIMEOUT_SECONDS: Final = 30.0

pytestmark = pytest.mark.skipif(sys.platform == "win32", reason="POSIX signals and detached sessions")


@dataclass(slots=True)
class CountingLauncher:
    inner: DetachedServerLauncher = field(default_factory=lambda: DetachedServerLauncher(HARNESS_COMMAND))
    processes: list[subprocess.Popen[bytes]] = field(default_factory=list[subprocess.Popen[bytes]])

    def launch(self, state: ProjectState, arguments: Sequence[str]) -> LaunchedServer:
        launched = self.inner.launch(state, arguments)
        self.processes.append(launched)
        return launched


def harness_arguments(data_dir: Path) -> tuple[str, ...]:
    return ("--port", "0", "--data-dir", str(data_dir))


def stop_process(process: subprocess.Popen[bytes]) -> int:
    if process.poll() is None:
        process.send_signal(signal.SIGTERM)
    return process.wait(timeout=EXIT_WAIT_SECONDS)


@pytest.mark.asyncio
async def test_background_server_with_auth_starts_detached_reuses_and_stops_gracefully(tmp_path: Path) -> None:
    root = make_project(tmp_path / "project")
    launcher = CountingLauncher()
    background = BackgroundServer(launcher=launcher, timeout_seconds=START_TIMEOUT_SECONDS)
    arguments = (*harness_arguments(tmp_path / "data"), "--require-auth")
    record = await background.ensure(root, arguments)
    try:
        again = await background.ensure(root, arguments)
        async with httpx2.AsyncClient(base_url=record.url, trust_env=False) as http:
            health = await http.get(HEALTH_PATH, headers=record.authorization())
            anonymous = await http.get("/api/echo")
        assert len(launcher.processes) == 1
        assert again == record
        assert record.pid == launcher.processes[0].pid
        assert os.getsid(record.pid) != os.getsid(0)
        assert health.json()["headless"] is True
        assert anonymous.status_code == 401
        if OWNER_PERMISSIONS:
            assert permission_bits(ProjectState(root).server_record) == 0o600
            assert permission_bits(ProjectState(root).server_log) == 0o600
    finally:
        exit_code = stop_process(launcher.processes[0])
    assert exit_code == 0
    assert read_server_record(ProjectState(root)) is None
    assert (root / ENGINE_LOG).read_text(encoding="utf-8") == "start\nstop\n"
    assert not process_alive(record.pid)


@pytest.mark.asyncio
async def test_concurrent_starts_leave_a_single_server(tmp_path: Path) -> None:
    root = make_project(tmp_path / "project")
    state = ProjectState(root)
    state.ensure()
    launcher = DetachedServerLauncher(HARNESS_COMMAND)
    arguments = ("--root", str(root), *harness_arguments(tmp_path / "data"))
    popen = [launcher.launch(state, arguments) for _ in range(3)]
    try:
        record = await await_live_server(
            state, HttpServerProbe(), timeout_seconds=START_TIMEOUT_SECONDS, poll_seconds=0.05
        )
        assert record is not None
        async with asyncio.timeout(EXIT_WAIT_SECONDS):
            while sum(process.poll() is None for process in popen) > 1:
                await asyncio.sleep(0.05)
        survivors = [process for process in popen if process.poll() is None]
        finished = [process.returncode for process in popen if process.poll() is not None]
        assert [process.pid for process in survivors] == [record.pid]
        assert finished == [0, 0]
        assert await live_server(state, HttpServerProbe()) == record
    finally:
        exit_codes = [stop_process(process) for process in popen]
    assert exit_codes.count(0) == 3
    assert read_server_record(state) is None


@pytest.mark.asyncio
async def test_sigint_also_stops_gracefully(tmp_path: Path) -> None:
    root = make_project(tmp_path / "project")
    launcher = CountingLauncher()
    record = await BackgroundServer(launcher=launcher).ensure(root, harness_arguments(tmp_path / "data"))
    process = launcher.processes[0]
    process.send_signal(signal.SIGINT)
    assert process.wait(timeout=EXIT_WAIT_SECONDS) == 0
    assert read_server_record(ProjectState(root)) is None
    assert not process_alive(record.pid)


@pytest.mark.asyncio
async def test_failed_background_start_reports_exit_code_and_log(tmp_path: Path) -> None:
    root = make_project(tmp_path / "project")
    failing = DetachedServerLauncher((sys.executable, "-c", "import sys; print('boom-from-server'); sys.exit(3)"))
    background = BackgroundServer(launcher=failing, timeout_seconds=START_TIMEOUT_SECONDS, poll_seconds=0.05)
    with pytest.raises(BackgroundStartFailed) as failure:
        await background.ensure(root)
    assert "3" in failure.value.reason
    assert "boom-from-server" in failure.value.log_tail


@pytest.mark.asyncio
async def test_background_start_times_out_when_server_never_becomes_healthy(tmp_path: Path) -> None:
    root = make_project(tmp_path / "project")
    silent = DetachedServerLauncher((sys.executable, "-c", "import time; time.sleep(5)"))
    background = BackgroundServer(launcher=silent, timeout_seconds=0.5, poll_seconds=0.05)
    with pytest.raises(BackgroundStartFailed) as failure:
        await background.ensure(root)
    assert "0.5" in failure.value.reason


def test_foreground_second_instance_exits_as_reused(tmp_path: Path) -> None:
    root = make_project(tmp_path / "project")
    launcher = CountingLauncher()
    record = asyncio.run(BackgroundServer(launcher=launcher).ensure(root, harness_arguments(tmp_path / "data")))
    try:
        second = subprocess.run(
            [*HARNESS_COMMAND, "--root", str(root), *harness_arguments(tmp_path / "data")],
            capture_output=True,
            text=True,
            timeout=EXIT_WAIT_SECONDS,
            check=False,
        )
    finally:
        stop_process(launcher.processes[0])
    assert second.returncode == 0
    assert f"reused {record.pid}" in second.stdout
