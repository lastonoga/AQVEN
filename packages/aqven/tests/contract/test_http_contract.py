import asyncio
import json
from collections.abc import Generator
from pathlib import Path
from typing import Final

import httpx2
import pytest
from contract_engine import FLOW_ID, RUN_ID
from contract_server import LiveServer, serving, shop_copy

TIMEOUT: Final = 15.0
SUSPENSION: Final = "run_suspended"
APPROVAL_NODE: Final = "review"


@pytest.fixture
def live(tmp_path: Path) -> Generator[LiveServer]:
    with serving(shop_copy(tmp_path), tmp_path / "data") as server:
        yield server


def start_body() -> dict[str, object]:
    return {"flow_id": FLOW_ID, "mode": "live", "input": {"text": "the strip flickers"}}


def resume_body(address: dict[str, object]) -> dict[str, object]:
    return {
        "address": address,
        "attempt": 1,
        "payload": {"decision": "approve"},
        "client_op_id": "01JBQ7WV3M9XYZK4T8S2D6N0PQ",
    }


def test_any_http_client_runs_the_whole_human_wait_cycle(live: LiveServer) -> None:
    async def scenario() -> tuple[int, list[str], dict[str, object], dict[str, object]]:
        async with httpx2.AsyncClient(headers=live.authorization(), timeout=TIMEOUT) as http:
            started = await http.post(f"{live.base_url}/api/runs", json=start_body())
            run_id = started.json()["run_id"]
            seen: list[str] = []
            async with http.sse(f"{live.base_url}/api/runs/{run_id}/events") as source:
                async for frame in source:
                    seen.append(frame.event)
                    if frame.event == SUSPENSION:
                        break
            snapshot = await http.get(f"{live.base_url}/api/runs/{run_id}")
            wait = snapshot.json()["waits"][0]
            resumed = await http.post(f"{live.base_url}/api/runs/{run_id}/resume", json=resume_body(wait["address"]))
            finished = await http.get(f"{live.base_url}/api/runs/{run_id}")
        return started.status_code, seen, resumed.json(), finished.json()

    status, seen, resumed, finished = asyncio.run(scenario())

    assert status == 201
    assert seen == ["run_started", "node_suspended", SUSPENSION]
    assert resumed["outcome"] == "accepted"
    assert finished["status"] == "completed"
    assert live.engine.started[0].flow_id == FLOW_ID
    assert live.engine.resumes[0].address.node_id == APPROVAL_NODE


def test_input_that_breaks_the_flow_schema_returns_the_problem_envelope(live: LiveServer) -> None:
    with httpx2.Client(headers=live.authorization(), timeout=TIMEOUT) as http:
        rejected = http.post(
            f"{live.base_url}/api/runs",
            json={"flow_id": FLOW_ID, "mode": "live", "input": {"wrong": 1}},
        )

    body = rejected.json()
    assert (rejected.status_code, body["code"], body["op"]) == (422, "INPUT_INVALID", "run_start")
    assert [problem["path"] for problem in body["problems"]]


def test_missing_bearer_token_is_rejected_with_the_error_envelope(live: LiveServer) -> None:
    anonymous = httpx2.get(f"{live.base_url}/api/runs/{RUN_ID}", timeout=TIMEOUT)

    assert anonymous.status_code == 401
    assert anonymous.json()["code"] == "UNAUTHORIZED"
    assert anonymous.headers["www-authenticate"] == "Bearer"


def test_openapi_and_event_schemas_describe_the_contract(live: LiveServer) -> None:
    with httpx2.Client(headers=live.authorization(), timeout=TIMEOUT) as http:
        document = http.get(f"{live.base_url}/api/openapi.json").json()
        catalog = http.get(f"{live.base_url}/api/schemas/events").json()

    assert document["openapi"].startswith("3.1")
    assert document["paths"]["/api/runs"]["post"]["operationId"] == "run_start"
    assert document["paths"]["/api/runs/{run_id}/events"]["get"]["operationId"] == "run_events"
    assert set(catalog) == {"spec", "run", "chat", "schemas"}
    assert set(catalog["schemas"]["run"]) >= {"run_started", SUSPENSION, "run_finished"}
    assert catalog["schemas"]["run"][SUSPENSION]["properties"]["type"]["const"] == SUSPENSION
    run_event = document["components"]["schemas"]["RunEvent"]
    assert run_event["discriminator"]["propertyName"] == "type"
    assert SUSPENSION in run_event["discriminator"]["mapping"]


def test_execution_detail_publishes_the_form_schema(live: LiveServer) -> None:
    with httpx2.Client(headers=live.authorization(), timeout=TIMEOUT) as http:
        detail = http.get(
            f"{live.base_url}/api/runs/{RUN_ID}/executions/detail",
            params={"node_id": APPROVAL_NODE},
        ).json()

    schema = detail["human"]["form_schema"]
    assert json.dumps(schema)
    assert schema["required"] == ["decision"]
