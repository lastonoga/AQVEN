from collections.abc import Iterator
from pathlib import Path
from typing import Final

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from server_fakes import FakeEngine, MemorySettings, copy_fixture

from aqven.server import ServerOptions, create_app

SERVER_TOKEN: Final = "test-token-0123456789"
SERVER_BASE: Final = "http://127.0.0.1:5180"
AUTH: Final = {"Authorization": f"Bearer {SERVER_TOKEN}"}


@pytest.fixture
def server_project(tmp_path: Path) -> Path:
    return copy_fixture("standard_shop", tmp_path)


@pytest.fixture
def server_engine() -> FakeEngine:
    return FakeEngine()


@pytest.fixture
def server_settings() -> MemorySettings:
    return MemorySettings()


@pytest.fixture
def server_options(tmp_path: Path) -> ServerOptions:
    return ServerOptions(
        access_token=SERVER_TOKEN,
        port=5180,
        watch=False,
        serve_studio=False,
        blob_directory=tmp_path / "blobs",
        environ={"OPENROUTER_API_KEY": "sk-or-env-1234567890abcd"},
    )


@pytest.fixture
def server_app(
    server_project: Path,
    server_engine: FakeEngine,
    server_settings: MemorySettings,
    server_options: ServerOptions,
) -> FastAPI:
    return create_app(server_project, server_engine, server_settings, options=server_options)


@pytest.fixture
def server_client(server_app: FastAPI) -> Iterator[TestClient]:
    with TestClient(server_app, base_url=SERVER_BASE, headers=AUTH) as client:
        yield client
