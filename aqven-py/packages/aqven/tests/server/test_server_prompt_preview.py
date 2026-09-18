from pathlib import Path

from fastapi.testclient import TestClient

PREVIEW = "/api/flows/intake/nodes/reply/prompt/preview"


def test_preview_without_a_body_uses_sample_values(server_client: TestClient) -> None:
    body = server_client.post(PREVIEW, json={}).json()
    assert body["input_source"] == "sample"
    assert body["input"] == {"text": "<text>", "mood": "calm"}
    assert body["agent_id"] == "writer"
    assert "Output limits" in body["instructions"]
    assert body["output"]["mode"] == "tool"
    assert body["output"]["tool_name"] == "final_result"
    assert [item["role"] for item in body["messages"]] == ["user"]


def test_preview_uses_the_given_input_and_forces_a_variant(server_client: TestClient) -> None:
    request = {"input": {"text": "Помялась коробка", "mood": "calm"}, "variants": {"tone": "warm"}}
    body = server_client.post(PREVIEW, json=request).json()
    assert body["input_source"] == "request"
    assert "Добавь тепла." in body["messages"][-1]["text"]
    assert "Помялась коробка" in body["messages"][-1]["text"]
    assert body["variants"] == [
        {"slot": "tone", "case": "warm", "selector": "$in.mood", "forced": True, "text": "Добавь тепла.\n"}
    ]


def test_preview_of_a_code_node_and_of_an_unknown_flow_is_not_found(server_client: TestClient) -> None:
    code_node = server_client.post("/api/flows/intake/nodes/clean/prompt/preview", json={})
    assert code_node.status_code == 404
    assert "only llm nodes" in code_node.json()["message"]
    assert server_client.post("/api/flows/missing/nodes/reply/prompt/preview", json={}).status_code == 404


def test_preview_with_an_unknown_variant_case_is_input_invalid(server_client: TestClient) -> None:
    response = server_client.post(PREVIEW, json={"variants": {"tone": "loud"}})
    assert response.status_code == 422
    assert response.json()["code"] == "INPUT_INVALID"


def test_preview_of_a_broken_project_is_not_runnable(server_client: TestClient, server_project: Path) -> None:
    inference = server_project / "flows" / "intake" / "nodes" / "reply" / "reply.inference.yaml"
    inference.write_text(inference.read_text(encoding="utf-8") + "\nbroken: true\n", encoding="utf-8")
    response = server_client.post(PREVIEW, json={})
    assert response.status_code == 409
    assert response.json()["code"] == "NOT_RUNNABLE"
    assert response.json()["problems"]
