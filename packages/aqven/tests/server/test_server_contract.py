import json
import os
import warnings
from pathlib import Path

import aqven
from aqven.server import (
    ServerRuntime,
    contract_app,
    export_openapi,
    openapi_text,
    read_runtime,
    remove_runtime,
    write_runtime,
)
from aqven.spec import SpecKind

METHODS = ("get", "post", "put", "patch", "delete", "head")
SCHEMA_PATHS = {
    "/api/schemas/events": "event_catalog",
    "/api/spec-schemas": "spec_schema_list",
    "/api/spec-schemas/{kind}": "spec_schema_get",
}


def test_openapi_export_and_route_extensions(tmp_path: Path) -> None:
    with warnings.catch_warnings():
        warnings.simplefilter("error")
        target = export_openapi(tmp_path / "openapi.json")
    document = json.loads(target.read_text(encoding="utf-8"))
    operations = [op for item in document["paths"].values() for method, op in item.items() if method in METHODS]
    assert document["openapi"].startswith("3.1")
    assert all(("x-aqven-operation" in op) != ("x-aqven-rest-only" in op) for op in operations)
    ids = [op["operationId"] for op in operations]
    assert len(ids) == len(set(ids))
    assert "/mcp" not in "".join(document["paths"])
    assert document["paths"]["/api/runs"]["post"]["responses"]["422"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/ApiError"
    }


def test_event_catalog_is_discriminated_union() -> None:
    schemas = json.loads(openapi_text(contract_app()))["components"]["schemas"]
    catalog = schemas["EventCatalog"]["properties"]
    assert catalog["run"]["items"] == {"$ref": "#/components/schemas/RunEvent"}
    assert catalog["spec"]["items"] == {"$ref": "#/components/schemas/SpecEvent"}
    assert catalog["chat"]["items"] == {"$ref": "#/components/schemas/ChatEvent"}
    assert catalog["schemas"] == {"$ref": "#/components/schemas/EventSchemas"}
    run_items = schemas["RunEvent"]
    spec_items = schemas["SpecEvent"]
    assert run_items["discriminator"]["propertyName"] == "type"
    assert "run_finished" in run_items["discriminator"]["mapping"]
    assert "node_output_delta" in run_items["discriminator"]["mapping"]
    assert set(spec_items["discriminator"]["mapping"]) == {"files_changed", "diagnostics_changed", "resync"}


def test_openapi_document_publishes_the_schema_paths() -> None:
    document = json.loads(openapi_text(contract_app()))
    paths = document["paths"]
    ids = {path: item["get"]["operationId"] for path, item in paths.items() if path in SCHEMA_PATHS}

    assert ids == SCHEMA_PATHS
    assert paths["/api/spec-schemas/{kind}"]["get"]["parameters"][0]["schema"] == {
        "$ref": "#/components/schemas/SpecKind"
    }
    assert document["components"]["schemas"]["SpecKind"]["enum"] == [kind.value for kind in SpecKind]


def test_spec_event_stream_is_described_as_a_stream() -> None:
    operation = json.loads(openapi_text(contract_app()))["paths"]["/api/events/spec"]["get"]

    assert "text/event-stream" in operation["responses"]["200"]["content"]
    assert "stream" in operation["summary"].lower()
    assert "not a schema document" in operation["description"]
    assert "/api/schemas/events" in operation["description"]


def test_export_openapi_is_public_and_needs_no_running_server(tmp_path: Path) -> None:
    assert aqven.export_openapi is export_openapi

    target = aqven.export_openapi(tmp_path / "contract" / "openapi.json")
    document = json.loads(target.read_text(encoding="utf-8"))

    assert document["info"]["title"] == "AQVEN Studio API"
    assert set(SCHEMA_PATHS) <= set(document["paths"])


def test_runtime_file_is_owner_only(tmp_path: Path) -> None:
    runtime = ServerRuntime(
        host="127.0.0.1",
        port=5180,
        token="secret-token",
        pid=os.getpid(),
        url="http://127.0.0.1:5180/",
        mcp_url="http://127.0.0.1:5180/mcp/",
        project_root=str(tmp_path),
    )
    path = write_runtime(tmp_path, runtime)
    assert path == tmp_path / ".aqven" / "server.json"
    assert path.stat().st_mode & 0o777 == 0o600
    assert read_runtime(tmp_path) == runtime
    remove_runtime(tmp_path, os.getpid() + 1)
    assert path.exists()
    remove_runtime(tmp_path, os.getpid())
    assert read_runtime(tmp_path) is None
