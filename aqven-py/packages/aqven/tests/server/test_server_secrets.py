import getpass
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Final

import pytest
from fastapi.testclient import TestClient
from pydantic import JsonValue
from server_fakes import FakeEngine, copy_fixture

from aqven.app.locations import ProjectState, StudioState
from aqven.app.settings_store import open_settings_store
from aqven.server import ServerOptions, create_app

TOKEN: Final = "secrets-token-0123456789"
BASE: Final = "http://127.0.0.1:5180"
KB_TOKEN: Final = "kb-secret-0123456789abcdef"
OPENAI_KEY: Final = "sk-openai-env-0123456789"
KB_TOOL: Final = """apiVersion: "aqven/v1"
kind: "Tool"
description: "Knowledge base search"
run: "@root.tools.functions:stamp"
effect: "read"
secrets:
- name: "kb_token"
  ref: "ref:env/SHOP_KB_TOKEN"
in:
- name: "text"
  type: "Text"
  description: "Query"
  maxLength: 200
out:
- name: "text"
  type: "Text"
  description: "Answer"
  maxLength: 200
"""
HELPDESK_SERVER: Final = """apiVersion: "aqven/v1"
kind: "McpServer"
description: "Helpdesk MCP server"
transport: "streamable_http"
url: "https://helpdesk.example/mcp"
headers:
- name: "Authorization"
  value: "ref:env/SHOP_HELPDESK_TOKEN"
"""


@pytest.fixture
def secrets_project(tmp_path: Path) -> Path:
    root = copy_fixture("standard_shop", tmp_path)
    (root / "tools" / "kb.yaml").write_text(KB_TOOL, encoding="utf-8")
    (root / "mcp").mkdir()
    (root / "mcp" / "helpdesk.yaml").write_text(HELPDESK_SERVER, encoding="utf-8")
    return root


@pytest.fixture
def secrets_engine() -> FakeEngine:
    return FakeEngine()


@pytest.fixture
def secrets_client(tmp_path: Path, secrets_project: Path, secrets_engine: FakeEngine) -> Iterator[TestClient]:
    project = ProjectState(secrets_project)
    project.ensure()
    studio = StudioState(tmp_path / "data")
    studio.ensure()
    environment = {"OPENAI_API_KEY": OPENAI_KEY}
    store = open_settings_store(project, studio, environment)
    options = ServerOptions(
        access_token=TOKEN,
        port=5180,
        watch=False,
        serve_studio=False,
        blob_directory=tmp_path / "blobs",
        environ=environment,
    )
    app = create_app(secrets_project, secrets_engine, store, options=options)
    with TestClient(app, base_url=BASE, headers={"Authorization": f"Bearer {TOKEN}"}) as client:
        yield client


def by_env(rows: list[dict[str, JsonValue]]) -> dict[str, dict[str, JsonValue]]:
    return {str(row["env_var"]): row for row in rows}


def test_declared_secrets_are_listed_with_owner_and_state(secrets_client: TestClient) -> None:
    response = secrets_client.get("/api/settings/secrets")
    rows = by_env(response.json())

    assert response.status_code == 200
    assert set(rows) == {"OPENAI_API_KEY", "SHOP_KB_TOKEN", "SHOP_HELPDESK_TOKEN"}
    assert rows["SHOP_KB_TOKEN"]["declared_by"] == "kb"
    assert rows["SHOP_KB_TOKEN"]["scope"] == "tool"
    assert rows["SHOP_KB_TOKEN"]["name"] == "kb_token"
    assert rows["SHOP_KB_TOKEN"]["declared_in"] == "tools/kb.yaml"
    assert rows["SHOP_KB_TOKEN"]["setting_key"] == "secrets.shop_kb_token"
    assert (rows["SHOP_KB_TOKEN"]["set"], rows["SHOP_KB_TOKEN"]["source"]) == (False, None)
    assert rows["SHOP_HELPDESK_TOKEN"]["scope"] == "mcp_server"
    assert rows["SHOP_HELPDESK_TOKEN"]["declared_by"] == "helpdesk"
    assert rows["OPENAI_API_KEY"]["scope"] == "provider"
    assert (rows["OPENAI_API_KEY"]["set"], rows["OPENAI_API_KEY"]["source"]) == (True, "environment")


def test_a_secret_written_to_the_project_env_becomes_set_and_stays_masked(secrets_client: TestClient) -> None:
    written = secrets_client.put(
        "/api/settings/project/secrets.shop_kb_token", json={"kind": "secret", "secret": KB_TOKEN}
    )
    response = secrets_client.get("/api/settings/secrets")
    row = by_env(response.json())["SHOP_KB_TOKEN"]

    assert written.status_code == 200
    assert (row["set"], row["source"]) == (True, "dotenv")
    assert str(row["masked"]).endswith(KB_TOKEN[-4:])
    assert KB_TOKEN not in response.text


def test_secrets_of_a_project_that_does_not_load_are_reported_as_a_problem(
    secrets_client: TestClient, secrets_project: Path
) -> None:
    (secrets_project / "aqven.yaml").write_text("apiVersion: nope\n", encoding="utf-8")

    response = secrets_client.get("/api/settings/secrets")

    assert response.status_code == 409
    assert response.json()["op"] == "secret_list"


def test_local_user_falls_back_to_the_os_user(secrets_client: TestClient) -> None:
    body = secrets_client.get("/api/settings/user").json()

    assert body == {"assignee": getpass.getuser(), "source": "os_user", "setting_key": "user.assignee"}


def test_a_configured_assignee_wins_over_the_os_user(secrets_client: TestClient) -> None:
    secrets_client.put("/api/settings/project/user.assignee", json={"kind": "value", "value": "support_lead"})

    body = secrets_client.get("/api/settings/user").json()

    assert (body["assignee"], body["source"]) == ("support_lead", "setting")


def test_the_inbox_query_reaches_the_engine_with_every_filter(
    secrets_client: TestClient, secrets_engine: FakeEngine
) -> None:
    response = secrets_client.get(
        "/api/runs",
        params={
            "assignee": "me",
            "sort": "deadline_at",
            "overdue": "true",
            "deadline_before": "2026-09-19T10:00:00Z",
            "since": "2026-09-01T00:00:00Z",
            "until": "2026-09-30T00:00:00Z",
            "status": "suspended",
        },
    )
    query = secrets_engine.list_queries[-1]

    assert response.status_code == 200
    assert (query.assignee, query.sort, query.overdue, query.status) == ("me", "deadline_at", True, "suspended")
    assert query.deadline_before == datetime(2026, 9, 19, 10, 0, tzinfo=UTC)
    assert (query.since, query.until) == (
        datetime(2026, 9, 1, tzinfo=UTC),
        datetime(2026, 9, 30, tzinfo=UTC),
    )


def test_a_run_start_warns_about_secrets_that_are_not_set(secrets_client: TestClient) -> None:
    response = secrets_client.post("/api/runs", json={"flow_id": "intake", "mode": "live", "input": {"text": "hi"}})
    warnings = response.json()["warnings"]

    assert response.status_code == 201
    assert [item["path"] for item in warnings] == [["secrets", "SHOP_KB_TOKEN"], ["secrets", "SHOP_HELPDESK_TOKEN"]]
    assert {item["code"] for item in warnings} == {"SECRET_MISSING"}


def test_a_run_start_stays_quiet_once_every_secret_is_set(secrets_client: TestClient) -> None:
    secrets_client.put("/api/settings/project/secrets.shop_kb_token", json={"kind": "secret", "secret": KB_TOKEN})
    secrets_client.put("/api/settings/project/secrets.shop_helpdesk_token", json={"kind": "secret", "secret": KB_TOKEN})

    response = secrets_client.post("/api/runs", json={"flow_id": "intake", "mode": "live", "input": {"text": "hi"}})

    assert response.status_code == 201
    assert response.json()["warnings"] == []
