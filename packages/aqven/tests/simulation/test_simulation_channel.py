import asyncio
import io
import sys
from collections.abc import Sequence
from contextlib import redirect_stdout
from dataclasses import dataclass
from pathlib import Path
from typing import Final

import pytest
from simulation_project import break_code, simulation_project

from aqven.check.simulation.report import PROJECT_FILE
from aqven.cli import main
from aqven.console.command import EXIT_FAILED, EXIT_OK
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.server import ProjectWorkspace, SpecEventHub
from aqven.server.mcp.check_tools import AqvenCheckInput, RunnerSettings, check_command
from aqven.server.mcp.paths import ProjectPaths
from aqven.server.mcp.processes import ProcessOutcome
from aqven.server.simulation import SubprocessSimulation, parse_diagnostics
from aqven.server.spec_channel import DiagnosticsChanged, SimulationFeed, watch_project

TRIM_FILE: Final = "flows/intake/nodes/review/trim.node.yaml"
SIMULATED: Final = diagnostic(DiagnosticCode.E_SIM_NODE_FAILED, TRIM_FILE, ("node",), "node trim failed")


@dataclass(frozen=True, slots=True)
class FakeRunner:
    async def run(self, argv: Sequence[str], *, cwd: Path, timeout_seconds: float) -> ProcessOutcome:
        return ProcessOutcome(exit_code=0, stdout="", stderr="", duration_ms=0, timed_out=False)


@dataclass(frozen=True, slots=True)
class FakeSimulation:
    found: tuple[Diagnostic, ...]

    async def __call__(self) -> tuple[Diagnostic, ...]:
        return self.found


def test_hub_publishes_simulation_diagnostics(tmp_path: Path) -> None:
    root = simulation_project(tmp_path, "sim_shop_channel")

    async def scenario() -> None:
        feed = SimulationFeed(FakeSimulation((SIMULATED,)))
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
        feed = SimulationFeed(FakeSimulation((SIMULATED,)))
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
