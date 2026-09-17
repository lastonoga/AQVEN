import json
import os
import warnings
from pathlib import Path

from aqven.server import (
    ServerRuntime,
    contract_app,
    export_openapi,
    openapi_text,
    read_runtime,
    remove_runtime,
    write_runtime,
)

METHODS = ("get", "post", "put", "patch", "delete", "head")


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
    run_items = schemas["RunEvent"]
    spec_items = schemas["SpecEvent"]
    assert run_items["discriminator"]["propertyName"] == "type"
    assert "run_finished" in run_items["discriminator"]["mapping"]
    assert "node_output_delta" in run_items["discriminator"]["mapping"]
    assert set(spec_items["discriminator"]["mapping"]) == {"files_changed", "diagnostics_changed", "resync"}


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
