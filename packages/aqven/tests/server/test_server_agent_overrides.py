import asyncio
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Final

import pytest
from fastapi.testclient import TestClient
from pydantic import JsonValue
from server_fakes import AUTH, RUN_ID, SERVER_BASE, FakeEngine, MemorySettings

from aqven.compiler import compile_root
from aqven.engine.agent_overrides import NODE_AMBIGUOUS, NODE_NOT_LLM, with_agent_overrides
from aqven.ir import CompiledLlmNode, CompiledProject
from aqven.ports.engine import EngineError
from aqven.runtime.runs import RunStarted, RunStartRequest
from aqven.server import ServerOptions, create_app
from aqven.server.mcp.catalog import tool_error
from aqven.server.mcp.run_tools import RunTools
from aqven.server.views.runs import RunStartService
from aqven.server.workspace import ProjectWorkspace
from aqven.spec import AgentId, FlowId, NodeId

INTAKE: Final = FlowId("intake")
REDO: Final = NodeId("review__recheck__redo")
WRITER: Final = AgentId("writer")
CASE_DATASET: Final[dict[str, JsonValue]] = {
    "dataset_id": "intake_cases",
    "flow_id": "intake",
    "cases": [{"name": "failed_once", "inputs": {"text": "Where is my order?"}, "metadata": {"split": "dev"}}],
}


@dataclass(slots=True)
class OverridingEngine(FakeEngine):
    plan: CompiledProject | None = None

    async def start_run(self, request: RunStartRequest, *, dataset_item_id: str | None = None) -> RunStarted:
        assert self.plan is not None
        with_agent_overrides(self.plan, request.flow_id, request.agent_overrides)
        return await FakeEngine.start_run(self, request, dataset_item_id=dataset_item_id)


@pytest.fixture
def overriding_engine(server_project: Path) -> OverridingEngine:
    return OverridingEngine(plan=compile_root(server_project))


@pytest.fixture
def overriding_client(
    server_project: Path,
    overriding_engine: OverridingEngine,
    server_settings: MemorySettings,
    server_options: ServerOptions,
) -> Iterator[TestClient]:
    app = create_app(server_project, overriding_engine, server_settings, options=server_options)
    with TestClient(app, base_url=SERVER_BASE, headers=AUTH) as client:
        yield client


def redo_agent(plan: CompiledProject) -> AgentId:
    node = plan.flow(INTAKE).node(REDO)
    assert isinstance(node, CompiledLlmNode)
    return node.agent


def with_second_redo(plan: CompiledProject) -> CompiledProject:
    flow = plan.flow(INTAKE)
    twin = flow.node(REDO).model_copy(update={"node_id": NodeId("reply__redo")})
    answered = flow.model_copy(update={"nodes": {**flow.nodes, twin.node_id: twin}})
    return plan.model_copy(update={"flows": {**plan.flows, INTAKE: answered}})


def test_a_file_name_reaches_the_nested_llm_node_it_names(server_project: Path) -> None:
    plan = compile_root(server_project)

    answered = with_agent_overrides(plan, INTAKE, {NodeId("redo"): WRITER})

    assert (redo_agent(plan), redo_agent(answered)) == ("critic", "writer")


def test_a_file_name_shared_by_two_nodes_must_be_named_in_full(server_project: Path) -> None:
    plan = with_second_redo(compile_root(server_project))

    with pytest.raises(EngineError) as raised:
        with_agent_overrides(plan, INTAKE, {NodeId("redo"): WRITER})

    assert [problem.code for problem in raised.value.problems] == [NODE_AMBIGUOUS]
    assert "reply__redo, review__recheck__redo" in raised.value.message
    assert redo_agent(with_agent_overrides(plan, INTAKE, {REDO: WRITER})) == "writer"


def test_the_route_hands_the_overrides_of_a_dataset_case_to_the_engine(
    server_client: TestClient, server_engine: FakeEngine
) -> None:
    assert server_client.post("/api/datasets", json=CASE_DATASET).status_code == 200

    started = server_client.post(
        "/api/runs",
        json={
            "flow_id": "intake",
            "mode": "live",
            "dataset_item_id": "intake_cases/failed_once",
            "agent_overrides": {"reply": "critic"},
        },
    )

    assert started.status_code == 201
    assert server_engine.started[-1].input == {"text": "Where is my order?"}
    assert server_engine.started[-1].agent_overrides == {"reply": "critic"}
    assert server_engine.started_dataset_items[-1] == "intake_cases/failed_once"


def test_run_get_shows_no_overrides_for_a_run_started_without_them(server_client: TestClient) -> None:
    snapshot = server_client.get(f"/api/runs/{RUN_ID}").json()

    assert snapshot["agent_overrides"] == {}


def test_an_override_on_a_code_node_is_input_invalid_on_both_surfaces(
    overriding_client: TestClient,
    overriding_engine: OverridingEngine,
    server_project: Path,
    server_settings: MemorySettings,
    server_options: ServerOptions,
) -> None:
    body: dict[str, JsonValue] = {
        "flow_id": "intake",
        "mode": "live",
        "input": {"text": "hi"},
        "agent_overrides": {"clean": "writer"},
    }
    service = RunStartService(
        facade=overriding_engine,
        settings=server_settings,
        workspace=ProjectWorkspace(server_project, compiler=server_options.compiler),
        environ=server_options.environ,
    )

    over_http = overriding_client.post("/api/runs", json=body)
    with pytest.raises(EngineError) as over_mcp:
        asyncio.run(RunTools(overriding_engine, service).start(RunStartRequest.model_validate(body)))

    problems = over_http.json()["problems"]
    assert over_http.status_code == 422
    assert [(problem["path"], problem["code"]) for problem in problems] == [
        (["agent_overrides", "clean"], NODE_NOT_LLM)
    ]
    assert tool_error(over_mcp.value, "run_start").code == over_http.json()["code"] == "INPUT_INVALID"
    assert overriding_engine.started == []
