from collections.abc import Iterator
from pathlib import Path
from typing import Final

import httpx2
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from server_fakes import AUTH, SERVER_BASE, FakeEngine, MemorySettings, copy_fixture

from aqven.check import check_project
from aqven.diagnostics import Severity
from aqven.loader import file_hash
from aqven.server import ServerOptions, create_app

DATASET: Final = "datasets/photos.yaml"
MEDIA_FOLDER: Final = "datasets/photos"
ATTACH: Final = "/api/datasets/photos/cases/late_parcel/media"
JPEG: Final = b"\xff\xd8\xff\xe0\x00jpeg bytes"
PNG: Final = b"\x89PNG\r\n\x1a\nbytes"
STALE_HASH: Final = f"sha256-{'0' * 64}"
PHOTO_DATASET: Final = """apiVersion: "aqven/v1"
kind: "Dataset"
flow: "triage"
cases:
- name: "late_parcel"
  inputs:
    subject: "Where is my parcel"
    body: "The order did not arrive in time"
    customer:
      name: "Anna"
      email: null
    photo: null
"""


@pytest.fixture
def photo_project(tmp_path: Path) -> Path:
    root = copy_fixture("fixture_shop", tmp_path)
    target = root / DATASET
    target.parent.mkdir(parents=True)
    target.write_text(PHOTO_DATASET, encoding="utf-8")
    return root


@pytest.fixture
def photo_client(
    photo_project: Path,
    server_engine: FakeEngine,
    server_settings: MemorySettings,
    server_options: ServerOptions,
) -> Iterator[TestClient]:
    app: FastAPI = create_app(photo_project, server_engine, server_settings, options=server_options)
    with TestClient(app, base_url=SERVER_BASE, headers=AUTH) as client:
        yield client


def dataset_hash(root: Path) -> str:
    return file_hash((root / DATASET).read_bytes())


def attach(
    client: TestClient,
    digest: str,
    name: str = "parcel.jpg",
    data: bytes = JPEG,
    media_type: str = "image/jpeg",
    location: str = "inputs.photo",
) -> httpx2.Response:
    return client.post(
        ATTACH, data={"location": location, "file_hash": digest}, files={"file": (name, data, media_type)}
    )


def photo_of(client: TestClient) -> object:
    return client.get("/api/datasets/photos/cases/late_parcel").json()["inputs"]["photo"]


def test_attach_writes_the_file_next_to_the_dataset_and_a_file_reference_in_the_case(
    photo_client: TestClient, photo_project: Path
) -> None:
    response = attach(photo_client, dataset_hash(photo_project))

    assert response.status_code == 201
    body = response.json()
    assert (body["file"], body["path"], body["media_type"]) == (
        "parcel.jpg",
        f"{MEDIA_FOLDER}/parcel.jpg",
        "image/jpeg",
    )
    assert (body["case_name"], body["location"]) == ("late_parcel", "inputs.photo")
    assert body["dataset"]["media_folder"] == MEDIA_FOLDER
    assert body["dataset"]["file_hash"] == dataset_hash(photo_project)
    assert (photo_project / MEDIA_FOLDER / "parcel.jpg").read_bytes() == JPEG
    assert photo_of(photo_client) == {"$media": "image/jpeg", "file": "parcel.jpg"}
    assert '    photo:\n      $media: "image/jpeg"\n      file: "parcel.jpg"\n' in (photo_project / DATASET).read_text()
    raw = photo_client.get(f"/api/raw/{MEDIA_FOLDER}/parcel.jpg")
    assert (raw.status_code, raw.content, raw.headers["content-type"]) == (200, JPEG, "image/jpeg")
    errors = [item for item in check_project(photo_project).diagnostics if item.severity is Severity.ERROR]
    assert errors == []


def test_a_second_file_with_the_same_name_gets_a_free_name_and_keeps_the_uploaded_one_as_its_name(
    photo_client: TestClient, photo_project: Path
) -> None:
    attach(photo_client, dataset_hash(photo_project))

    response = attach(photo_client, dataset_hash(photo_project), data=b"\xff\xd8\xff\xe0\x00another")

    assert response.json()["file"] == "parcel_2.jpg"
    assert photo_of(photo_client) == {"$media": "image/jpeg", "file": "parcel_2.jpg", "name": "parcel.jpg"}
    assert (photo_project / MEDIA_FOLDER / "parcel.jpg").read_bytes() == JPEG


def test_the_media_type_falls_back_to_the_file_extension(photo_client: TestClient, photo_project: Path) -> None:
    response = attach(photo_client, dataset_hash(photo_project), "scan.png", PNG, "application/octet-stream")

    assert response.json()["media_type"] == "image/png"
    assert photo_of(photo_client) == {"$media": "image/png", "file": "scan.png"}


def test_a_stale_dataset_hash_writes_nothing(photo_client: TestClient, photo_project: Path) -> None:
    before = (photo_project / DATASET).read_bytes()

    response = attach(photo_client, STALE_HASH)

    assert response.status_code == 412
    assert response.json()["code"] == "STALE_FILE"
    assert response.json()["conflict"]["current_hash"] == dataset_hash(photo_project)
    assert (photo_project / DATASET).read_bytes() == before
    assert not (photo_project / MEDIA_FOLDER).exists()


def test_a_file_the_flow_input_cannot_take_is_refused_by_the_check(
    photo_client: TestClient, photo_project: Path
) -> None:
    response = attach(photo_client, dataset_hash(photo_project), "invoice.pdf", b"%PDF-1.7", "application/pdf")

    assert response.status_code == 422
    assert response.json()["code"] == "BLOCKING_PROBLEMS"
    assert not (photo_project / MEDIA_FOLDER).exists()


@pytest.mark.parametrize("location", ["inputs", "context.photo", "inputs.customer.avatar.photo", "inputs[0]"])
def test_a_location_the_case_has_no_place_for_is_refused(
    photo_client: TestClient, photo_project: Path, location: str
) -> None:
    response = attach(photo_client, dataset_hash(photo_project), location=location)

    assert response.status_code == 422
    assert response.json()["code"] == "REQUEST_INVALID"
    assert not (photo_project / MEDIA_FOLDER).exists()


def test_an_empty_file_is_refused(photo_client: TestClient, photo_project: Path) -> None:
    response = attach(photo_client, dataset_hash(photo_project), data=b"")

    assert response.status_code == 422
    assert response.json()["message"] == "media file is empty"


def test_an_unknown_case_or_dataset_is_not_found(photo_client: TestClient, photo_project: Path) -> None:
    form = {"location": "inputs.photo", "file_hash": dataset_hash(photo_project)}
    upload = {"file": ("parcel.jpg", JPEG, "image/jpeg")}

    missing_case = photo_client.post("/api/datasets/photos/cases/nothing/media", data=form, files=upload)
    missing_dataset = photo_client.post("/api/datasets/nothing/cases/late_parcel/media", data=form, files=upload)

    assert (missing_case.status_code, missing_dataset.status_code) == (404, 404)
    assert not (photo_project / MEDIA_FOLDER).exists()
