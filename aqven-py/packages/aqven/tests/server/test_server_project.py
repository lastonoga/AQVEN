from pathlib import Path

from fastapi.testclient import TestClient


def test_unknown_api_path_is_api_error(server_client: TestClient) -> None:
    responses = [server_client.get("/api/x"), server_client.post("/api/runs/x/unknown", json={})]
    assert [response.status_code for response in responses] == [404, 404]
    assert all(response.json()["code"] == "NOT_FOUND" for response in responses)
    assert all(response.json()["ok"] is False for response in responses)


def test_project_info(server_client: TestClient) -> None:
    body = server_client.get("/api/project").json()
    assert body["package"] == "standard_shop"
    assert body["tree_hash"].startswith("sha256-")
    assert body["project_file"]["path"] == "aqven.yaml"
    assert body["index"]["status"] == "ready"
    assert body["problems"] == {"error": 0, "warning": 0, "info": 0}


def test_files_listing_and_pagination(server_client: TestClient) -> None:
    first = server_client.get("/api/files", params={"limit": 3}).json()
    second = server_client.get("/api/files", params={"limit": 3, "cursor": first["next_cursor"]}).json()
    paths = [item["path"] for item in (*first["items"], *second["items"])]
    assert paths == sorted(paths)
    assert len(set(paths)) == 6
    assert first["total_estimate"] > 6
    kinds = {
        item["path"]: item["kind"] for item in server_client.get("/api/files", params={"limit": 200}).json()["items"]
    }
    assert kinds["aqven.yaml"] == "Project"
    assert kinds["flows/intake/flow.yaml"] == "Flow"
    assert kinds["flows/intake/nodes/reply/reply.prompt.md"] == "prompt"
    assert kinds["tools/functions.py"] == "code"
    assert not any(path.startswith(".") for path in kinds)


def test_files_filter_by_kind_and_prefix(server_client: TestClient) -> None:
    body = server_client.get("/api/files", params={"kind": "Node", "prefix": "flows/intake/nodes/review"}).json()
    assert {item["path"] for item in body["items"]} == {
        "flows/intake/nodes/review/review.node.yaml",
        "flows/intake/nodes/review/recheck.node.yaml",
        "flows/intake/nodes/review/redo.node.yaml",
        "flows/intake/nodes/review/trim.node.yaml",
    }


def test_invalid_cursor_is_request_invalid(server_client: TestClient) -> None:
    response = server_client.get("/api/files", params={"cursor": "%%%"})
    assert response.status_code == 422
    assert response.json()["code"] == "REQUEST_INVALID"


def test_file_detail(server_client: TestClient) -> None:
    body = server_client.get("/api/files/flows/intake/flow.yaml").json()
    assert body["kind"] == "Flow"
    assert body["parse_status"] == "ok"
    assert body["problems"] == []


def test_raw_file_with_etag(server_client: TestClient) -> None:
    detail = server_client.get("/api/files/aqven.yaml").json()
    response = server_client.get("/api/raw/aqven.yaml")
    assert response.status_code == 200
    assert response.headers["etag"] == f'"{detail["file_hash"]}"'
    assert response.headers["content-type"].startswith("application/yaml")
    assert b"standard_shop" in response.content
    cached = server_client.get("/api/raw/aqven.yaml", headers={"If-None-Match": response.headers["etag"]})
    assert cached.status_code == 304


def test_raw_rejects_escape_and_service_paths(server_client: TestClient, server_project: Path) -> None:
    runtime = server_project / ".aqven"
    runtime.mkdir()
    (runtime / "server.json").write_text("{}", encoding="utf-8")
    (server_project.parent / "secret.txt").write_text("secret", encoding="utf-8")
    statuses = [
        server_client.get(path).status_code
        for path in ("/api/raw/.aqven/server.json", "/api/raw/../secret.txt", "/api/raw/%2e%2e/secret.txt")
    ]
    assert statuses == [404, 404, 404]


def test_external_edit_changes_hashes(server_client: TestClient, server_project: Path) -> None:
    before = server_client.get("/api/project").json()["tree_hash"]
    file_before = server_client.get("/api/files/flows/intake/nodes/reply/reply.prompt.md").json()["file_hash"]
    prompt = server_project / "flows/intake/nodes/reply/reply.prompt.md"
    prompt.write_text(prompt.read_text(encoding="utf-8") + "\nOne more line.\n", encoding="utf-8")
    after = server_client.get("/api/project").json()
    file_after = server_client.get("/api/files/flows/intake/nodes/reply/reply.prompt.md").json()["file_hash"]
    assert after["tree_hash"] != before
    assert file_after != file_before
    assert after["index"]["generation"] == 2
