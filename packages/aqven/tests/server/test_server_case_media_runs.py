import asyncio
import hashlib
from collections.abc import Iterator, Mapping
from dataclasses import replace
from pathlib import Path
from typing import Final

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from mcp.client import Client
from pydantic import JsonValue, TypeAdapter
from server_fakes import AUTH, RUN_ID, SERVER_BASE, FakeEngine, MemorySettings, copy_fixture

from aqven.app.composition import ReportCompiler
from aqven.codegen import generate_types
from aqven.engine.blobs import FileBlobStore
from aqven.server import ServerOptions, create_app
from aqven.server.mcp import McpPorts, ProjectPaths, build_catalog, build_mcp_server
from aqven.server.views.runs import RunStartService
from aqven.server.workspace import ProjectWorkspace
from aqven.testing import MemoryBlobStore

PHOTO: Final = b"\x89PNG\r\n\x1a\nlamp photo bytes"
PHOTO_FILE: Final = "datasets/looks_cases/lamp.png"
RUN_CASE: Final[dict[str, JsonValue]] = {"flow_id": "looks", "mode": "live", "dataset_item_id": "looks_cases/lamp"}
JSON_OBJECT: Final = TypeAdapter(dict[str, JsonValue])

SNAP: Final = """apiVersion: "aqven/v1"
kind: "Type"
type: "record"
description: "A customer note with a photo"
fields:
- name: "text"
  type: "Text"
  description: "Customer note"
  maxLength: 200
- name: "photo"
  type: "Image"
  description: "Photo of the lamp"
"""

CAPTION: Final = """apiVersion: "aqven/v1"
kind: "Type"
type: "record"
description: "A caption for a photo"
fields:
- name: "text"
  type: "Text"
  description: "Caption"
  maxLength: 200
"""

LOOKS_FLOW: Final = """apiVersion: "aqven/v1"
kind: "Flow"
description: "Caption a customer photo"
input: "Snap"
output: "Caption"
returns:
- name: "text"
  from: "$describe.out.text"
order:
- "describe"
"""

DESCRIBE_NODE: Final = """apiVersion: "aqven/v1"
kind: "Node"
node: "llm"
description: "Caption the photo"
agent: "writer"
in:
- name: "text"
  from: "$input.text"
- name: "photo"
  from: "$input.photo"
"""

DESCRIBE_INFERENCE: Final = """apiVersion: "aqven/v1"
kind: "Inference"
description: "One caption for a customer photo"
in:
- name: "text"
  type: "Text"
  description: "Customer note"
  maxLength: 200
- name: "photo"
  type: "Image"
  description: "Photo of the lamp"
out:
- name: "text"
  type: "Text"
  description: "Caption"
  maxLength: 200
"""

DESCRIBE_PROMPT: Final = """Caption the photo the customer sent.
<note>{{ text }}</note>
{{ output_format }}
"""

LOOKS_CASES: Final = """apiVersion: "aqven/v1"
kind: "Dataset"
flow: "looks"
cases:
- name: "lamp"
  inputs:
    text: "the lamp flickers"
    photo:
      $media: "image/png"
      file: "lamp.png"
"""

LOOKS_FILES: Final[Mapping[str, str]] = {
    "types/snap.yaml": SNAP,
    "types/caption.yaml": CAPTION,
    "flows/looks/flow.yaml": LOOKS_FLOW,
    "flows/looks/nodes/describe/describe.node.yaml": DESCRIBE_NODE,
    "flows/looks/nodes/describe/describe.inference.yaml": DESCRIBE_INFERENCE,
    "flows/looks/nodes/describe/describe.prompt.md": DESCRIBE_PROMPT,
    "datasets/looks_cases.yaml": LOOKS_CASES,
}


def blob_id(data: bytes) -> str:
    return f"sha256-{hashlib.sha256(data).hexdigest()}"


def stored_photo(name: str = "lamp.png") -> dict[str, JsonValue]:
    return {"$media": "image/png", "blob_id": blob_id(PHOTO), "size_bytes": len(PHOTO), "name": name}


@pytest.fixture
def looks_project(tmp_path: Path) -> Path:
    root = copy_fixture("dataset_shop", tmp_path)
    for relative, text in LOOKS_FILES.items():
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
    (root / PHOTO_FILE).parent.mkdir(parents=True, exist_ok=True)
    (root / PHOTO_FILE).write_bytes(PHOTO)
    generated = generate_types(root)
    assert generated.project is not None, generated.diagnostics
    return root


@pytest.fixture
def looks_client(
    looks_project: Path, server_engine: FakeEngine, server_settings: MemorySettings, server_options: ServerOptions
) -> Iterator[TestClient]:
    options = replace(server_options, compiler=ReportCompiler())
    app: FastAPI = create_app(looks_project, server_engine, server_settings, options=options)
    with TestClient(app, base_url=SERVER_BASE, headers=AUTH) as client:
        yield client


def test_run_this_case_hands_the_engine_the_case_file_as_a_stored_blob(
    looks_client: TestClient, looks_project: Path, server_engine: FakeEngine
) -> None:
    started = looks_client.post("/api/runs", json=RUN_CASE)

    assert started.status_code == 201, started.text
    request = server_engine.started[-1]
    assert request.input == {"text": "the lamp flickers", "photo": stored_photo()}
    assert request.dataset_item_id is None
    assert server_engine.started_dataset_items[-1] == "looks_cases/lamp"
    assert FileBlobStore(looks_project / ".aqven" / "blobs").read(blob_id(PHOTO)) == PHOTO


def test_a_case_file_that_vanished_stops_the_run_before_the_engine(
    looks_client: TestClient, looks_project: Path, server_engine: FakeEngine
) -> None:
    (looks_project / PHOTO_FILE).unlink()

    refused = looks_client.post("/api/runs", json=RUN_CASE)

    assert refused.status_code == 409, refused.text
    body = refused.json()
    assert body["code"] == "NOT_RUNNABLE"
    assert [(problem["path"], problem["code"]) for problem in body["problems"]] == [
        (["cases", "lamp", "inputs", "photo"], "E_MEDIA_FILE_MISSING")
    ]
    assert server_engine.started == []


def test_the_dataset_range_preview_takes_a_file_reference_as_the_photo(looks_client: TestClient) -> None:
    preview = looks_client.post(
        "/api/flows/looks/dataset-range", json={"dataset_id": "looks_cases", "case_names": ["lamp"]}
    )

    assert preview.status_code == 200, preview.text
    assert [pair["available"] for pair in preview.json()["ranges"]] == [True]


def test_a_new_dataset_accepts_a_file_reference_where_the_flow_expects_an_image(looks_client: TestClient) -> None:
    photo: dict[str, JsonValue] = {"$media": "image/png", "file": "@root/datasets/looks_cases/lamp.png"}
    case: dict[str, JsonValue] = {"name": "shared", "inputs": {"text": "shared photo", "photo": photo}}

    created = looks_client.post(
        "/api/datasets", json={"dataset_id": "shared_looks", "flow_id": "looks", "cases": [case]}
    )

    assert created.status_code == 200, created.text
    stored = looks_client.get("/api/datasets/shared_looks/cases/shared").json()
    assert stored["inputs"]["photo"] == photo


async def mcp_run_start(root: Path, engine: FakeEngine, blobs: MemoryBlobStore) -> dict[str, JsonValue]:
    starting = RunStartService(
        facade=engine,
        settings=MemorySettings(),
        workspace=ProjectWorkspace(root),
        environ={},
        blobs=lambda project: blobs,
    )
    ports = McpPorts(paths=ProjectPaths.of(root, root), engine=engine, starting=starting)
    async with Client(build_mcp_server(build_catalog(ports)), cache=None) as client:
        result = await client.call_tool("run_start", RUN_CASE)
    assert result.is_error is False, result.structured_content
    return JSON_OBJECT.validate_python(result.structured_content)


def test_run_start_over_mcp_resolves_the_case_file_into_the_given_blob_store(looks_project: Path) -> None:
    engine = FakeEngine()
    blobs = MemoryBlobStore()

    started = asyncio.run(mcp_run_start(looks_project, engine, blobs))

    assert started["run_id"] == RUN_ID
    assert engine.started[-1].input == {"text": "the lamp flickers", "photo": stored_photo()}
    assert list(blobs.stored.values()) == [PHOTO]
    assert not (looks_project / ".aqven" / "blobs").exists()
