from pathlib import Path

from conftest import AUTH, SERVER_BASE, SERVER_TOKEN
from fastapi.testclient import TestClient
from server_fakes import FakeEngine, MemorySettings

from aqven.server import ServerOptions, create_app


def studio_client(project: Path, dist: Path | None) -> TestClient:
    options = ServerOptions(
        access_token=SERVER_TOKEN, watch=False, studio_dist=dist, blob_directory=project.parent / "blobs"
    )
    app = create_app(project, FakeEngine(), MemorySettings(), options=options)
    return TestClient(app, base_url=SERVER_BASE, headers=AUTH)


def studio_dist(tmp_path: Path) -> Path:
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><title>studio</title>", encoding="utf-8")
    (dist / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
    (tmp_path / "outside.txt").write_text("outside", encoding="utf-8")
    return dist


def test_spa_fallback_and_assets(tmp_path: Path, server_project: Path) -> None:
    with studio_client(server_project, studio_dist(tmp_path)) as client:
        page = client.get("/flows/intake/nodes/reply")
        asset = client.get("/assets/app.js")
        escape = client.get("/../outside.txt")
        api = client.get("/api/unknown")
        mcp = client.get("/mcp")
    assert page.status_code == 200
    assert "studio" in page.text
    assert page.headers["cache-control"] == "no-cache"
    assert asset.text == "console.log(1)"
    assert "outside" not in escape.text
    assert api.status_code == 404
    assert api.json()["code"] == "NOT_FOUND"
    assert mcp.status_code == 404


def test_missing_bundle(tmp_path: Path, server_project: Path) -> None:
    with studio_client(server_project, tmp_path / "absent") as client:
        response = client.get("/")
    assert response.status_code == 404
    assert "bundle" in response.text
