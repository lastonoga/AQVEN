from pathlib import Path
from typing import Final

import pytest

from aqven.check import CheckReport, check_project
from aqven.diagnostics import DiagnosticCode, Severity
from aqven.loader import dataset_media_folders, load_project, project_files, spec_files
from aqven.testing import copy_project

FIXTURE: Final = Path(__file__).parents[1] / "fixtures" / "fixture_shop"
DATASET_FILE: Final = "datasets/photos.yaml"
MEDIA_FOLDER: Final = "datasets/photos"
PHOTO_FILE: Final = "datasets/photos/parcel.jpg"
PHOTO_PATH: Final = ("cases", 0, "inputs", "photo")

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

STRAY_SPEC: Final = """apiVersion: "aqven/v1"
kind: "Flow"
description: "A sample file that looks like a spec"
"""

STRAY_CODE: Final = '''def sample() -> None:
    """A sample under review, not project code."""
'''


def write(root: Path, relative: str, text: str) -> None:
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def write_bytes(root: Path, relative: str, data: bytes) -> None:
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)


def with_photo(root: Path, photo: str = 'file: "parcel.jpg"', media_type: str = "image/jpeg") -> None:
    text = PHOTO_DATASET.replace('file: "parcel.jpg"', photo).replace('$media: "image/jpeg"', f'$media: "{media_type}"')
    write(root, DATASET_FILE, text)


def found(report: CheckReport, code: DiagnosticCode) -> list[tuple[str, tuple[str | int, ...]]]:
    return [(item.file, item.path) for item in report.diagnostics if item.code is code]


@pytest.fixture
def shop(tmp_path: Path) -> Path:
    root = copy_project(FIXTURE, tmp_path)
    write_bytes(root, PHOTO_FILE, b"jpeg bytes")
    return root


def test_file_ref_next_to_the_dataset_is_clean(shop: Path) -> None:
    with_photo(shop)

    report = check_project(shop)

    assert report.diagnostics == ()


def test_file_ref_from_the_project_root_is_clean(shop: Path) -> None:
    write_bytes(shop, "samples/parcel.jpg", b"jpeg bytes")
    with_photo(shop, 'file: "@root/samples/parcel.jpg"')

    assert check_project(shop).diagnostics == ()


def test_files_in_the_dataset_folder_are_not_specs(shop: Path) -> None:
    with_photo(shop)
    write(shop, f"{MEDIA_FOLDER}/looks_like.yaml", STRAY_SPEC)
    write(shop, f"{MEDIA_FOLDER}/notes/readme.md", "# notes\n")
    write(shop, f"{MEDIA_FOLDER}/reviewed.py", STRAY_CODE)

    report = check_project(shop)
    loaded = load_project(shop).project

    assert report.diagnostics == ()
    assert loaded is not None
    assert set(loaded.datasets) == {"photos"}
    assert not any(path.startswith(f"{MEDIA_FOLDER}/") for path in loaded.texts)
    assert dataset_media_folders(shop, project_files(shop)) == frozenset({MEDIA_FOLDER})
    assert not any(path.startswith(f"{MEDIA_FOLDER}/") for path in spec_files(shop))


def test_folder_named_like_a_non_dataset_file_is_still_read(shop: Path) -> None:
    write(shop, "shared/writer/stray.yaml", STRAY_SPEC)

    report = check_project(shop)

    assert any(item.file == "shared/writer/stray.yaml" for item in report.diagnostics)


def test_missing_media_file_is_an_error(shop: Path) -> None:
    with_photo(shop, 'file: "lost.jpg"')

    report = check_project(shop)

    assert found(report, DiagnosticCode.E_MEDIA_FILE_MISSING) == [(DATASET_FILE, (*PHOTO_PATH, "file"))]
    item = next(item for item in report.diagnostics if item.code is DiagnosticCode.E_MEDIA_FILE_MISSING)
    assert item.severity is Severity.ERROR
    assert "datasets/photos/lost.jpg" in item.message
    assert item.hint is not None and "datasets/photos/" in item.hint
    assert not report.ok


@pytest.mark.parametrize(
    ("photo", "phrase"),
    [
        ('file: "/etc/parcel.jpg"', "is absolute"),
        ('file: "../parcel.jpg"', "leaves the dataset folder datasets/photos/"),
        ('file: "@root/../parcel.jpg"', "leaves the project root"),
        ('file: "@root/.aqven/blobs/parcel.bin"', "points into .aqven/"),
    ],
)
def test_path_out_of_the_project_is_an_error(shop: Path, photo: str, phrase: str) -> None:
    with_photo(shop, photo)

    report = check_project(shop)

    assert found(report, DiagnosticCode.E_MEDIA_PATH_INVALID) == [(DATASET_FILE, (*PHOTO_PATH, "file"))]
    assert found(report, DiagnosticCode.E_MEDIA_FILE_MISSING) == []
    item = next(item for item in report.diagnostics if item.code is DiagnosticCode.E_MEDIA_PATH_INVALID)
    assert phrase in item.message


def test_extension_that_does_not_fit_media_type_is_a_warning(shop: Path) -> None:
    with_photo(shop, media_type="image/png")

    report = check_project(shop)

    assert found(report, DiagnosticCode.W_MEDIA_TYPE_MISMATCH) == [(DATASET_FILE, (*PHOTO_PATH, "$media"))]
    item = next(item for item in report.diagnostics if item.code is DiagnosticCode.W_MEDIA_TYPE_MISMATCH)
    assert item.severity is Severity.WARNING
    assert item.hint is not None and "image/jpeg" in item.hint
    assert report.ok


def test_file_ref_with_blob_fields_is_invalid(shop: Path) -> None:
    with_photo(shop, f'file: "parcel.jpg"\n      blob_id: "sha256-{"a" * 64}"')

    report = check_project(shop)

    assert found(report, DiagnosticCode.E_SPEC_INVALID) == [(DATASET_FILE, PHOTO_PATH)]


def test_file_ref_must_fit_the_media_type_of_the_input(shop: Path) -> None:
    write_bytes(shop, "datasets/photos/call.mp3", b"mp3 bytes")
    with_photo(shop, 'file: "call.mp3"', media_type="audio/mpeg")

    report = check_project(shop)

    problems = [item for item in report.diagnostics if item.code is DiagnosticCode.E_SPEC_INVALID]
    assert [(item.file, item.path) for item in problems] == [(DATASET_FILE, ("cases", 0, "inputs"))]
    assert "photo" in problems[0].message


def test_file_ref_where_text_is_expected_is_rejected(shop: Path) -> None:
    write(
        shop,
        DATASET_FILE,
        PHOTO_DATASET.replace(
            'subject: "Where is my parcel"', 'subject:\n      $media: "image/jpeg"\n      file: "parcel.jpg"'
        ),
    )

    report = check_project(shop)

    problems = [item for item in report.diagnostics if item.code is DiagnosticCode.E_SPEC_INVALID]
    assert len(problems) == 1
    assert "subject" in problems[0].message


def test_file_refs_in_node_outputs_and_expected_output_are_checked(shop: Path) -> None:
    text = PHOTO_DATASET.replace(
        "  expected_output:\n",
        '  node_outputs:\n    classify:\n      evidence:\n        $media: "image/jpeg"\n        file: "gone.jpg"\n'
        '  expected_output:\n    proof:\n      $media: "image/jpeg"\n      file: "@root/missing.jpg"\n',
    )
    write(shop, DATASET_FILE, text)

    report = check_project(shop)

    assert found(report, DiagnosticCode.E_MEDIA_FILE_MISSING) == [
        (DATASET_FILE, ("cases", 0, "node_outputs", "classify", "evidence", "file")),
        (DATASET_FILE, ("cases", 0, "expected_output", "proof", "file")),
    ]


@pytest.mark.parametrize(
    ("photo", "media_type", "code"),
    [
        ('file: "lost.jpg"', "image/jpeg", DiagnosticCode.E_MEDIA_FILE_MISSING),
        ('file: "../parcel.jpg"', "image/jpeg", DiagnosticCode.E_MEDIA_PATH_INVALID),
        ('file: "parcel.jpg"', "image/png", DiagnosticCode.W_MEDIA_TYPE_MISMATCH),
    ],
)
def test_media_diagnostics_fill_their_templates(shop: Path, photo: str, media_type: str, code: DiagnosticCode) -> None:
    with_photo(shop, photo, media_type)

    item = next(item for item in check_project(shop).diagnostics if item.code is code)

    assert "late_parcel" in item.message and "photos" in item.message
    assert "{" not in item.message
    assert item.hint is not None and "{" not in item.hint
