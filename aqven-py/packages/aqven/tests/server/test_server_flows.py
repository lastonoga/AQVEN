from pathlib import Path

from fastapi.testclient import TestClient


def test_flow_list(server_client: TestClient) -> None:
    body = server_client.get("/api/flows").json()
    [flow] = body["items"]
    assert flow["flow_id"] == "intake"
    assert flow["compile_status"] == "ok"
    assert flow["node_count"] == 6
    assert flow["input_type"] == "Note"
    assert flow["last_run"]["status"] == "completed"
    assert flow["content_hash"] is None


def test_flow_detail_and_spec(server_client: TestClient) -> None:
    detail = server_client.get("/api/flows/intake").json()
    assert detail["order"] == ["clean", "reply", "review"]
    assert any(item["path"] == "flows/intake/flow.yaml" for item in detail["files"])
    spec = server_client.get("/api/flows/intake/spec").json()
    assert spec["flow"]["apiVersion"] == "aqven/v1"
    assert list(spec["nodes"])[:3] == ["clean", "reply", "review"]
    assert spec["nodes"]["reply"]["node"] == "llm"


def test_unknown_flow_is_not_found(server_client: TestClient) -> None:
    response = server_client.get("/api/flows/missing")
    assert response.status_code == 404
    assert response.json()["op"] == "flow_get"


def test_flow_ir_without_compiler_is_not_runnable(server_client: TestClient) -> None:
    response = server_client.get("/api/flows/intake/ir")
    assert response.status_code == 409
    assert response.json()["code"] == "NOT_RUNNABLE"


def test_flow_schemas(server_client: TestClient) -> None:
    body = server_client.get("/api/flows/intake/schemas").json()
    assert body["input"]["properties"]["text"]["maxLength"] == 200
    reply = body["nodes"]["reply"]
    assert set(reply["in"]["properties"]) == {"text", "mood"}
    assert set(reply["out"]["properties"]) == {"text", "mood", "score"}
    assert body["nodes"]["review"]["in"] is None
    assert set(body["nodes"]["review"]["out"]["properties"]) == {"text"}


def test_nodes_in_order_with_neighbours(server_client: TestClient) -> None:
    nodes = server_client.get("/api/flows/intake/nodes").json()
    ids = [node["node_id"] for node in nodes]
    assert ids[:3] == ["clean", "reply", "review"]
    reply = next(node for node in nodes if node["node_id"] == "reply")
    assert reply["kind"] == "llm"
    assert reply["agent"] == "writer"
    assert reply["inference"] == "reply"
    assert reply["prompt_level"] == 2
    assert "clean" in reply["upstream"]
    assert "review" in reply["downstream"]


def test_node_detail(server_client: TestClient) -> None:
    body = server_client.get("/api/flows/intake/nodes/clean").json()
    assert body["kind"] == "code"
    assert body["code"]["ref"].endswith("clean.py:clean")
    assert body["bindings"] == [{"slot": "text", "ref": "$input.text", "value": None}]
    assert set(body["out_schema"]["properties"]) == {"text"}
    assert body["spec"]["node"] == "code"


def test_prompts(server_client: TestClient) -> None:
    listing = server_client.get("/api/prompts", params={"flow_id": "intake"}).json()
    assert {(item["node_id"], item["inference_id"]) for item in listing["items"]} >= {("reply", "reply")}
    detail = server_client.get("/api/flows/intake/nodes/reply/prompt").json()
    assert detail["level"] == 2
    assert detail["path"] == "flows/intake/nodes/reply/reply.prompt.md"
    assert detail["source"]["file_hash"].startswith("sha256-")
    assert {slot["name"] for slot in detail["slots"]} == {"text", "mood"}
    assert "flows/intake/nodes/reply/reply.variants/tone/calm.md" in detail["variant_files"]


def test_prompt_of_code_node_is_not_found(server_client: TestClient) -> None:
    assert server_client.get("/api/flows/intake/nodes/clean/prompt").status_code == 404


def test_types(server_client: TestClient) -> None:
    listing = server_client.get("/api/types").json()
    assert [item["type_id"] for item in listing["items"]] == ["Mood", "Note", "Score"]
    note = next(item for item in listing["items"] if item["type_id"] == "Note")
    assert note["usage_count"] >= 1
    mood = server_client.get("/api/types/Mood").json()
    assert {value["value"] for value in mood["enum_values"]} >= {"calm", "warm"}
    assert mood["json_schema"]["enum"]
    assert server_client.get("/api/types/Nope").status_code == 404


def test_broken_flow_reports_invalid(server_client: TestClient, server_project: Path) -> None:
    node = server_project / "flows/intake/nodes/clean/clean.node.yaml"
    node.write_text(node.read_text(encoding="utf-8").replace('node: "code"', 'node: "cod"'), encoding="utf-8")
    flow = server_client.get("/api/flows").json()["items"][0]
    assert flow["compile_status"] == "invalid"
    assert flow["problems"]["error"] >= 1
    entry = server_client.get("/api/files/flows/intake/nodes/clean/clean.node.yaml").json()
    assert entry["parse_status"] == "invalid"
    assert entry["sync_state"] == "quarantined"
    assert entry["problems"]
