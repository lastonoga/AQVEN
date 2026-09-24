import asyncio
import threading
from dataclasses import dataclass, field
from pathlib import Path
from types import SimpleNamespace
from typing import cast

import pytest
from server_fakes import MemorySettings, copy_fixture

from aqven import compiler as compiler_module
from aqven.app.composition import ProjectAssembly, priced_engine_host
from aqven.app.engine_host import EngineLaunch
from aqven.check import CheckReport
from aqven.compiler import compile_project
from aqven.engine.facade import DbosEngineFacade
from aqven.engine.loading import CodeLoader
from aqven.engine.request import RunSpec
from aqven.engine.runtime import EngineRuntime, RunOverrides
from aqven.ir import CompiledProject
from aqven.runtime.address import JsonObject, RunId
from aqven.runtime.project import ProjectPlanSource
from aqven.runtime.runs import RunStarted, RunStartRequest
from aqven.server.views.runs import RunStartService
from aqven.server.workspace import ProjectWorkspace, WorkspacePlanSource

BODY = {"flow_id": "intake", "mode": "live", "input": {"text": "no second compile"}}


@dataclass(slots=True)
class CountingCompiler:
    compiled: list[CompiledProject] = field(default_factory=list[CompiledProject])

    def compile(self, report: CheckReport) -> CompiledProject:
        plan = compile_project(report)
        self.compiled.append(plan)
        return plan


def test_the_workspace_plan_source_reuses_the_compiled_state(tmp_path: Path) -> None:
    root = copy_fixture("standard_shop", tmp_path)
    compiler = CountingCompiler()
    workspace = ProjectWorkspace(root, compiler=compiler)

    async def scenario() -> tuple[CompiledProject | None, CompiledProject, CompiledProject]:
        state = await workspace.state()
        source = WorkspacePlanSource(workspace)
        return state.compiled, await source.current(), await source.current()

    compiled, first, second = asyncio.run(scenario())
    assert compiled is not None
    assert first is compiled and second is compiled
    assert len(compiler.compiled) == 1


def test_start_run_launches_the_workspace_compiled_state_without_compiling_again(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = copy_fixture("standard_shop", tmp_path)
    compiler = CountingCompiler()
    workspace = ProjectWorkspace(root, compiler=compiler)
    launched: list[CompiledProject] = []

    def refuse(*arguments: object) -> CompiledProject:
        raise AssertionError("start_run must not compile the project again")

    async def launch(
        self: DbosEngineFacade, plan: CompiledProject, spec: RunSpec, flow_input: JsonObject, overrides: RunOverrides
    ) -> RunStarted:
        launched.append(plan)
        return RunStarted(
            run_id=RunId("run-1"), status="running", content_hash="", spec_version_id="", last_seq=0, ui_url=""
        )

    monkeypatch.setattr(compiler_module, "compile_root", refuse)
    monkeypatch.setattr(DbosEngineFacade, "launch", launch)
    runtime = cast(EngineRuntime, SimpleNamespace(services=SimpleNamespace(loader=CodeLoader(root))))
    facade = DbosEngineFacade(runtime=runtime, plan_source=WorkspacePlanSource(workspace))
    service = RunStartService(facade=facade, settings=MemorySettings(), workspace=workspace, environ={})

    started = asyncio.run(service.start(RunStartRequest.model_validate(BODY)))

    assert started.run_id == "run-1"
    assert len(compiler.compiled) == 1
    assert launched == compiler.compiled
    assert launched[0] is compiler.compiled[0]


def test_the_project_plan_source_compiles_off_the_event_loop(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = copy_fixture("standard_shop", tmp_path)
    threads: list[threading.Thread] = []
    real = compiler_module.compile_root

    def recorded(folder: Path) -> CompiledProject:
        threads.append(threading.current_thread())
        return real(folder)

    monkeypatch.setattr(compiler_module, "compile_root", recorded)
    plan = asyncio.run(ProjectPlanSource(root).current())
    assert plan.package
    assert threads and threads[0] is not threading.main_thread()


def test_the_studio_engine_host_reads_plans_from_the_shared_workspace(tmp_path: Path) -> None:
    root = copy_fixture("standard_shop", tmp_path)
    settings = MemorySettings()
    assembly = ProjectAssembly()
    source = priced_engine_host(assembly).plan_sources(EngineLaunch(root, tmp_path / "data", settings))
    assert isinstance(source, WorkspacePlanSource)
    assert source.workspace is assembly.parts(root, settings).workspace
