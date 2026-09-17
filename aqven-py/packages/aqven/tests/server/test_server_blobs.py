import hashlib

from fastapi.testclient import TestClient

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
