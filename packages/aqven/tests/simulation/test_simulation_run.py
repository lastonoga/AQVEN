import asyncio
from pathlib import Path
from types import ModuleType
from typing import Final

import httpx2
import pytest
from pydantic import BaseModel, JsonValue
from simulation_project import break_code, project_plan, project_report, simulation_project

from aqven.check.simulation import SimulationOptions, simulate_project, simulation_engine
from aqven.check.simulation.cache import (
    FlowEntry,
    SimulationCache,
    aqven_version,
    cache_file,
    code_digest,
    flow_key,
    read_cache,
    write_cache,
)
from aqven.check.simulation.model import SimulatedModelFactories
from aqven.check.simulation.runner import (
    NetworkBlocked,
    SimulationRunner,
    blocked_transport,
    simulation_environment,
    simulation_plan,
)
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.engine import configure_local_engines, shutdown_local_engines
from aqven.engine.assembly import standard_engine_setup
from aqven.engine.errors import CodeLoadError
from aqven.engine.loading import CodeLoader
from aqven.runtime import NodeStarted, Project, RunOptions, node_output
from aqven.spec import FlowId

FLOW: Final = FlowId("intake")
NODES: Final = frozenset(
    {"clean", "reply", "review", "review__recheck", "review__recheck__redo", "review__recheck__trim"}
)
WARM_REPLY: Final[dict[str, JsonValue]] = {"text": "warm answer", "mood": "warm", "score": 0.4}


def codes(found: tuple[Diagnostic, ...]) -> list[DiagnosticCode]:
    return [item.code for item in found]


def test_simulation_of_a_valid_project_reports_nothing(tmp_path: Path) -> None:
    root = simulation_project(tmp_path, "sim_shop_clean")
    assert simulate_project(project_report(root), SimulationOptions(use_cache=False)) == ()


def test_every_node_runs_in_a_simulated_pass(tmp_path: Path) -> None:
    root = simulation_project(tmp_path, "sim_shop_cover")
    plan = simulation_plan(project_plan(root))

    async def scenario() -> None:
        with simulation_engine(root, tmp_path / "state") as facade:
            result = await SimulationRunner(facade=facade, plan=plan).flow(FLOW)
        assert [item.name for item in result.passes] == ["base", "review:warm"]
        assert result.passes[0].executed == frozenset({"clean", "reply", "review"})
        assert result.executed == NODES

    asyncio.run(scenario())


def test_failing_code_node_is_reported_at_its_file(tmp_path: Path) -> None:
    root = simulation_project(tmp_path, "sim_shop_broken")
    break_code(root)
    found = simulate_project(project_report(root), SimulationOptions(use_cache=False))
    assert codes(found) == [DiagnosticCode.E_SIM_NODE_FAILED]
    failure = found[0]
    assert failure.file == "flows/intake/nodes/review/trim.node.yaml"
    assert "broken node" in failure.message
    assert failure.hint is not None
    assert "simulated flow input" in failure.hint


def test_simulation_waits_for_a_valid_static_report(tmp_path: Path) -> None:
    root = simulation_project(tmp_path, "sim_shop_invalid")
    (root / "flows/intake/flow.yaml").write_text('apiVersion: "aqven/v1"\nkind: "Flow"\n', encoding="utf-8")
    assert simulate_project(project_report(root), SimulationOptions(use_cache=False)) == ()


def test_cached_flow_is_not_simulated_again(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = simulation_project(tmp_path, "sim_shop_cache")
    first = simulate_project(project_report(root))
    assert first == ()
    stored = read_cache(cache_file(root))
    plan = project_plan(root)
    assert stored.flows[FLOW].key == flow_key(plan, FLOW, code_digest(root), aqven_version())

    def refuse(*arguments: object, **keywords: object) -> None:
        raise AssertionError("the engine must not start for a cached flow")

    monkeypatch.setattr("aqven.check.simulation.simulation_engine", refuse)
    assert simulate_project(project_report(root)) == ()


def test_changed_code_invalidates_the_cache(tmp_path: Path) -> None:
    root = simulation_project(tmp_path, "sim_shop_stale")
    plan = project_plan(root)
    before = flow_key(plan, FLOW, code_digest(root), aqven_version())
    break_code(root)
    broken = flow_key(plan, FLOW, code_digest(root), aqven_version())
    assert broken != before
    (root / "notes.txt").write_text("nothing to see", encoding="utf-8")
    assert flow_key(plan, FLOW, code_digest(root), aqven_version()) == broken
    assert flow_key(plan, FLOW, code_digest(root), "9.9.9") != broken


def test_simulation_cache_survives_a_second_check(tmp_path: Path) -> None:
    root = simulation_project(tmp_path, "sim_shop_repeat")
    break_code(root)
    first = simulate_project(project_report(root))
    second = simulate_project(project_report(root))
    assert codes(first) == [DiagnosticCode.E_SIM_NODE_FAILED]
    assert second == first


def test_tool_transport_refuses_every_request() -> None:
    transport = blocked_transport()
    assert isinstance(transport, httpx2.MockTransport)
    with pytest.raises(NetworkBlocked):
        transport.handler(httpx2.Request("GET", "https://example.com/a"))


def test_node_output_override_forces_a_branch(tmp_path: Path) -> None:
    root = simulation_project(tmp_path, "sim_shop_override")
    setup = standard_engine_setup(
        environ=simulation_environment(), state_dir=tmp_path / "state", factories=SimulatedModelFactories()
    )
    configure_local_engines(setup)

    async def scenario() -> list[str]:
        project = Project.load(root)
        handle = project.flow(FLOW)
        options = RunOptions(outputs=(node_output("reply", WARM_REPLY),))
        run = await handle.start(_input(handle.input_model, {"text": "hello"}), options)
        result = await run.result()
        assert result.status == "completed"
        return [event.address.node_id async for event in run.events() if isinstance(event, NodeStarted)]

    try:
        started = asyncio.run(scenario())
    finally:
        shutdown_local_engines()
        configure_local_engines(standard_engine_setup())
    assert "review__recheck" in started
    assert "review__recheck__redo" in started


def _input[I: BaseModel](model: type[I], payload: dict[str, str]) -> I:
    return model.model_validate(payload)


def test_an_import_failure_is_never_cached(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = simulation_project(tmp_path, "sim_shop_import")

    def refuse(self: CodeLoader, module_name: str, ref: str) -> ModuleType:
        raise CodeLoadError(ref, f"ModuleNotFoundError: No module named {module_name!r}")

    with monkeypatch.context() as broken:
        broken.setattr(CodeLoader, "module", refuse)
        first = simulate_project(project_report(root))

    assert DiagnosticCode.E_SIM_NODE_FAILED in codes(first)
    assert read_cache(cache_file(root)).flows == {}
    assert simulate_project(project_report(root)) == ()


def test_no_cache_rewrites_the_stored_entry(tmp_path: Path) -> None:
    root = simulation_project(tmp_path, "sim_shop_refresh")
    assert simulate_project(project_report(root)) == ()
    key = flow_key(project_plan(root), FLOW, code_digest(root), aqven_version())
    stale = diagnostic(DiagnosticCode.E_SIM_NODE_FAILED, "flows/intake/flow.yaml", (), "stale failure")
    write_cache(cache_file(root), SimulationCache(flows={FLOW: FlowEntry(key=key, diagnostics=(stale,))}))

    assert simulate_project(project_report(root)) == (stale,)
    assert simulate_project(project_report(root), SimulationOptions(use_cache=False)) == ()
    assert read_cache(cache_file(root)).flows[FLOW].diagnostics == ()
