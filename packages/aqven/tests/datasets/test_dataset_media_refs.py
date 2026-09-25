from pathlib import Path
from typing import Final

import pytest
from pydantic import JsonValue

from aqven.datasets import (
    MediaFileMissing,
    MediaFileRefInvalid,
    MediaPathInvalid,
    MediaPathProblem,
    case_media_file_refs,
    has_media_file_refs,
    is_media_file_ref,
    locate_media_file,
    media_file_name,
    media_file_path,
    media_type_fits,
    parse_media_file_ref,
    unused_media_file_name,
    with_media_placeholders,
)
from aqven.spec import DatasetCase, Image, NodeId

DATASET: Final = "datasets/photos.yaml"
NESTED_DATASET: Final = "triage/quality/cases/labels.yaml"
BLOB_ID: Final = f"sha256-{'a' * 64}"
FILE_REF: Final[dict[str, JsonValue]] = {"$media": "image/jpeg", "file": "parcel.jpg"}
BLOB_REF: Final[dict[str, JsonValue]] = {"$media": "image/jpeg", "blob_id": BLOB_ID, "size_bytes": 3, "name": "x.jpg"}


@pytest.mark.parametrize(
    ("reference", "dataset", "expected"),
    [
        ("parcel.jpg", DATASET, "datasets/photos/parcel.jpg"),
        ("./parcel.jpg", DATASET, "datasets/photos/parcel.jpg"),
        ("damaged/box.png", DATASET, "datasets/photos/damaged/box.png"),
        ("damaged/../parcel.jpg", DATASET, "datasets/photos/parcel.jpg"),
        ("damaged\\box.png", DATASET, "datasets/photos/damaged/box.png"),
        ("@root/samples/parcel.jpg", DATASET, "samples/parcel.jpg"),
        ("parcel.jpg", NESTED_DATASET, "triage/quality/cases/labels/parcel.jpg"),
        ("@root/parcel.jpg", NESTED_DATASET, "parcel.jpg"),
    ],
)
def test_media_file_path_resolves_from_the_dataset_folder_or_the_root(
    reference: str, dataset: str, expected: str
) -> None:
    assert media_file_path(reference, dataset) == expected


@pytest.mark.parametrize(
    ("reference", "problem"),
    [
        ("", MediaPathProblem.EMPTY),
        (".", MediaPathProblem.EMPTY),
        ("@root/", MediaPathProblem.EMPTY),
        ("/etc/passwd", MediaPathProblem.ABSOLUTE),
        ("C:\\photos\\parcel.jpg", MediaPathProblem.ABSOLUTE),
        ("@root//etc/passwd", MediaPathProblem.ABSOLUTE),
        ("../other/parcel.jpg", MediaPathProblem.OUTSIDE),
        ("damaged/../../parcel.jpg", MediaPathProblem.OUTSIDE),
        ("..\\parcel.jpg", MediaPathProblem.OUTSIDE),
        ("@root/../parcel.jpg", MediaPathProblem.OUTSIDE),
        ("@root/.aqven/blobs/parcel.bin", MediaPathProblem.ENGINE_STATE),
        ("@root/.AQVEN/blobs/parcel.bin", MediaPathProblem.ENGINE_STATE),
    ],
)
def test_media_file_path_rejects_paths_out_of_the_project(reference: str, problem: MediaPathProblem) -> None:
    with pytest.raises(MediaPathInvalid) as caught:
        media_file_path(reference, DATASET)

    assert caught.value.problem is problem
    assert caught.value.reference == reference


def test_outside_problem_names_the_folder_it_leaves() -> None:
    with pytest.raises(MediaPathInvalid) as relative:
        media_file_path("../parcel.jpg", DATASET)
    with pytest.raises(MediaPathInvalid) as rooted:
        media_file_path("@root/../parcel.jpg", DATASET)

    assert relative.value.phrase == "leaves the dataset folder datasets/photos/"
    assert rooted.value.phrase == "leaves the project root"


def test_locate_media_file_returns_the_real_file(tmp_path: Path) -> None:
    target = tmp_path / "datasets" / "photos" / "parcel.jpg"
    target.parent.mkdir(parents=True)
    target.write_bytes(b"jpeg")

    assert locate_media_file(tmp_path, "parcel.jpg", DATASET) == target.resolve()


def test_locate_media_file_reports_a_missing_file(tmp_path: Path) -> None:
    with pytest.raises(MediaFileMissing) as caught:
        locate_media_file(tmp_path, "parcel.jpg", DATASET)

    assert caught.value.path == "datasets/photos/parcel.jpg"


def test_locate_media_file_reports_a_folder_as_missing(tmp_path: Path) -> None:
    (tmp_path / "datasets" / "photos" / "parcel.jpg").mkdir(parents=True)

    with pytest.raises(MediaFileMissing):
        locate_media_file(tmp_path, "parcel.jpg", DATASET)


def test_locate_media_file_rejects_a_link_out_of_the_project(tmp_path: Path) -> None:
    project = tmp_path / "project"
    outside = tmp_path / "secret.jpg"
    outside.write_bytes(b"secret")
    link = project / "datasets" / "photos" / "parcel.jpg"
    link.parent.mkdir(parents=True)
    link.symlink_to(outside)

    with pytest.raises(MediaPathInvalid) as caught:
        locate_media_file(project, "parcel.jpg", DATASET)

    assert caught.value.problem is MediaPathProblem.LINKED_OUTSIDE


def test_locate_media_file_rejects_a_link_into_engine_state(tmp_path: Path) -> None:
    blob = tmp_path / ".aqven" / "blobs" / "parcel.bin"
    blob.parent.mkdir(parents=True)
    blob.write_bytes(b"blob")
    link = tmp_path / "datasets" / "photos" / "parcel.jpg"
    link.parent.mkdir(parents=True)
    link.symlink_to(blob)

    with pytest.raises(MediaPathInvalid) as caught:
        locate_media_file(tmp_path, "parcel.jpg", DATASET)

    assert caught.value.problem is MediaPathProblem.ENGINE_STATE


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (FILE_REF, True),
        ({"$media": "image/jpeg", "file": "parcel.jpg", "blob_id": BLOB_ID}, True),
        (BLOB_REF, False),
        ({"file": "parcel.jpg"}, False),
        ({"$media": "image/jpeg"}, False),
        ([FILE_REF], False),
        ("parcel.jpg", False),
        (None, False),
    ],
)
def test_is_media_file_ref_looks_at_the_shape_only(value: JsonValue, expected: bool) -> None:
    assert is_media_file_ref(value) is expected


def test_file_ref_name_defaults_to_the_file_name() -> None:
    assert parse_media_file_ref({"$media": "image/jpeg", "file": "damaged/box.jpg"}).media_name == "box.jpg"
    named = parse_media_file_ref({"$media": "image/jpeg", "file": "box.jpg", "name": "Box"})
    assert named.media_name == "Box"


@pytest.mark.parametrize(
    "value",
    [
        {"$media": "image/jpeg", "file": "parcel.jpg", "blob_id": BLOB_ID},
        {"$media": "image/jpeg", "file": "parcel.jpg", "size_bytes": 4},
        {"$media": "image/jpeg", "file": "parcel.jpg", "poster_blob_id": BLOB_ID},
        {"$media": "JPEG", "file": "parcel.jpg"},
        {"$media": "image/jpeg", "file": ""},
    ],
)
def test_file_ref_takes_no_blob_fields_and_a_valid_media_type(value: JsonValue) -> None:
    with pytest.raises(MediaFileRefInvalid):
        parse_media_file_ref(value)


@pytest.mark.parametrize(
    ("media_type", "file", "fits"),
    [
        ("image/jpeg", "parcel.jpg", True),
        ("image/jpeg", "parcel.JPEG", True),
        ("image/png", "parcel.png", True),
        ("audio/wav", "call.wav", True),
        ("application/pdf", "invoice.pdf", True),
        ("application/octet-stream", "parcel.jpg", True),
        ("image/jpeg", "parcel", True),
        ("image/jpeg", "parcel.unknownext", True),
        ("image/png", "parcel.jpg", False),
        ("image/jpeg", "invoice.pdf", False),
        ("audio/mpeg", "parcel.jpg", False),
    ],
)
def test_media_type_fits_the_file_extension(media_type: str, file: str, fits: bool) -> None:
    assert media_type_fits(media_type, file) is fits


def test_case_file_refs_are_found_in_inputs_node_outputs_and_expected_output() -> None:
    case = DatasetCase(
        name="parcel",
        inputs={"photos": [FILE_REF, BLOB_REF], "subject": "late"},
        node_outputs={NodeId("classify"): {"evidence": {"photo": FILE_REF}}},
        expected_output={"proof": FILE_REF},
    )

    paths = [path for path, _ in case_media_file_refs(case)]

    assert paths == [
        ("inputs", "photos", 0),
        ("node_outputs", "classify", "evidence", "photo"),
        ("expected_output", "proof"),
    ]
    assert has_media_file_refs(case)
    assert not has_media_file_refs(DatasetCase(name="plain", inputs={"photo": BLOB_REF}))


def test_placeholders_pass_a_media_type_without_reading_bytes() -> None:
    value: JsonValue = {"photos": [FILE_REF], "subject": "late"}

    replaced = with_media_placeholders(value)

    assert isinstance(replaced, dict)
    photos = replaced["photos"]
    assert isinstance(photos, list)
    image = Image.model_validate(photos[0])
    assert image.media_type == "image/jpeg"
    assert replaced["subject"] == "late"


@pytest.mark.parametrize(
    ("wanted", "expected"),
    [
        ("parcel.jpg", "parcel.jpg"),
        ("../../etc/parcel.jpg", "parcel.jpg"),
        ("C:\\Users\\anna\\parcel.jpg", "parcel.jpg"),
        (".hidden.jpg", "hidden.jpg"),
        ("..", "file"),
        ("", "file"),
    ],
)
def test_media_file_name_keeps_only_a_plain_name(wanted: str, expected: str) -> None:
    assert media_file_name(wanted) == expected


def test_unused_media_file_name_avoids_collisions(tmp_path: Path) -> None:
    folder = tmp_path / "datasets" / "photos"
    folder.mkdir(parents=True)

    assert unused_media_file_name(tmp_path, DATASET, "parcel.jpg") == "parcel.jpg"

    (folder / "parcel.jpg").write_bytes(b"one")
    (folder / "parcel_2.jpg").write_bytes(b"two")

    assert unused_media_file_name(tmp_path, DATASET, "parcel.jpg") == "parcel_3.jpg"
