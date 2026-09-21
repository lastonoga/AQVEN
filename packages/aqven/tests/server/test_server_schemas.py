import json
from pathlib import Path
from typing import Final

from fastapi.testclient import TestClient

from aqven.ports import CHAT_EVENT_TYPES
from aqven.runtime.events import RUN_EVENT_TYPES
from aqven.spec import SCHEMA_DIALECT, NodeKind, SpecKind, write_editor_schemas

SPEC_EVENT_TYPES: Final = {"files_changed", "diagnostics_changed", "resync"}
TYPE_VARIANTS: Final = {"record", "enum", "union", "id", "value"}
CHANNELS: Final = ("spec", "run", "chat")


def test_event_schemas_cover_every_member_of_the_three_unions(server_client: TestClient) -> None:
    schemas = server_client.get("/api/schemas/events").json()["schemas"]

    assert set(schemas["spec"]) == SPEC_EVENT_TYPES
    assert set(schemas["run"]) == set(RUN_EVENT_TYPES)
    assert set(schemas["chat"]) == set(CHAT_EVENT_TYPES)


def test_every_event_schema_is_a_self_contained_document_keyed_by_its_type(server_client: TestClient) -> None:
    schemas = server_client.get("/api/schemas/events").json()["schemas"]
    documents = [(name, body) for channel in CHANNELS for name, body in schemas[channel].items()]

    assert documents
    assert all(body["$schema"] == SCHEMA_DIALECT for _, body in documents)
    assert all(body["type"] == "object" for _, body in documents)
    assert all(body["properties"]["type"]["const"] == name for name, body in documents)


def test_event_catalog_keeps_the_channel_arrays_as_client_type_anchors(server_client: TestClient) -> None:
    body = server_client.get("/api/schemas/events").json()

    assert [body[channel] for channel in CHANNELS] == [[], [], []]
    assert body["schemas"]["dialect"] == SCHEMA_DIALECT
    assert body["schemas"]["run"]["node_output_delta"]["properties"]["part_kind"]["$ref"].endswith("OutputPartKind")


def test_spec_schema_catalog_covers_every_definition_kind(server_client: TestClient) -> None:
    body = server_client.get("/api/spec-schemas").json()
    entries = {entry["kind"]: entry for entry in body["schemas"]}

    assert body["dialect"] == SCHEMA_DIALECT
    assert set(entries) == {kind.value for kind in SpecKind}
    assert entries["Node"]["path"] == ".aqven/schema/node.schema.json"
    assert all(entry["json_schema"]["$schema"] == SCHEMA_DIALECT for entry in entries.values())


def test_node_schema_carries_a_document_per_node_kind(server_client: TestClient) -> None:
    body = server_client.get("/api/spec-schemas/Node").json()
    variants = body["variants"]

    assert set(variants) == {kind.value for kind in NodeKind}
    assert all(schema["properties"]["node"]["const"] == name for name, schema in variants.items())
    assert body["json_schema"]["discriminator"]["propertyName"] == "node"


def test_type_schema_carries_a_document_per_type_kind(server_client: TestClient) -> None:
    body = server_client.get("/api/spec-schemas/Type").json()

    assert set(body["variants"]) == TYPE_VARIANTS
    assert body["variants"]["enum"]["properties"]["values"]["minItems"] == 1


def test_kinds_without_variants_answer_an_empty_mapping(server_client: TestClient) -> None:
    body = server_client.get("/api/spec-schemas/Flow").json()

    assert body["variants"] == {}
    assert body["json_schema"]["properties"]["kind"]["const"] == "Flow"


def test_unknown_definition_kind_answers_the_error_envelope(server_client: TestClient) -> None:
    refused = server_client.get("/api/spec-schemas/Fragment")
    body = refused.json()

    assert refused.status_code == 422
    assert (body["ok"], body["code"], body["op"]) == (False, "REQUEST_INVALID", "spec_schema_get")
    assert [problem["path"] for problem in body["problems"]] == [["path", "kind"]]


def test_published_schema_matches_the_file_written_for_the_editor(server_client: TestClient, tmp_path: Path) -> None:
    write_editor_schemas(tmp_path)
    written = json.loads((tmp_path / ".aqven" / "schema" / "agent.schema.json").read_text(encoding="utf-8"))

    assert server_client.get("/api/spec-schemas/Agent").json()["json_schema"] == written
