import asyncio
import hashlib
from pathlib import Path

from fastapi.testclient import TestClient

from aqven.engine.blobs import FileBlobStore
from aqven.server import ServerOptions
from aqven.server.blobs import DirectoryBlobStore

DATA = bytes(range(256)) * 4


def upload(client: TestClient) -> str:
    response = client.post("/api/blobs", files={"file": ("pixel.png", DATA, "image/png")})
    assert response.status_code == 201
    body = response.json()
    assert body["blob_id"] == f"sha256-{hashlib.sha256(DATA).hexdigest()}"
    assert body["size_bytes"] == len(DATA)
    assert body["media_type"] == "image/png"
    return body["blob_id"]


def test_upload_is_content_addressed(server_client: TestClient) -> None:
    assert upload(server_client) == upload(server_client)


def test_download_full_and_meta(server_client: TestClient) -> None:
    blob_id = upload(server_client)
    response = server_client.get(f"/api/blobs/{blob_id}")
    assert response.status_code == 200
    assert response.content == DATA
    assert response.headers["content-type"] == "image/png"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["etag"] == f'"{blob_id}"'
    assert response.headers["accept-ranges"] == "bytes"
    assert "immutable" in response.headers["cache-control"]
    meta = server_client.get(f"/api/blobs/{blob_id}/meta").json()
    assert meta["name"] == "pixel.png"


def test_range_request(server_client: TestClient) -> None:
    blob_id = upload(server_client)
    partial = server_client.get(f"/api/blobs/{blob_id}", headers={"Range": "bytes=0-9"})
    assert partial.status_code == 206
    assert partial.headers["content-range"] == f"bytes 0-9/{len(DATA)}"
    assert partial.content == DATA[:10]
    outside = server_client.get(f"/api/blobs/{blob_id}", headers={"Range": f"bytes={len(DATA) + 10}-{len(DATA) + 20}"})
    assert outside.status_code == 416
    assert outside.headers["content-range"] == f"bytes */{len(DATA)}"


def test_head_request(server_client: TestClient) -> None:
    blob_id = upload(server_client)
    response = server_client.head(f"/api/blobs/{blob_id}")
    assert response.status_code == 200
    assert response.content == b""
    assert response.headers["content-length"] == str(len(DATA))


def test_unknown_and_malformed_blob(server_client: TestClient) -> None:
    unknown = server_client.get("/api/blobs/sha256-" + "a" * 64)
    malformed = server_client.get("/api/blobs/..%2F..%2Fsecret")
    assert unknown.status_code == 404
    assert unknown.json()["code"] == "NOT_FOUND"
    assert malformed.status_code == 404


def test_engine_generated_media_is_available_to_studio(tmp_path: Path) -> None:
    directory = tmp_path / "blobs"
    engine = FileBlobStore(directory)
    studio = DirectoryBlobStore(directory)

    media = asyncio.run(engine.put(DATA, "image/png", "pixel.png"))
    found = asyncio.run(studio.locate(media.blob_id))

    assert found is not None
    assert found.path.read_bytes() == DATA
    assert found.meta.media_type == "image/png"
    assert found.meta.name == "pixel.png"


def test_engine_generated_media_downloads_over_api(server_client: TestClient, server_options: ServerOptions) -> None:
    directory = server_options.blob_directory
    assert directory is not None
    media = asyncio.run(FileBlobStore(directory).put(DATA, "image/png", "pixel.png"))

    response = server_client.get(f"/api/blobs/{media.blob_id}")

    assert response.status_code == 200
    assert response.content == DATA
    assert response.headers["content-type"] == "image/png"


def test_studio_upload_is_available_to_engine(tmp_path: Path) -> None:
    directory = tmp_path / "blobs"
    studio = DirectoryBlobStore(directory)
    engine = FileBlobStore(directory)

    media = asyncio.run(studio.put(DATA, "image/png", "pixel.png"))

    assert engine.read(media.blob_id) == DATA


def test_studio_can_read_engine_legacy_blob(tmp_path: Path) -> None:
    directory = tmp_path / "blobs"
    directory.mkdir()
    blob_id = f"sha256-{hashlib.sha256(DATA).hexdigest()}"
    (directory / blob_id.removeprefix("sha256-")).write_bytes(DATA)

    found = asyncio.run(DirectoryBlobStore(directory).locate(blob_id))

    assert found is not None
    assert found.path.read_bytes() == DATA
    assert found.meta.size_bytes == len(DATA)


def test_legacy_engine_blob_downloads_over_api(server_client: TestClient, server_options: ServerOptions) -> None:
    directory = server_options.blob_directory
    assert directory is not None
    directory.mkdir(parents=True, exist_ok=True)
    blob_id = f"sha256-{hashlib.sha256(DATA).hexdigest()}"
    (directory / blob_id.removeprefix("sha256-")).write_bytes(DATA)

    response = server_client.get(f"/api/blobs/{blob_id}")

    assert response.status_code == 200
    assert response.content == DATA
