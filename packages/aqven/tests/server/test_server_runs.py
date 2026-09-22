import json
from pathlib import Path

from fastapi.testclient import TestClient
from server_fakes import RUN_ID, FakeEngine
from sse_frames import parse_frames

from aqven.ports.engine import EngineError

RESUME_BODY = {
    "address": {"node_id": "approve", "branch_key": None, "iteration": None, "item_index": None},
    "attempt": 1,
    "payload": {"approve": True},
    "client_op_id": "01J8ZQ5V0000000000000000AA",
}


def test_start_run_validates_and_delegates(server_client: TestClient, server_engine: FakeEngine) -> None:
    response = server_client.post("/api/runs", json={"flow_id": "intake", "mode": "live", "input": {"text": "hi"}})
    assert response.status_code == 201
    assert response.json()["run_id"] == RUN_ID
    assert [request.flow_id for request in server_engine.started] == ["intake"]
    assert server_engine.started_dataset_items == [None]


def test_start_run_with_invalid_input(server_client: TestClient, server_engine: FakeEngine) -> None:
    response = server_client.post("/api/runs", json={"flow_id": "intake", "mode": "live", "input": {"text": "x" * 500}})
    body = response.json()
    assert response.status_code == 422
    assert body["code"] == "INPUT_INVALID"
    assert body["problems"][0]["path"] == ["input", "text"]
    assert body["op"] == "run_start"
    assert server_engine.started == []


def test_start_run_with_missing_field(server_client: TestClient, server_engine: FakeEngine) -> None:
    response = server_client.post("/api/runs", json={"flow_id": "intake", "mode": "live", "input": {}})
    assert response.status_code == 422
    assert response.json()["problems"][0]["code"] == "missing"
    assert server_engine.started == []


def test_start_run_request_shape(server_client: TestClient) -> None:
    response = server_client.post("/api/runs", json={"flow_id": "intake", "mode": "live"})
    assert response.status_code == 422
    assert response.json()["code"] == "REQUEST_INVALID"


def test_start_unknown_flow(server_client: TestClient) -> None:
    response = server_client.post("/api/runs", json={"flow_id": "nope", "mode": "live", "input": {"text": "hi"}})
    assert response.status_code == 404


def test_start_broken_project_is_not_runnable(
    server_client: TestClient, server_engine: FakeEngine, server_project: Path
) -> None:
    flow = server_project / "flows/intake/flow.yaml"
    flow.write_text(flow.read_text(encoding="utf-8").replace('input: "Note"', 'input: "Missing"'), encoding="utf-8")
    response = server_client.post("/api/runs", json={"flow_id": "intake", "mode": "live", "input": {"text": "hi"}})
    assert response.status_code == 409
    assert response.json()["code"] == "NOT_RUNNABLE"
    assert response.json()["problems"]
    assert server_engine.started == []


def test_list_runs_with_node_counts(server_client: TestClient, server_engine: FakeEngine) -> None:
    body = server_client.get("/api/runs", params={"flow_id": "intake", "status": "completed", "limit": 5}).json()
    assert body["items"][0]["node_counts"]["ok"] == 2
    assert server_engine.list_queries[-1].status == "completed"
    assert server_engine.list_queries[-1].limit == 5


def test_list_runs_rejects_unknown_filter(server_client: TestClient) -> None:
    response = server_client.get("/api/runs", params={"colour": "red"})
    assert response.status_code == 422
    assert response.json()["problems"][0]["code"] == "extra_forbidden"


def test_get_run_and_missing_run(server_client: TestClient) -> None:
    assert server_client.get(f"/api/runs/{RUN_ID}").json()["last_seq"] == 3
    missing = server_client.get("/api/runs/unknown")
    assert missing.status_code == 404
    assert missing.json()["code"] == "NOT_FOUND"


def test_executions_and_detail_address(server_client: TestClient, server_engine: FakeEngine) -> None:
    executions = server_client.get(f"/api/runs/{RUN_ID}/executions", params={"node_id": "clean"}).json()
    assert executions[0]["address"]["node_id"] == "clean"
    zero = server_client.get(
        f"/api/runs/{RUN_ID}/executions/detail", params={"node_id": "loop", "iteration": 0, "include_payloads": "full"}
    )
    level = server_client.get(f"/api/runs/{RUN_ID}/executions/detail", params={"node_id": "loop"})
    assert zero.json()["address"]["iteration"] == 0
    assert level.json()["address"]["iteration"] is None
    assert server_engine.detail_requests[0][1] == "full"
    assert server_client.get(f"/api/runs/{RUN_ID}/executions/detail").status_code == 422


def test_presentation_batch_route_preserves_target_order(server_client: TestClient, server_engine: FakeEngine) -> None:
    address = {"node_id": "reply", "branch_key": None, "iteration": None, "item_index": None}
    request = {
        "locale": "en",
        "targets": [{"address": address, "side": "input"}, {"address": address, "side": "output"}],
    }
    response = server_client.post(f"/api/runs/{RUN_ID}/presentation", json=request)
    assert response.status_code == 200
    assert [result["target"]["side"] for result in response.json()["results"]] == ["input", "output"]
    assert server_engine.presentation_requests[-1].locale == "en"


def test_presentation_batch_route_rejects_empty_targets(server_client: TestClient) -> None:
    response = server_client.post(f"/api/runs/{RUN_ID}/presentation", json={"locale": "en", "targets": []})
    assert response.status_code == 422


def test_resume_accepted_and_unconfirmed(server_client: TestClient, server_engine: FakeEngine) -> None:
    accepted = server_client.post(f"/api/runs/{RUN_ID}/resume", json=RESUME_BODY)
    server_engine.resume_outcome = "sent"
    sent = server_client.post(f"/api/runs/{RUN_ID}/resume", json=RESUME_BODY)
    assert accepted.status_code == 200
    assert sent.status_code == 202
    assert sent.json()["outcome"] == "sent"


def test_fork_and_cancel(server_client: TestClient, server_engine: FakeEngine) -> None:
    fork = server_client.post(
        f"/api/runs/{RUN_ID}/fork",
        json={"from": {"node_id": "reply", "branch_key": None, "iteration": None, "item_index": None}},
    )
    assert fork.status_code == 201
    assert fork.json()["lineage_parent"] == RUN_ID
    assert server_client.post(f"/api/runs/{RUN_ID}/cancel", json={"reason": "stop"}).json()["status"] == "completed"
    server_engine.cancel_error = EngineError("RUN_STATE_CONFLICT", "run finished")
    conflict = server_client.post(f"/api/runs/{RUN_ID}/cancel", json={"reason": "stop"})
    assert conflict.status_code == 409
    assert conflict.json()["code"] == "RUN_STATE_CONFLICT"


def test_run_events_stream_until_run_finished(server_client: TestClient) -> None:
    with server_client.stream("GET", f"/api/runs/{RUN_ID}/events") as response:
        text = response.read().decode()
        content_type = response.headers["content-type"]
    frames = parse_frames(text)
    assert content_type.startswith("text/event-stream")
    assert [frame.id for frame in frames] == ["1", "2", "3"]
    assert [frame.event for frame in frames] == ["run_started", "node_started", "run_finished"]
    assert json.loads(frames[1].data or "{}")["seq"] == 2


def test_run_events_reconnect_with_last_event_id(server_client: TestClient, server_engine: FakeEngine) -> None:
    first = parse_frames(server_client.get(f"/api/runs/{RUN_ID}/events", params={"after_seq": 0}).text)
    last = first[1].id or "0"
    resumed = parse_frames(
        server_client.get(f"/api/runs/{RUN_ID}/events", params={"after_seq": 0}, headers={"Last-Event-ID": last}).text
    )
    assert [frame.id for frame in resumed] == ["3"]
    assert server_engine.event_reads == [0, 2]


def test_run_events_after_seq(server_client: TestClient) -> None:
    frames = parse_frames(server_client.get(f"/api/runs/{RUN_ID}/events", params={"after_seq": 1}).text)
    assert [frame.id for frame in frames] == ["2", "3"]


def test_run_events_for_unknown_run_is_json_error(server_client: TestClient) -> None:
    response = server_client.get("/api/runs/unknown/events")
    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"


def test_event_log(server_client: TestClient) -> None:
    body = server_client.get(f"/api/runs/{RUN_ID}/events/log", params={"after_seq": 1, "limit": 1}).json()
    assert [item["seq"] for item in body["items"]] == [2]
    assert body["items"][0]["type"] == "node_started"
