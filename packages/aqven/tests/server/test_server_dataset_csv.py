import asyncio
import csv
import json
import shutil
from collections.abc import Iterator
from dataclasses import replace
from io import StringIO
from pathlib import Path

import httpx2
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel, TypeAdapter
from server_fakes import AUTH, SERVER_BASE, FakeEngine, MemorySettings, copy_fixture

from aqven.app.composition import ReportCompiler
from aqven.server import ServerOptions, create_app
from aqven.server.blobs import DirectoryBlobStore
from aqven.server.views import dataset_csv
from aqven.spec import Image

LUMEN_SOURCE = Path(__file__).resolve().parents[4] / "examples/lumen"


@pytest.fixture
def csv_project(tmp_path: Path) -> Path:
    return copy_fixture("evals/eval_shop", tmp_path)


@pytest.fixture
def csv_client(
    csv_project: Path,
    server_engine: FakeEngine,
    server_settings: MemorySettings,
    server_options: ServerOptions,
) -> Iterator[TestClient]:
    app: FastAPI = create_app(
        csv_project, server_engine, server_settings, options=replace(server_options, compiler=ReportCompiler())
    )
    with TestClient(app, base_url=SERVER_BASE, headers=AUTH) as client:
        yield client


def upload(client: TestClient, path: str, content: str, *, dataset_id: str = "imported") -> httpx2.Response:
    return client.post(
        path,
        data={"dataset_id": dataset_id, "flow_id": "intake"},
        files={"file": ("cases.csv", content.encode(), "text/csv")},
    )


def test_csv_template_lists_unique_flow_columns_and_previews_its_example(csv_client: TestClient) -> None:
    response = csv_client.get("/api/datasets/import-csv/template", params={"flow_id": "intake"})

    assert response.status_code == 200, response.text
    template = response.json()
    assert template["flow_id"] == "intake"
    assert [field["column"] for field in template["fields"]][:2] == ["name", "inputs.text"]
    assert [field["column"] for field in template["fields"]].count("inputs.text") == 1
    assert template["nodes"]
    assert template["nodes"][0]["node_id"] == "reply"
    assert "inputs.text" in template["nodes"][0]["input_columns"]
    preview = upload(csv_client, "/api/datasets/import-csv/preview", template["csv"])
    assert preview.status_code == 200, preview.text
    assert preview.json()["ready"] is True, preview.text
    assert preview.json()["row_count"] == 1


def test_csv_template_exposes_per_node_context_and_all_fields_round_trip(
    tmp_path: Path,
    server_options: ServerOptions,
    server_engine: FakeEngine,
    server_settings: MemorySettings,
) -> None:
    with lumen_client(tmp_path, server_options, server_engine, server_settings) as client:
        response = client.get("/api/datasets/import-csv/template", params={"flow_id": "support_case"})
        assert response.status_code == 200, response.text
        template = response.json()
        fields = [field["column"] for field in template["fields"]]
        nodes = {node["node_id"]: node for node in template["nodes"]}

        assert fields[0] == "name"
        assert "inputs.customer.customer_id" in fields
        assert "inputs.voice_note" in fields
        assert len(fields) == len(set(fields))
        assert fields.count("context.date") == 1
        assert fields.count("context.tenant_id") == 1
        origin_page = next(field for field in template["fields"] if field["column"] == "inputs.origin.page")
        assert origin_page["required"] is False
        photo = next(field for field in template["fields"] if field["column"] == "inputs.photo")
        assert "Фото" in photo["description"]
        assert "node_outputs.prepare.message" in fields
        assert nodes["record__validate"]["parent_node_id"] == "record"
        assert nodes["record__validate"]["context_columns"] == ["context.date"]
        assert nodes["search_kb"]["context_columns"] == ["context.tenant_id"]
        assert nodes["prepare"]["context_columns"] == []
        assert "node_outputs.prepare.message" in nodes["triage"]["fixture_columns"]

        preview = client.post(
            "/api/datasets/import-csv/preview",
            data={"dataset_id": "csv_template_round_trip", "flow_id": "support_case"},
            files={"file": ("template.csv", template["csv"].encode(), "text/csv")},
        )
        assert preview.status_code == 200, preview.text
        assert preview.json()["ready"] is True, preview.text
        assert preview.json()["media_count"] == 0
        assert preview.json()["rows"][0]["full_flow_ready"] is True
        assert not any(field["kind"] == "unmatched" for field in preview.json()["columns"])

        imported = client.post(
            "/api/datasets/import-csv",
            data={"dataset_id": "csv_template_round_trip", "flow_id": "support_case"},
            files={"file": ("template.csv", template["csv"].encode(), "text/csv")},
        )
        assert imported.status_code == 201, imported.text
        assert imported.json()["cases"] == 1


def test_csv_preview_reports_mapping_and_runnability_without_creating_a_file(
    csv_client: TestClient, csv_project: Path
) -> None:
    response = upload(
        csv_client,
        "/api/datasets/import-csv/preview",
        "name,inputs.text,metadata.split\nfirst,Where is my order?,test\nsecond,Help with warranty,dev\n",
    )

    assert response.status_code == 200
    preview = response.json()
    assert preview["ready"] is True
    assert preview["row_count"] == 2
    assert preview["columns"] == [
        {"source": "name", "target": "name", "kind": "name"},
        {"source": "inputs.text", "target": "inputs.text", "kind": "input"},
        {"source": "metadata.split", "target": "metadata.split", "kind": "metadata"},
    ]
    assert preview["rows"][0]["name"] == "first"
    assert preview["rows"][0]["ready"] is True
    assert preview["rows"][0]["full_flow_ready"] is True
    assert preview["rows"][0]["nodes"][0]["node_id"] == "reply"
    assert preview["rows"][0]["nodes"][0]["ready"] is True
    assert not (csv_project / "datasets/imported.yaml").exists()


def test_csv_import_persists_cases_and_dataset_is_immediately_readable(csv_client: TestClient) -> None:
    response = upload(
        csv_client,
        "/api/datasets/import-csv",
        "name,text,metadata.split\nfirst,Where is my order?,test\nsecond,Help with warranty,dev\n",
    )

    assert response.status_code == 201
    assert response.json()["dataset_id"] == "imported"
    assert response.json()["cases"] == 2
    listed = csv_client.get("/api/datasets/imported/cases").json()["items"]
    assert [case["name"] for case in listed] == ["first", "second"]
    assert listed[0]["inputs"] == {"text": "Where is my order?"}
    assert listed[0]["metadata"] == {"split": "test"}


def test_text_schema_keeps_json_looking_cells_as_strings(csv_client: TestClient) -> None:
    response = upload(csv_client, "/api/datasets/import-csv", "name,text\nfirst,true\nsecond,12345\n")

    assert response.status_code == 201, response.text
    cases = csv_client.get("/api/datasets/imported/cases").json()["items"]
    assert [case["inputs"]["text"] for case in cases] == ["true", "12345"]


def test_media_urls_inside_arrays_and_nested_records_are_detected() -> None:
    class Attachment(BaseModel):
        image: Image

    class MediaInput(BaseModel):
        photos: list[Image]
        attachments: list[Attachment]

    media_fields, nullable_fields, text_fields, known_fields = dataset_csv.input_field_hints(TypeAdapter(MediaInput))
    stream = StringIO()
    writer = csv.DictWriter(stream, fieldnames=["name", "photos", "attachments"])
    writer.writeheader()
    writer.writerow(
        {
            "name": "multi",
            "photos": '["https://assets.example.com/one.png","https://assets.example.com/two.png"]',
            "attachments": '[{"image":"https://assets.example.com/nested.png"}]',
        }
    )
    draft = dataset_csv.parse_csv(stream.getvalue().encode(), media_fields, nullable_fields, text_fields, known_fields)

    assert {item.field for item in draft.media} == {
        "inputs.photos[0]",
        "inputs.photos[1]",
        "inputs.attachments[0].image",
    }


def test_media_arrays_are_imported_as_blob_descriptors(
    csv_project: Path,
    server_options: ServerOptions,
    server_engine: FakeEngine,
    server_settings: MemorySettings,
) -> None:
    flow_path = csv_project / "flows/intake/flow.yaml"
    flow_path.write_text(flow_path.read_text().replace('input: "Note"', 'input: "MediaInput"'))
    types_root = csv_project / "types/records"
    (types_root / "attachment.yaml").write_text(
        'apiVersion: "aqven/v1"\nkind: "Type"\ntype: "record"\ndescription: "Media attachment"\n'
        'fields:\n- name: "image"\n  type: "Image"\n  description: "Attachment image"\n'
    )
    (types_root / "media_input.yaml").write_text(
        'apiVersion: "aqven/v1"\nkind: "Type"\ntype: "record"\ndescription: "Media input"\n'
        'fields:\n- name: "text"\n  type: "Text"\n  description: "Message"\n'
        '- name: "photos"\n  type: "Image[]"\n  description: "Photos"\n'
        '- name: "attachments"\n  type: "Attachment[]"\n  description: "Attachments"\n'
    )
    types_path = csv_project / "types.py"
    types_path.write_text(
        types_path.read_text()
        + "\nfrom aqven.spec import Image\n\n"
        + "class Attachment(BaseModel):\n    model_config = GENERATED_CONFIG\n    image: Image\n\n"
        + "class MediaInput(BaseModel):\n    model_config = GENERATED_CONFIG\n"
        + "    text: str\n    photos: list[Image]\n    attachments: list[Attachment]\n"
    )
    blob_store = DirectoryBlobStore(server_options.blob_directory or csv_project / ".aqven/blobs")
    images = [asyncio.run(blob_store.put(bytes([index]), "image/png", f"{index}.png")) for index in (1, 2, 3)]
    urls = [f"http://localhost:5200/api/blobs/{item.blob_id}" for item in images]
    stream = StringIO()
    writer = csv.DictWriter(stream, fieldnames=["name", "text", "photos", "attachments"])
    writer.writeheader()
    writer.writerow(
        {
            "name": "array_case",
            "text": "See photos",
            "photos": json.dumps(urls[:2]),
            "attachments": json.dumps([{"image": urls[2]}]),
        }
    )
    app = create_app(
        csv_project,
        server_engine,
        server_settings,
        options=replace(server_options, compiler=ReportCompiler()),
    )
    with TestClient(app, base_url=SERVER_BASE, headers=AUTH) as client:
        data = {"dataset_id": "arrays", "flow_id": "intake"}
        files = {"file": ("arrays.csv", stream.getvalue().encode(), "text/csv")}
        preview = client.post("/api/datasets/import-csv/preview", data=data, files=files)
        imported = client.post("/api/datasets/import-csv", data=data, files=files)
        case = client.get("/api/datasets/arrays/cases/array_case").json()

    assert preview.status_code == 200, preview.text
    assert preview.json()["ready"] is True, preview.text
    assert preview.json()["media_count"] == 3
    assert imported.status_code == 201, imported.text
    assert [photo["blob_id"] for photo in case["inputs"]["photos"]] == [item.blob_id for item in images[:2]]
    assert case["inputs"]["attachments"][0]["image"]["blob_id"] == images[2].blob_id


def test_csv_preview_reports_missing_required_input_and_import_rejects_it(csv_client: TestClient) -> None:
    content = "name,metadata.split\nfirst,test\n"
    preview = upload(csv_client, "/api/datasets/import-csv/preview", content)
    imported = upload(csv_client, "/api/datasets/import-csv", content)

    assert preview.status_code == 200
    assert preview.json()["ready"] is False
    assert preview.json()["rows"][0]["ready"] is False
    assert any("text" in problem for problem in preview.json()["rows"][0]["problems"])
    assert imported.status_code == 422
    assert imported.json()["code"] == "INPUT_INVALID"


def test_csv_preview_rejects_duplicate_case_names_and_conflicting_columns(csv_client: TestClient) -> None:
    names = upload(csv_client, "/api/datasets/import-csv/preview", "name,text\nfirst,one\nfirst,two\n")
    columns = upload(csv_client, "/api/datasets/import-csv/preview", "name,text,inputs.text\nfirst,one,two\n")

    assert names.status_code == 200
    assert names.json()["ready"] is False
    assert any("duplicate" in problem for problem in names.json()["rows"][1]["problems"])
    assert columns.status_code == 200
    assert columns.json()["ready"] is False
    assert any("same target" in problem for problem in columns.json()["problems"])


def test_unknown_input_column_is_reported_before_import(csv_client: TestClient) -> None:
    preview = upload(csv_client, "/api/datasets/import-csv/preview", "name,text,inputs.unknown\nfirst,hello,extra\n")

    assert preview.status_code == 200
    assert preview.json()["ready"] is False
    assert any("inputs.unknown" in problem for problem in preview.json()["problems"])
    assert preview.json()["columns"][2] == {"source": "inputs.unknown", "target": "", "kind": "unmatched"}


def test_root_expected_output_json_column_is_imported(csv_client: TestClient) -> None:
    response = upload(
        csv_client,
        "/api/datasets/import-csv",
        'name,text,expected_output\nfirst,hello,"{""text"":""expected""}"\n',
    )

    assert response.status_code == 201, response.text
    case = csv_client.get("/api/datasets/imported/cases/first").json()
    assert case["expected_output"] == {"text": "expected"}


def test_invalid_header_does_not_shift_later_column_values(csv_client: TestClient) -> None:
    content = "name,bad header,text\nfirst,ignored,actual input\n"
    preview = upload(csv_client, "/api/datasets/import-csv/preview", content)
    draft = dataset_csv.parse_csv(
        content.encode(), frozenset(), frozenset(), frozenset(), frozenset({"inputs.text"})
    )

    assert preview.status_code == 200
    assert preview.json()["ready"] is False
    assert any("bad header" in problem for problem in preview.json()["problems"])
    assert preview.json()["columns"][1] == {"source": "bad header", "target": "", "kind": "unmatched"}
    assert preview.json()["rows"][0]["problems"] == []
    assert draft.rows[0].inputs["text"] == "actual input"


def lumen_csv(media: dict[str, str], *, email: str = "null", blank_optional: bool = False) -> str:
    empty = "" if blank_optional else "null"
    row = {
        "name": "csv_media_case",
        "customer.customer_id": "cus_7k2m9p4q1x8z",
        "customer.display_name": "Анна Смирнова",
        "customer.email": email,
        "customer.tier": "plus",
        "customer.locale": "ru-RU",
        "origin.kind": "marketplace",
        "origin.marketplace": "amazon",
        "origin.order_ref": "113-4829175-6630201",
        "message": "The light strip flickers",
        "order_id": empty,
        "product": empty,
        "tags": '["flicker"]',
        "urgent": "true",
        "photo": empty,
        "voice_note": empty,
        "video": empty,
        "invoice": empty,
        "context.date": "2026-09-18",
        "context.tenant_id": "lumen",
        **media,
    }
    stream = StringIO()
    writer = csv.DictWriter(stream, fieldnames=list(row))
    writer.writeheader()
    writer.writerow(row)
    return stream.getvalue()


def lumen_client(
    tmp_path: Path, server_options: ServerOptions, server_engine: FakeEngine, server_settings: MemorySettings
) -> TestClient:
    project = tmp_path / "lumen"
    shutil.copytree(LUMEN_SOURCE, project, ignore=shutil.ignore_patterns(".aqven"))
    shutil.copytree(LUMEN_SOURCE / ".aqven/blobs", project / ".aqven/blobs")
    options = replace(server_options, blob_directory=project / ".aqven/blobs", compiler=ReportCompiler())
    app = create_app(project, server_engine, server_settings, options=options)
    return TestClient(app, base_url=SERVER_BASE, headers=AUTH)


def test_local_blob_urls_preview_and_import_all_media_without_network(
    tmp_path: Path,
    server_options: ServerOptions,
    server_engine: FakeEngine,
    server_settings: MemorySettings,
) -> None:
    blob_ids = {
        "photo": "sha256-0606035923b6e819a36fc2581f0d9bdb78ccfabe8bb6f44a98ac3b2cbd65e3b6",
        "voice_note": "sha256-627b3f43f925ca8305175adcbfdaef581de4e48f876356f52b744102fbd27675",
        "video": "sha256-56e4ab6809017822c002e780d3ad85a74e58457ba23c3a25696f4fa545401c5a",
        "invoice": "sha256-73c299df4819d9854d92954932dc86a16fe13c603013316637ad0385d308e712",
    }
    content = lumen_csv(
        {field: f"http://127.0.0.1:5200/api/blobs/{blob_id}" for field, blob_id in blob_ids.items()},
        email="anna.smirnova@example.com",
    )
    with lumen_client(tmp_path, server_options, server_engine, server_settings) as client:
        preview = client.post(
            "/api/datasets/import-csv/preview",
            data={"dataset_id": "csv_media", "flow_id": "support_case"},
            files={"file": ("cases.csv", content.encode(), "text/csv")},
        )
        imported = client.post(
            "/api/datasets/import-csv",
            data={"dataset_id": "csv_media", "flow_id": "support_case"},
            files={"file": ("cases.csv", content.encode(), "text/csv")},
        )
        case = client.get("/api/datasets/csv_media/cases/csv_media_case")

    assert preview.status_code == 200, preview.text
    assert preview.json()["ready"] is True, preview.text
    assert preview.json()["media_count"] == 4
    assert all(item["ready"] for item in preview.json()["media"])
    assert imported.status_code == 201, imported.text
    assert case.status_code == 200
    assert {field: case.json()["inputs"][field]["blob_id"] for field in blob_ids} == blob_ids


def test_blank_nullable_input_cells_become_null(
    tmp_path: Path,
    server_options: ServerOptions,
    server_engine: FakeEngine,
    server_settings: MemorySettings,
) -> None:
    content = lumen_csv({}, email="", blank_optional=True)
    with lumen_client(tmp_path, server_options, server_engine, server_settings) as client:
        data = {"dataset_id": "csv_blank_nullable", "flow_id": "support_case"}
        files = {"file": ("cases.csv", content.encode(), "text/csv")}
        preview = client.post("/api/datasets/import-csv/preview", data=data, files=files)
        imported = client.post("/api/datasets/import-csv", data=data, files=files)
        case = client.get("/api/datasets/csv_blank_nullable/cases/csv_media_case").json()

    assert preview.status_code == 200, preview.text
    assert preview.json()["ready"] is True
    assert imported.status_code == 201, imported.text
    assert case["inputs"]["customer"]["email"] is None
    assert case["inputs"]["order_id"] is None
    assert case["inputs"]["photo"] is None


@pytest.mark.asyncio
async def test_private_media_url_is_blocked_before_fetch() -> None:
    with pytest.raises(ValueError, match="public addresses"):
        await dataset_csv.remote_media("http://127.0.0.1:9999/private.png", download=False)


def test_public_media_url_is_checked_before_preview_and_saved_on_import(
    tmp_path: Path,
    server_options: ServerOptions,
    server_engine: FakeEngine,
    server_settings: MemorySettings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def public_addresses(hostname: str, port: int) -> tuple[str, ...]:
        assert (hostname, port) == ("assets.example.com", 443)
        return ("93.184.216.34",)

    seen: list[httpx2.Request] = []

    def respond(request: httpx2.Request) -> httpx2.Response:
        seen.append(request)
        return httpx2.Response(200, headers={"content-type": "image/png", "content-length": "4"}, content=b"png!")

    original_client = httpx2.AsyncClient

    def mock_client(*, timeout: float, follow_redirects: bool, trust_env: bool) -> httpx2.AsyncClient:
        return original_client(
            timeout=timeout,
            follow_redirects=follow_redirects,
            trust_env=trust_env,
            transport=httpx2.MockTransport(respond),
        )

    monkeypatch.setattr(dataset_csv, "_public_addresses", public_addresses)
    monkeypatch.setattr(dataset_csv.httpx2, "AsyncClient", mock_client)
    content = lumen_csv({"photo": "https://assets.example.com/photo.png"})
    with lumen_client(tmp_path, server_options, server_engine, server_settings) as client:
        data = {"dataset_id": "csv_remote_media", "flow_id": "support_case"}
        files = {"file": ("cases.csv", content.encode(), "text/csv")}
        preview = client.post("/api/datasets/import-csv/preview", data=data, files=files)
        blob_dir = tmp_path / "lumen/.aqven/blobs"
        before = {path.name for path in blob_dir.iterdir()}
        imported = client.post("/api/datasets/import-csv", data=data, files=files)
        case = client.get("/api/datasets/csv_remote_media/cases/csv_media_case").json()

    assert preview.status_code == 200, preview.text
    assert preview.json()["ready"] is True
    assert preview.json()["media"][0]["media_type"] == "image/png"
    assert imported.status_code == 201, imported.text
    assert case["inputs"]["photo"]["$media"] == "image/png"
    assert case["inputs"]["photo"]["size_bytes"] == 4
    assert f"{case['inputs']['photo']['blob_id']}.bin" not in before
    assert seen and all(request.url.host == "93.184.216.34" for request in seen)
    assert all(request.headers["host"] == "assets.example.com" for request in seen)
    assert len(seen) == 2  # One preview GET, one import GET.


def test_preview_checks_distinct_media_urls_concurrently(
    tmp_path: Path,
    server_options: ServerOptions,
    server_engine: FakeEngine,
    server_settings: MemorySettings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def public_addresses(hostname: str, port: int) -> tuple[str, ...]:
        return ("93.184.216.34",)

    active = 0
    peak = 0
    types = {
        "photo.jpg": "image/jpeg",
        "voice.wav": "audio/wav",
        "clip.mp4": "video/mp4",
        "invoice.pdf": "application/pdf",
    }

    async def respond(request: httpx2.Request) -> httpx2.Response:
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0.02)
        active -= 1
        name = request.url.path.rsplit("/", 1)[-1]
        return httpx2.Response(200, headers={"content-type": types[name], "content-length": "4"}, content=b"data")

    original_client = httpx2.AsyncClient

    def mock_client(*, timeout: float, follow_redirects: bool, trust_env: bool) -> httpx2.AsyncClient:
        return original_client(
            timeout=timeout,
            follow_redirects=follow_redirects,
            trust_env=trust_env,
            transport=httpx2.MockTransport(respond),
        )

    monkeypatch.setattr(dataset_csv, "_public_addresses", public_addresses)
    monkeypatch.setattr(dataset_csv.httpx2, "AsyncClient", mock_client)
    content = lumen_csv(
        {
            "photo": "https://assets.example.com/photo.jpg",
            "voice_note": "https://assets.example.com/voice.wav",
            "video": "https://assets.example.com/clip.mp4",
            "invoice": "https://assets.example.com/invoice.pdf",
        }
    )
    with lumen_client(tmp_path, server_options, server_engine, server_settings) as client:
        preview = client.post(
            "/api/datasets/import-csv/preview",
            data={"dataset_id": "csv_parallel", "flow_id": "support_case"},
            files={"file": ("cases.csv", content.encode(), "text/csv")},
        )

    assert preview.status_code == 200, preview.text
    assert preview.json()["ready"] is True, preview.text
    assert peak >= 2


@pytest.mark.asyncio
async def test_public_redirect_is_followed_with_fresh_destination_validation(monkeypatch: pytest.MonkeyPatch) -> None:
    checked: list[str] = []

    async def public_addresses(hostname: str, port: int) -> tuple[str, ...]:
        checked.append(hostname)
        return ("93.184.216.34" if hostname == "assets.example.com" else "1.1.1.1",)

    seen: list[str] = []

    def respond(request: httpx2.Request) -> httpx2.Response:
        seen.append(request.headers["host"])
        if request.headers["host"] == "assets.example.com":
            return httpx2.Response(302, headers={"location": "https://cdn.example.net/photo.png"})
        return httpx2.Response(200, headers={"content-type": "image/png", "content-length": "4"}, content=b"png!")

    original_client = httpx2.AsyncClient

    def mock_client(*, timeout: float, follow_redirects: bool, trust_env: bool) -> httpx2.AsyncClient:
        return original_client(
            timeout=timeout,
            follow_redirects=follow_redirects,
            trust_env=trust_env,
            transport=httpx2.MockTransport(respond),
        )

    monkeypatch.setattr(dataset_csv, "_public_addresses", public_addresses)
    monkeypatch.setattr(dataset_csv.httpx2, "AsyncClient", mock_client)
    media_type, size, _ = await dataset_csv.remote_media("https://assets.example.com/photo", download=False)

    assert (media_type, size) == ("image/png", 4)
    assert checked == ["assets.example.com", "cdn.example.net"]
    assert seen == checked


@pytest.mark.asyncio
async def test_redirect_to_private_host_is_blocked(monkeypatch: pytest.MonkeyPatch) -> None:
    async def public_addresses(hostname: str, port: int) -> tuple[str, ...]:
        if hostname == "127.0.0.1":
            raise ValueError("media URL must resolve only to public addresses")
        return ("93.184.216.34",)

    original_client = httpx2.AsyncClient

    def respond(request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(302, headers={"location": "http://127.0.0.1:8000/private.png"})

    def mock_client(*, timeout: float, follow_redirects: bool, trust_env: bool) -> httpx2.AsyncClient:
        return original_client(
            timeout=timeout,
            follow_redirects=follow_redirects,
            trust_env=trust_env,
            transport=httpx2.MockTransport(respond),
        )

    monkeypatch.setattr(dataset_csv, "_public_addresses", public_addresses)
    monkeypatch.setattr(dataset_csv.httpx2, "AsyncClient", mock_client)

    with pytest.raises(ValueError, match="public addresses"):
        await dataset_csv.remote_media("https://assets.example.com/photo", download=False)


@pytest.mark.parametrize("media_type", ["image/svg+xml", "application/xhtml+xml", "text/html"])
def test_active_document_content_types_are_rejected(media_type: str) -> None:
    response = httpx2.Response(200, headers={"content-type": media_type})

    with pytest.raises(ValueError, match="unsupported content type"):
        dataset_csv.safe_media_type(response, "https://assets.example.com/asset")
