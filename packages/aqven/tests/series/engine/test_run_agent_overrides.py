import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Final

import pytest
from series_fixture import CHEAP_MODEL, WRITER_MODEL, write_project
from series_harness import ScriptedModels, SeriesHarness, series_engine

from aqven.compiler import compile_root
from aqven.engine import DbosEngineFacade, RunRecord
from aqven.engine.agent_overrides import AGENT_UNKNOWN, NODE_NOT_LLM, NODE_UNKNOWN, with_agent_overrides
from aqven.ir import CompiledLlmNode, CompiledProject, flow_hash
from aqven.ports.engine import MAX_PAGE_LIMIT, EngineError, EventLogQuery
from aqven.runtime import NodeFinished, RunSnapshot, RunStarted, RunStartRequest
from aqven.server.views.runs import RunStartService
from aqven.server.workspace import ProjectWorkspace, WorkspacePlanSource
from aqven.spec import AgentId, FlowId, NodeId
from aqven.testing.engines import offline_environment

TRIAGE: Final = FlowId("triage")
CLASSIFY: Final = NodeId("classify")
TIDY: Final = NodeId("tidy")
CHEAP: Final = AgentId("cheap")
CASE: Final = "triage_cases/always_1"
EVENT_PAGE: Final = MAX_PAGE_LIMIT


def classify_node(plan: CompiledProject) -> CompiledLlmNode:
    node = plan.flow(TRIAGE).node(CLASSIFY)
    assert isinstance(node, CompiledLlmNode)
    return node


def rejection(plan: CompiledProject, overrides: dict[NodeId, AgentId]) -> EngineError:
    with pytest.raises(EngineError) as raised:
        with_agent_overrides(plan, TRIAGE, overrides)
    return raised.value


def test_an_override_answers_the_node_with_the_agent_and_its_output_mode(tmp_path: Path) -> None:
    plan = compile_root(write_project(tmp_path))

    answered = with_agent_overrides(plan, TRIAGE, {CLASSIFY: CHEAP})

    assert (classify_node(plan).agent, classify_node(plan).output_mode) == ("writer", "tool")
    assert (classify_node(answered).agent, classify_node(answered).output_mode) == ("cheap", "prompted")
    assert answered.flow(TRIAGE).node(TIDY) == plan.flow(TRIAGE).node(TIDY)
    assert flow_hash(answered, TRIAGE) != flow_hash(plan, TRIAGE)
    assert with_agent_overrides(plan, TRIAGE, {}) is plan


def test_an_override_on_an_unknown_node_names_the_llm_nodes_of_the_flow(tmp_path: Path) -> None:
    error = rejection(compile_root(write_project(tmp_path)), {NodeId("clasify"): CHEAP})

    assert error.code == "INPUT_INVALID"
    assert [(problem.path, problem.code) for problem in error.problems] == [
        (("agent_overrides", "clasify"), NODE_UNKNOWN)
    ]
    assert "llm nodes: classify" in error.message


def test_an_override_on_a_node_that_is_not_llm_is_rejected(tmp_path: Path) -> None:
    error = rejection(compile_root(write_project(tmp_path)), {TIDY: CHEAP})

    assert [(problem.path, problem.code) for problem in error.problems] == [(("agent_overrides", "tidy"), NODE_NOT_LLM)]
    assert "tidy is a code node" in error.message


def test_an_override_with_an_unknown_agent_lists_the_project_agents(tmp_path: Path) -> None:
    error = rejection(compile_root(write_project(tmp_path)), {CLASSIFY: AgentId("ghost")})

    assert [(problem.path, problem.code) for problem in error.problems] == [
        (("agent_overrides", "classify"), AGENT_UNKNOWN)
    ]
    assert "agents: cheap, critic, writer" in error.message


@dataclass(frozen=True, slots=True)
class Recheck:
    overridden: RunStarted
    plain: RunStarted
    record: RunRecord
    snapshot: RunSnapshot
    models: tuple[str | None, ...]
    plain_models: tuple[str | None, ...]
    rejected: EngineError


def start_service(harness: SeriesHarness, root: Path) -> tuple[RunStartService, DbosEngineFacade]:
    workspace = ProjectWorkspace(root)
    facade = DbosEngineFacade(runtime=harness.runtime, plan_source=WorkspacePlanSource(workspace))
    service = RunStartService(
        facade=facade, settings=harness.settings, workspace=workspace, environ=offline_environment()
    )
    return service, facade


def case_request(overrides: dict[str, str]) -> RunStartRequest:
    return RunStartRequest.model_validate(
        {"flow_id": TRIAGE, "mode": "live", "dataset_item_id": CASE, "agent_overrides": overrides}
    )


async def classify_models(facade: DbosEngineFacade, started: RunStarted) -> tuple[str | None, ...]:
    events = (await facade.event_log(started.run_id, EventLogQuery(limit=EVENT_PAGE))).items
    return tuple(
        event.model for event in events if isinstance(event, NodeFinished) and event.address.node_id == CLASSIFY
    )


async def recheck(harness: SeriesHarness, root: Path) -> Recheck:
    service, facade = start_service(harness, root)
    overridden = await service.start(case_request({CLASSIFY: CHEAP}))
    record = await facade.result(overridden.run_id)
    plain = await service.start(case_request({}))
    await facade.result(plain.run_id)
    with pytest.raises(EngineError) as raised:
        await service.start(case_request({TIDY: CHEAP}))
    return Recheck(
        overridden=overridden,
        plain=plain,
        record=record,
        snapshot=await facade.get_run(overridden.run_id),
        models=await classify_models(facade, overridden),
        plain_models=await classify_models(facade, plain),
        rejected=raised.value,
    )


def test_a_case_run_answers_with_the_override_agent_and_run_get_records_it(tmp_path: Path) -> None:
    root = write_project(tmp_path)
    models = ScriptedModels()

    with series_engine(root, models) as harness:
        result = asyncio.run(recheck(harness, root))

    assert result.record.status == "completed"
    assert result.record.output == {"label": "ok"}
    assert result.models == (CHEAP_MODEL,)
    assert result.plain_models == (WRITER_MODEL,)
    assert (models.cheap.calls, models.writer.calls) == (1, 1)
    assert result.snapshot.agent_overrides == {CLASSIFY: CHEAP}
    assert result.snapshot.dataset_item_id == CASE
    assert result.snapshot.content_hash == result.overridden.content_hash
    assert result.overridden.content_hash != result.plain.content_hash
    assert result.rejected.code == "INPUT_INVALID"
    assert [problem.code for problem in result.rejected.problems] == [NODE_NOT_LLM]
