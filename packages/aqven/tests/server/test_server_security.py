from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from server_fakes import SERVER_BASE, SERVER_TOKEN, FakeEngine, MemorySettings

from aqven.app.access import access_cookie_name
from aqven.server import ServerOptions, create_app


def anonymous(app: FastAPI) -> TestClient:
    return TestClient(app, base_url=SERVER_BASE, follow_redirects=False)


def test_api_requires_token(server_app: FastAPI) -> None:
    with anonymous(server_app) as client:
        response = client.get("/api/runs")
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"
    assert response.json()["ok"] is False


def test_mcp_prefix_requires_token(server_app: FastAPI) -> None:
    with anonymous(server_app) as client:
        response = client.post("/mcp/", json={})
    assert response.status_code == 401


def test_bearer_token_is_accepted(server_app: FastAPI) -> None:
    with anonymous(server_app) as client:
        response = client.get("/api/runs", headers={"Authorization": f"Bearer {SERVER_TOKEN}"})
    assert response.status_code == 200


def test_wrong_token_is_rejected(server_app: FastAPI) -> None:
    with anonymous(server_app) as client:
        response = client.get("/api/runs", headers={"Authorization": "Bearer nope"})
    assert response.status_code == 401


def test_query_token_sets_cookie_and_is_stripped(server_app: FastAPI) -> None:
    with anonymous(server_app) as client:
        first = client.get("/api/runs", params={"access_token": SERVER_TOKEN, "flow_id": "intake"})
        cookie = first.headers.get("set-cookie", "")
        second = client.get("/api/runs")
    assert first.status_code == 200
    assert f"{access_cookie_name(5180)}=" in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=Strict" in cookie
    assert second.status_code == 200


def test_page_token_exchange_redirects_without_token(server_app: FastAPI) -> None:
    with anonymous(server_app) as client:
        response = client.get("/flows/intake", params={"access_token": SERVER_TOKEN, "tab": "graph"})
    assert response.status_code == 303
    assert response.headers["location"] == "/flows/intake?tab=graph"
    assert f"{access_cookie_name(5180)}=" in response.headers["set-cookie"]


def test_foreign_host_is_rejected(server_app: FastAPI) -> None:
    with anonymous(server_app) as client:
        response = client.get("/api/ready", headers={"Host": "evil.example"})
    assert response.status_code == 400
    assert response.json()["code"] == "HOST_NOT_ALLOWED"


def test_localhost_and_ipv6_hosts_are_allowed(server_app: FastAPI) -> None:
    auth = {"Authorization": f"Bearer {SERVER_TOKEN}"}
    with anonymous(server_app) as client:
        names = [
            client.get("/api/ready", headers={**auth, "Host": host}).status_code
            for host in ("localhost:5180", "[::1]:5180")
        ]
    assert names == [200, 200]


def test_foreign_origin_is_forbidden(server_app: FastAPI) -> None:
    with anonymous(server_app) as client:
        response = client.get(
            "/api/runs",
            headers={"Origin": "http://evil.example", "Authorization": f"Bearer {SERVER_TOKEN}"},
        )
    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN"


def test_same_origin_is_allowed(server_app: FastAPI) -> None:
    with anonymous(server_app) as client:
        response = client.get("/api/runs", headers={"Origin": SERVER_BASE, "Authorization": f"Bearer {SERVER_TOKEN}"})
    assert response.status_code == 200


def test_ready_is_open(server_app: FastAPI) -> None:
    with anonymous(server_app) as client:
        response = client.get("/api/ready")
    assert response.status_code == 200
    assert response.json()["status"] == "ready"


def test_unguarded_app_leaves_access_to_host(server_project: Path, tmp_path: Path) -> None:
    options = ServerOptions(guard=False, watch=False, serve_studio=False, blob_directory=tmp_path / "b")
    app = create_app(server_project, FakeEngine(), MemorySettings(), options=options)
    with anonymous(app) as client:
        response = client.get("/api/runs", params={"access_token": "anything", "flow_id": "intake"})
    assert response.status_code == 200


def test_dev_origin_gets_cors(tmp_path: Path, server_project: Path) -> None:
    dev = "http://localhost:5173"
    options = ServerOptions(
        access_token=SERVER_TOKEN, watch=False, serve_studio=False, dev_origin=dev, blob_directory=tmp_path / "b"
    )
    app = create_app(server_project, FakeEngine(), MemorySettings(), options=options)
    with anonymous(app) as client:
        preflight = client.options(
            "/api/runs",
            headers={
                "Origin": dev,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization",
            },
        )
        actual = client.get("/api/runs", headers={"Origin": dev, "Authorization": f"Bearer {SERVER_TOKEN}"})
    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-origin"] == dev
    assert actual.status_code == 200
    assert actual.headers["access-control-allow-origin"] == dev
