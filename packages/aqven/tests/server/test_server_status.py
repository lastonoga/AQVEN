import asyncio
import sqlite3
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Final, get_args

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import JsonValue, SecretStr
from server_fakes import AUTH, MOMENT, SERVER_BASE, SERVER_TOKEN, FakeEngine, MemorySettings

from aqven.app.settings_values import SettingValuesDatabase
from aqven.engine.errors import EngineNotLaunched
from aqven.engine.status_probe import DbosStatusProbe
from aqven.ports.settings import SettingKey, SettingScope
from aqven.server import ServerOptions, create_app
from aqven.server.probes import SqliteStatusProbe, StatusProbe, StatusProbes, project_probes
from aqven.server.resources import IndexState, IndexStatus, ProblemCounts, ProjectInfo
from aqven.server.views.secrets import ProviderKeyStatus
from aqven.server.views.status import (
    MAX_STATUS_NAMES,
    STATUS_CHECKERS,
    StatusCheckId,
    model_keys_verdict,
    project_verdict,
)
from aqven.spec import ProviderName

OPENAI_KEY: Final = "sk-openai-0123456789abcdef"
CHECK_IDS: Final = ["database", "engine", "project", "model_keys"]
FAST_TIMEOUT: Final = 0.05
BROKEN_NODE: Final = "flows/intake/nodes/clean/clean.node.yaml"


@dataclass(frozen=True, slots=True)
class AnsweringProbe:
    async def ping(self) -> None:
        return None


@dataclass(frozen=True, slots=True)
class BrokenProbe:
    async def ping(self) -> None:
        raise OSError("disk I/O error")


@dataclass(frozen=True, slots=True)
class HangingProbe:
    async def ping(self) -> None:
        await asyncio.sleep(60)


class BrokenSettings(MemorySettings):
    async def read_secret(self, scope: SettingScope, key: SettingKey) -> SecretStr | None:
        raise OSError("settings store is gone")


def probes(database: StatusProbe | None = None, engine: StatusProbe | None = None) -> StatusProbes:
    return StatusProbes(
        database=database or AnsweringProbe(),
        engine=engine or AnsweringProbe(),
        timeout_seconds=FAST_TIMEOUT,
    )


def options(tmp_path: Path, environ: dict[str, str]) -> ServerOptions:
    return ServerOptions(
        access_token=SERVER_TOKEN,
        port=5180,
        watch=False,
        serve_studio=False,
        blob_directory=tmp_path / "blobs",
        environ=environ,
    )


def status_app(
    root: Path,
    tmp_path: Path,
    probe_set: StatusProbes,
    settings: MemorySettings | None = None,
    environ: dict[str, str] | None = None,
) -> FastAPI:
    chosen = {"OPENAI_API_KEY": OPENAI_KEY} if environ is None else environ
    return create_app(
        root, FakeEngine(), settings or MemorySettings(), options=options(tmp_path, chosen), probes=probe_set
    )


def status_of(app: FastAPI) -> dict[str, JsonValue]:
    with TestClient(app, base_url=SERVER_BASE, headers=AUTH) as client:
        response = client.get("/api/status")
    assert response.status_code == 200
    body: dict[str, JsonValue] = response.json()
    return body


def checks_of(body: dict[str, JsonValue]) -> dict[str, dict[str, JsonValue]]:
    checks = body["checks"]
    assert isinstance(checks, list)
    found: dict[str, dict[str, JsonValue]] = {}
    for item in checks:
        assert isinstance(item, dict)
        found[str(item["id"])] = item
    return found


def project_info(
    errors: int = 0,
    warnings: int = 0,
    quarantined: tuple[str, ...] = (),
    index: IndexStatus = "ready",
    pending: int = 0,
) -> ProjectInfo:
    return ProjectInfo(
        root="/project",
        package="shop",
        engine_version="0.0.2",
        tree_hash="sha256-" + "0" * 64,
        project_file=None,
        lock_file=None,
        index=IndexState(status=index, generation=1, indexed_at=MOMENT, pending_files=pending),
        problems=ProblemCounts(error=errors, warning=warnings, info=0),
        quarantined_files=quarantined,
        spec_seq=0,
        mcp_url=None,
    )


def key_status(provider: str, declared: bool, resolved: bool) -> ProviderKeyStatus:
    return ProviderKeyStatus(
        provider=ProviderName(provider),
        setting_key=f"providers.{provider}.api_key",
        env_var=f"{provider.upper()}_API_KEY",
        declared=declared,
        source="environment" if resolved else None,
        masked="••••" if resolved else None,
    )


@pytest.fixture
def healthy_client(server_project: Path, tmp_path: Path) -> Iterator[TestClient]:
    app = status_app(server_project, tmp_path, probes())
    with TestClient(app, base_url=SERVER_BASE, headers=AUTH) as client:
        yield client


def test_status_reports_every_check_in_contract_order(healthy_client: TestClient) -> None:
    response = healthy_client.get("/api/status")
    body = response.json()

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert datetime.fromisoformat(body["checked_at"]).tzinfo is not None
    assert [item["id"] for item in body["checks"]] == CHECK_IDS
    assert body["checks"][0] == {"id": "database", "state": "ok", "counts": {}, "names": []}
    assert body["checks"][2] == {
        "id": "project",
        "state": "ok",
        "counts": {"errors": 0, "warnings": 0, "quarantined": 0, "pending": 0},
        "names": [],
    }
    assert body["checks"][3] == {
        "id": "model_keys",
        "state": "ok",
        "counts": {"declared": 1, "missing": 0},
        "names": [],
    }


def test_status_requires_the_token_like_other_api_routes(server_project: Path, tmp_path: Path) -> None:
    app = status_app(server_project, tmp_path, probes())
    with TestClient(app, base_url=SERVER_BASE) as client:
        anonymous = client.get("/api/status")
        wrong = client.get("/api/status", headers={"Authorization": "Bearer nope"})
        allowed = client.get("/api/status", headers=AUTH)

    assert anonymous.status_code == 401
    assert anonymous.json()["code"] == "UNAUTHORIZED"
    assert wrong.status_code == 401
    assert allowed.status_code == 200


def test_a_failing_database_probe_is_an_error(server_project: Path, tmp_path: Path) -> None:
    checks = checks_of(status_of(status_app(server_project, tmp_path, probes(database=BrokenProbe()))))

    assert checks["database"] == {"id": "database", "state": "error", "counts": {}, "names": []}
    assert checks["engine"]["state"] == "ok"


def test_a_hanging_engine_probe_times_out_into_an_error(server_project: Path, tmp_path: Path) -> None:
    checks = checks_of(status_of(status_app(server_project, tmp_path, probes(engine=HangingProbe()))))

    assert checks["engine"]["state"] == "error"
    assert checks["database"]["state"] == "ok"


def test_a_quarantined_file_makes_the_project_an_error(server_project: Path, tmp_path: Path) -> None:
    node = server_project / BROKEN_NODE
    node.write_text(node.read_text(encoding="utf-8").replace('node: "code"', 'node: "cod"'), encoding="utf-8")

    project = checks_of(status_of(status_app(server_project, tmp_path, probes())))["project"]
    counts = project["counts"]

    assert project["state"] == "error"
    assert project["names"] == [BROKEN_NODE]
    assert isinstance(counts, dict)
    assert counts["quarantined"] == 1
    assert isinstance(counts["errors"], int)
    assert counts["errors"] >= 1


def test_a_warning_diagnostic_makes_the_project_a_warning(server_project: Path, tmp_path: Path) -> None:
    generated = server_project / "types.py"
    generated.write_text(generated.read_text(encoding="utf-8") + "\nDRIFT = 1\n", encoding="utf-8")

    project = checks_of(status_of(status_app(server_project, tmp_path, probes())))["project"]

    assert project["state"] == "warning"
    assert project["counts"] == {"errors": 0, "warnings": 1, "quarantined": 0, "pending": 0}


def test_a_declared_provider_without_a_key_is_a_warning(server_project: Path, tmp_path: Path) -> None:
    app = status_app(server_project, tmp_path, probes(), environ={"OPENROUTER_API_KEY": "sk-or-1234567890abcd"})

    model_keys = checks_of(status_of(app))["model_keys"]

    assert model_keys == {
        "id": "model_keys",
        "state": "warning",
        "counts": {"declared": 1, "missing": 1},
        "names": ["openai"],
    }


def test_a_key_in_the_project_env_file_counts_as_resolved(server_project: Path, tmp_path: Path) -> None:
    settings = MemorySettings()
    asyncio.run(settings.set_secret("project", SettingKey("providers.openai.api_key"), SecretStr(OPENAI_KEY)))

    model_keys = checks_of(status_of(status_app(server_project, tmp_path, probes(), settings, environ={})))[
        "model_keys"
    ]

    assert model_keys["state"] == "ok"


def test_a_check_that_raises_is_reported_as_an_error_not_a_500(server_project: Path, tmp_path: Path) -> None:
    checks = checks_of(status_of(status_app(server_project, tmp_path, probes(), BrokenSettings())))

    assert checks["model_keys"] == {"id": "model_keys", "state": "error", "counts": {}, "names": []}
    assert checks["project"]["state"] == "ok"


@pytest.mark.parametrize(
    ("info", "state"),
    [
        (project_info(), "ok"),
        (project_info(warnings=2), "warning"),
        (project_info(index="building"), "warning"),
        (project_info(pending=3), "warning"),
        (project_info(errors=1, index="degraded"), "error"),
        (project_info(quarantined=("flows/a/flow.yaml",)), "error"),
    ],
)
def test_project_verdict_follows_problem_counts_and_index(info: ProjectInfo, state: str) -> None:
    assert project_verdict(info).state == state


def test_model_keys_verdict_ignores_undeclared_providers_and_caps_names() -> None:
    missing = [key_status(f"custom{index:02d}", declared=True, resolved=False) for index in range(25)]
    statuses = [*missing, key_status("openai", declared=True, resolved=True), key_status("groq", False, False)]

    verdict = model_keys_verdict(statuses)

    assert verdict.state == "warning"
    assert verdict.counts == {"declared": 26, "missing": 25}
    assert len(verdict.names) == MAX_STATUS_NAMES
    assert verdict.names[0] == "custom00"
    assert "groq" not in verdict.names


def test_every_check_id_has_a_checker() -> None:
    assert list(STATUS_CHECKERS) == list(get_args(StatusCheckId.__value__))


def test_sqlite_probe_answers_for_the_project_store(tmp_path: Path) -> None:
    database = tmp_path / ".aqven" / "aqven.sqlite"
    SettingValuesDatabase.open(database)

    asyncio.run(project_probes(tmp_path).database.ping())


def test_sqlite_probe_fails_without_creating_a_missing_store(tmp_path: Path) -> None:
    missing = tmp_path / "gone.sqlite"

    with pytest.raises(sqlite3.OperationalError, match="unable to open"):
        asyncio.run(SqliteStatusProbe(missing).ping())
    assert not missing.exists()


def test_sqlite_probe_fails_on_a_corrupt_store(tmp_path: Path) -> None:
    corrupt = tmp_path / "corrupt.sqlite"
    corrupt.write_bytes(b"this is not a database file at all, just bytes" * 20)

    with pytest.raises(sqlite3.DatabaseError, match="not a database"):
        asyncio.run(SqliteStatusProbe(corrupt).ping())


def test_dbos_probe_fails_while_the_engine_is_not_launched() -> None:
    with pytest.raises(EngineNotLaunched):
        asyncio.run(DbosStatusProbe().ping())
