import asyncio
import io
import os
import sys
import time
from collections.abc import Sequence
from contextlib import redirect_stdout
from dataclasses import dataclass
from pathlib import Path
from typing import Final

import pytest
from simulation_project import break_code, simulation_project

from aqven.check import CheckReport
from aqven.check.simulation.report import PROJECT_FILE
from aqven.cli import main
from aqven.console.command import EXIT_FAILED, EXIT_OK
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.server import ProjectWorkspace, SpecEventHub
from aqven.server import workspace as workspace_module
from aqven.server.mcp.check_tools import AqvenCheckInput, RunnerSettings, check_command
from aqven.server.mcp.paths import ProjectPaths
from aqven.server.mcp.processes import ProcessOutcome
from aqven.server.simulation import SubprocessSimulation, parse_diagnostics
from aqven.server.spec_channel import DiagnosticsChanged, SimulationFeed, watch_project

TRIM_FILE: Final = "flows/intake/nodes/review/trim.node.yaml"
SIMULATED: Final = diagnostic(DiagnosticCode.E_SIM_NODE_FAILED, TRIM_FILE, ("node",), "node trim failed")
SLEEPING_PYTHON: Final = "#!/bin/sh\necho $$ > simulation.pid\nexec sleep 30\n"
PID_FILE: Final = "simulation.pid"


@dataclass(frozen=True, slots=True)
class FakeRunner:
    async def run(self, argv: Sequence[str], *, cwd: Path, timeout_seconds: float) -> ProcessOutcome:
        return ProcessOutcome(exit_code=0, stdout="", stderr="", duration_ms=0, timed_out=False)


@dataclass(frozen=True, slots=True)
class FakeSimulation:
    found: tuple[Diagnostic, ...]

    async def __call__(self) -> tuple[Diagnostic, ...]:
        return self.found


@dataclass(slots=True)
class TrackedSimulation:
    run_seconds: float
    reap_seconds: float
    starts: int = 0
    running: int = 0
    most: int = 0

    async def __call__(self) -> tuple[Diagnostic, ...]:
        self.starts += 1
        self.running += 1
        self.most = max(self.most, self.running)
        try:
            await asyncio.sleep(self.run_seconds)
        finally:
            await asyncio.sleep(self.reap_seconds)
            self.running -= 1
        return ()


def test_hub_publishes_simulation_diagnostics(tmp_path: Path) -> None:
    root = simulation_project(tmp_path, "sim_shop_channel")

    async def scenario() -> None:
        feed = SimulationFeed(FakeSimulation((SIMULATED,)), delay_seconds=0.0)
        hub = SpecEventHub(ProjectWorkspace(root), simulation=feed)
        await hub.prime()
        assert feed.task is not None
        await feed.task
        assert hub.simulated == (SIMULATED,)
        published = [event for event in hub.events if isinstance(event, DiagnosticsChanged)]
        assert [event.flow_id for event in published] == ["intake"]
        assert published[0].problems.error == 1

    asyncio.run(scenario())


def test_stale_simulation_results_are_dropped(tmp_path: Path) -> None:
    root = simulation_project(tmp_path, "sim_shop_stale_hash")

    async def scenario() -> None:
        hub = SpecEventHub(ProjectWorkspace(root))
        await hub.prime()
        assert await hub.apply_simulation("sha256-other", (SIMULATED,)) == ()
        assert hub.simulated == ()

    asyncio.run(scenario())


def test_a_file_change_clears_the_previous_simulation(tmp_path: Path) -> None:
    root = simulation_project(tmp_path, "sim_shop_change")

    async def scenario() -> None:
        feed = SimulationFeed(FakeSimulation((SIMULATED,)), delay_seconds=0.0)
        hub = SpecEventHub(ProjectWorkspace(root), simulation=feed)
        await hub.prime()
        assert feed.task is not None
        await feed.task
        (root / "fragments/extra.md").write_text("more", encoding="utf-8")
        await hub.refresh()
        assert hub.simulated == ()
        assert feed.task is not None
        await feed.task
        assert hub.simulated == (SIMULATED,)

    asyncio.run(scenario())


def test_watcher_attaches_a_subprocess_simulation(tmp_path: Path) -> None:
    root = simulation_project(tmp_path, "sim_shop_watch")

    async def scenario() -> None:
        hub = SpecEventHub(ProjectWorkspace(root), simulation=SimulationFeed(FakeSimulation(())))
        stop = asyncio.Event()
        stop.set()
        await watch_project(hub, root, stop, simulate=True)
        assert isinstance(hub.simulation, SimulationFeed)
        assert isinstance(hub.simulation.run, FakeSimulation)
        empty = SpecEventHub(ProjectWorkspace(root))
        await watch_project(empty, root, stop, simulate=False)
        assert empty.simulation is None

    asyncio.run(scenario())


def test_subprocess_simulation_reports_node_failures(tmp_path: Path) -> None:
    root = simulation_project(tmp_path, "sim_shop_subprocess")
    break_code(root)

    async def scenario() -> tuple[Diagnostic, ...]:
        return await SubprocessSimulation(root, python=sys.executable)()

    found = asyncio.run(scenario())
    assert [item.code for item in found] == [DiagnosticCode.E_SIM_NODE_FAILED]
    assert found[0].file == TRIM_FILE


def test_broken_simulation_output_is_ignored() -> None:
    assert parse_diagnostics(b"not json") == ()
    assert parse_diagnostics(b'{"diagnostics": []}') == ()


def test_mcp_check_runs_both_stages_by_default(tmp_path: Path) -> None:
    settings = RunnerSettings(paths=ProjectPaths.of(tmp_path, tmp_path), runner=FakeRunner(), python=sys.executable)
    assert AqvenCheckInput().static is False
    assert "--static" not in check_command(settings)
    assert "--static" in check_command(settings, static=True)


def checked(arguments: list[str]) -> tuple[int, str]:
    printed = io.StringIO()
    with redirect_stdout(printed):
        code = main(arguments)
    return code, printed.getvalue()


def test_check_command_skips_the_simulation_with_static(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = simulation_project(tmp_path, "sim_shop_cli")
    break_code(root)

    def refuse(*arguments: object, **keywords: object) -> None:
        raise AssertionError("--static must not simulate")

    monkeypatch.setattr("aqven.check.simulation.simulate_project", refuse)
    code, printed = checked(["check", str(root), "--static"])
    assert code == EXIT_OK
    assert "E_SIM" not in printed


def test_check_command_fails_when_a_simulated_node_fails(tmp_path: Path) -> None:
    root = simulation_project(tmp_path, "sim_shop_cli_fail")
    break_code(root)
    code, printed = checked(["check", str(root)])
    assert code == EXIT_FAILED
    assert "E_SIM_NODE_FAILED" in printed
    assert PROJECT_FILE not in printed


def test_simulation_only_prints_no_static_diagnostics(tmp_path: Path) -> None:
    root = simulation_project(tmp_path, "sim_shop_cli_only")
    code, printed = checked(["check", str(root), "--simulation-only", "--no-cache"])
    assert code == EXIT_OK
    assert printed.strip() == "errors: 0, warnings: 0"


def test_cancelling_a_simulation_kills_its_process(tmp_path: Path) -> None:
    python = tmp_path / "sleeping-python"
    python.write_text(SLEEPING_PYTHON, encoding="utf-8")
    python.chmod(0o755)
    root = tmp_path / "project"
    root.mkdir()
    pid_file = root / PID_FILE

    async def scenario() -> int:
        task = asyncio.create_task(SubprocessSimulation(root, python=str(python))())
        async with asyncio.timeout(10):
            while not pid_file.is_file() or not pid_file.read_text(encoding="utf-8").strip():
                await asyncio.sleep(0.02)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        return int(pid_file.read_text(encoding="utf-8"))

    pid = asyncio.run(scenario())
    with pytest.raises(ProcessLookupError):
        os.kill(pid, 0)


def test_two_quick_schedules_start_one_simulation() -> None:
    async def scenario() -> TrackedSimulation:
        tracked = TrackedSimulation(run_seconds=0.01, reap_seconds=0.0)
        feed = SimulationFeed(tracked, delay_seconds=0.1)
        hub = SpecEventHub(ProjectWorkspace(Path("unused")), simulation=feed)
        feed.schedule(hub, "sha256-first")
        await asyncio.sleep(0.03)
        feed.schedule(hub, "sha256-second")
        assert feed.task is not None
        await feed.task
        return tracked

    tracked = asyncio.run(scenario())
    assert tracked.starts == 1


def test_a_new_simulation_starts_only_after_the_cancelled_one_is_reaped() -> None:
    async def scenario() -> TrackedSimulation:
        tracked = TrackedSimulation(run_seconds=5.0, reap_seconds=0.1)
        feed = SimulationFeed(tracked, delay_seconds=0.0)
        hub = SpecEventHub(ProjectWorkspace(Path("unused")), simulation=feed)
        feed.schedule(hub, "sha256-first")
        await asyncio.sleep(0.05)
        tracked.run_seconds = 0.01
        feed.schedule(hub, "sha256-second")
        assert feed.task is not None
        await feed.task
        return tracked

    tracked = asyncio.run(scenario())
    assert (tracked.starts, tracked.most) == (2, 1)


def test_a_closed_hub_schedules_no_simulation(tmp_path: Path) -> None:
    root = simulation_project(tmp_path, "sim_shop_closed")

    async def scenario() -> SimulationFeed:
        feed = SimulationFeed(FakeSimulation((SIMULATED,)), delay_seconds=0.0)
        hub = SpecEventHub(ProjectWorkspace(root), simulation=feed)
        await hub.close()
        await hub.prime()
        return feed

    assert asyncio.run(scenario()).task is None


def test_a_refresh_postpones_the_pending_simulation_until_the_tree_settles(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = simulation_project(tmp_path, "sim_shop_postpone")
    real = workspace_module.check_project

    def slow_rebuild(folder: Path) -> CheckReport:
        time.sleep(0.3)
        return real(folder)

    async def scenario() -> tuple[TrackedSimulation, SpecEventHub, str]:
        tracked = TrackedSimulation(run_seconds=0.0, reap_seconds=0.0)
        feed = SimulationFeed(tracked, delay_seconds=0.05)
        hub = SpecEventHub(ProjectWorkspace(root), simulation=feed)
        await hub.prime()
        primed = hub.snapshot.tree_hash
        (root / "fragments/extra.md").write_text("more", encoding="utf-8")
        monkeypatch.setattr(workspace_module, "check_project", slow_rebuild)
        await hub.refresh()
        assert feed.task is not None
        await feed.task
        return tracked, hub, primed

    tracked, hub, primed = asyncio.run(scenario())
    assert tracked.starts == 1
    assert hub.snapshot.tree_hash != primed


def test_a_refresh_without_changes_keeps_the_held_simulation(tmp_path: Path) -> None:
    root = simulation_project(tmp_path, "sim_shop_unchanged")

    async def scenario() -> TrackedSimulation:
        tracked = TrackedSimulation(run_seconds=0.0, reap_seconds=0.0)
        feed = SimulationFeed(tracked, delay_seconds=0.1)
        hub = SpecEventHub(ProjectWorkspace(root), simulation=feed)
        await hub.prime()
        assert await hub.refresh() == ()
        assert feed.task is not None
        await feed.task
        return tracked

    assert asyncio.run(scenario()).starts == 1
