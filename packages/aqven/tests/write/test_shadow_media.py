from pathlib import Path
from typing import Final

import pytest

from aqven.diagnostics import DiagnosticCode
from aqven.testing import copy_project
from aqven.write.validation import ShadowCheckValidator

FIXTURE: Final = Path(__file__).parents[1] / "fixtures" / "fixture_shop"
DATASET_FILE: Final = "datasets/photos.yaml"
PHOTO_FILE: Final = "datasets/photos/parcel.jpg"
CLIP_FILE: Final = "samples/raw/clip.mp4"
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
    photo:
      $media: "image/jpeg"
      file: "parcel.jpg"
  expected_output:
    category: "delivery"
    summary: "The parcel is late"
"""
MEDIA_CODES: Final = frozenset({DiagnosticCode.E_MEDIA_FILE_MISSING, DiagnosticCode.E_MEDIA_PATH_INVALID})


def write_bytes(root: Path, relative: str, data: bytes) -> None:
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)


@pytest.fixture
def shop(tmp_path: Path) -> Path:
    root = copy_project(FIXTURE, tmp_path)
    write_bytes(root, PHOTO_FILE, b"jpeg bytes")
    write_bytes(root, CLIP_FILE, b"original clip")
    return root


def test_a_new_case_that_points_at_an_existing_file_passes_the_write_check(shop: Path) -> None:
    validation = ShadowCheckValidator().validate(shop, {DATASET_FILE: PHOTO_DATASET.encode()})

    assert not {item.code for item in validation.problems} & MEDIA_CODES


def test_a_new_case_that_points_at_a_missing_file_is_reported(shop: Path) -> None:
    (shop / PHOTO_FILE).unlink()

    validation = ShadowCheckValidator().validate(shop, {DATASET_FILE: PHOTO_DATASET.encode()})

    assert DiagnosticCode.E_MEDIA_FILE_MISSING in {item.code for item in validation.problems}


def test_the_write_check_never_writes_through_to_a_project_file(shop: Path) -> None:
    ShadowCheckValidator().validate(shop, {CLIP_FILE: b"replaced in the shadow only", PHOTO_FILE: None})

    assert (shop / CLIP_FILE).read_bytes() == b"original clip"
    assert (shop / PHOTO_FILE).read_bytes() == b"jpeg bytes"
