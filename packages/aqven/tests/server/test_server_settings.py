from collections.abc import Iterator
from pathlib import Path
from typing import Final

import pytest
from fastapi.testclient import TestClient
from server_fakes import FakeEngine, copy_fixture

from aqven.app.locations import ProjectState, StudioState
from aqven.app.settings_store import open_settings_store
from aqven.server import ServerOptions, create_app

TOKEN: Final = "settings-token-0123456789"
BASE: Final = "http://127.0.0.1:5180"
SECRET: Final = "sk-or-v1-abcdefghijklmnopqrstuvwxyz"
ENV_SECRET: Final = "sk-or-env-1234567890abcd"
GEMINI_SECRET: Final = "AIza-gemini-0123456789abcdef"
GOOGLE_REF_YAML: Final = """- id: "google"
  api_key: "ref:env/GEMINI_API_KEY"
  data_policy:
    allows_pii: false
    allows_sensitive: false
    retention: "zero"
"""


@pytest.fixture
def settings_project(tmp_path: Path) -> Path:
    root = copy_fixture("standard_shop", tmp_path)
    project_file = root / "aqven.yaml"
    project_file.write_text(project_file.read_text(encoding="utf-8") + GOOGLE_REF_YAML, encoding="utf-8")
    return root


@pytest.fixture
def settings_client(tmp_path: Path, settings_project: Path) -> Iterator[TestClient]:
    project = ProjectState(settings_project)
    project.ensure()
    studio = StudioState(tmp_path / "data")
    studio.ensure()
    environment = {"OPENROUTER_API_KEY": ENV_SECRET}
    store = open_settings_store(project, studio, environment)
    options = ServerOptions(
        access_token=TOKEN,
        port=5180,
        watch=False,
        serve_studio=False,
        blob_directory=tmp_path / "blobs",
        environ=environment,
    )
    app = create_app(settings_project, FakeEngine(), store, options=options)
    with TestClient(app, base_url=BASE, headers={"Authorization": f"Bearer {TOKEN}"}) as client:
        yield client


def test_secret_write_lands_in_dotenv_and_is_masked(settings_client: TestClient, settings_project: Path) -> None:
    response = settings_client.put(
        "/api/settings/project/providers.anthropic.api_key", json={"kind": "secret", "secret": SECRET}
    )
    body = response.json()
    listing = settings_client.get("/api/settings/project")
    single = settings_client.get("/api/settings/project/providers.anthropic.api_key")
    assert response.status_code == 200
    assert (body["kind"], body["value"], body["env_var"]) == ("secret", None, "ANTHROPIC_API_KEY")
    assert body["masked"].endswith("wxyz")
    assert (settings_project / ".env").read_text(encoding="utf-8") == f"ANTHROPIC_API_KEY='{SECRET}'\n"
    assert ".env" in (settings_project / ".gitignore").read_text(encoding="utf-8").splitlines()
    assert all(SECRET not in text for text in (response.text, listing.text, single.text))
    assert [item["key"] for item in listing.json()] == ["providers.anthropic.api_key"]
    deleted = settings_client.delete("/api/settings/project/providers.anthropic.api_key").json()
    assert deleted == {"scope": "project", "key": "providers.anthropic.api_key", "deleted": True}
    assert (settings_project / ".env").read_text(encoding="utf-8") == ""


def test_value_setting_roundtrip(settings_client: TestClient) -> None:
    written = settings_client.put("/api/settings/studio/ui.theme", json={"kind": "value", "value": "dark"})
    assert written.json()["value"] == "dark"
    assert settings_client.get("/api/settings/studio/ui.theme").json()["value"] == "dark"
    deleted = settings_client.delete("/api/settings/studio/ui.theme").json()
    assert deleted == {"scope": "studio", "key": "ui.theme", "deleted": True}
    assert settings_client.get("/api/settings/studio/ui.theme").status_code == 404


def test_provider_status_prefers_environment_and_uses_aqven_yaml_names(settings_client: TestClient) -> None:
    settings_client.put("/api/settings/project/providers.openrouter.api_key", json={"kind": "secret", "secret": SECRET})
    settings_client.put(
        "/api/settings/project/providers.google.api_key", json={"kind": "secret", "secret": GEMINI_SECRET}
    )
    response = settings_client.get("/api/settings/providers")
    status = {item["provider"]: item for item in response.json()}
    assert (status["openrouter"]["source"], status["openrouter"]["env_var"]) == ("environment", "OPENROUTER_API_KEY")
    assert status["openrouter"]["masked"].endswith("abcd")
    assert (status["google"]["source"], status["google"]["env_var"], status["google"]["declared"]) == (
        "dotenv",
        "GEMINI_API_KEY",
        True,
    )
    assert (status["openai"]["declared"], status["openai"]["source"]) == (True, None)
    assert (status["anthropic"]["declared"], status["anthropic"]["env_var"]) == (False, "ANTHROPIC_API_KEY")
    assert all(secret not in response.text for secret in (SECRET, ENV_SECRET, GEMINI_SECRET))


def test_secret_outside_project_scope_is_rejected_with_a_fix(settings_client: TestClient) -> None:
    studio = settings_client.put(
        "/api/settings/studio/providers.openrouter.api_key", json={"kind": "secret", "secret": SECRET}
    )
    plain = settings_client.put("/api/settings/project/providers.openai.api_key", json={"kind": "value", "value": "x"})
    studio_body = studio.json()
    assert studio.status_code == 422
    assert studio_body["code"] == "REQUEST_INVALID"
    assert [problem["code"] for problem in studio_body["problems"]] == ["SECRET_SCOPE_UNSUPPORTED"]
    assert "fix: write providers.openrouter.api_key to scope project" in studio_body["message"]
    assert SECRET not in studio.text
    assert [problem["code"] for problem in plain.json()["problems"]] == ["SECRET_KEY_NEEDS_SECRET"]


def test_invalid_scope_and_key(settings_client: TestClient) -> None:
    scope = settings_client.get("/api/settings/global")
    key = settings_client.put("/api/settings/studio/Bad Key", json={"kind": "value", "value": 1})
    assert scope.status_code == 422
    assert key.status_code == 422


def test_secret_validation_error_does_not_echo_secret(settings_client: TestClient) -> None:
    response = settings_client.put(
        "/api/settings/project/providers.openai.api_key", json={"kind": "secret", "secret": SECRET, "extra": SECRET}
    )
    assert response.status_code == 422
    assert SECRET not in response.text
