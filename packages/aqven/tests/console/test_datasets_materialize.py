import asyncio
import json
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final

import pytest
from pydantic import JsonValue

from aqven.check import check_project
from aqven.cli import COMMANDS, main
from aqven.console.command import EXIT_FAILED, EXIT_OK, EXIT_USAGE, OutputFormat
from aqven.console.datasets import DatasetsCommand, MaterializeRequest, ServiceFilesWriter, materialize_datasets
from aqven.datasets import CaseMediaResolver
from aqven.datasets.materialize import DatasetSource, LeftReason, MediaMaterializer, wanted_file_name
from aqven.diagnostics import render_path
from aqven.engine.blobs import FileBlobStore
from aqven.loader import load_project
from aqven.loader.aliases import AliasScope
from aqven.spec import BlobId, DatasetId, MediaValue
from aqven.testing import MemoryBlobStore, copy_project
from aqven.write import WriteService
from aqven.write.canonical import document_bytes, parse_document

FIXTURE: Final = Path(__file__).resolve().parents[1] / "fixtures" / "fixture_shop"
DATASET: Final = "photos"
DATASET_FILE: Final = "datasets/photos.yaml"
FOLDER: Final = "datasets/photos"
PARCEL: Final = b"parcel jpeg bytes"
TORN: Final = b"torn box jpeg bytes"
SKETCH: Final = b"sketch png bytes"
LOST: Final = b"bytes nobody stored"

CASE_TEMPLATE: Final = """- name: "{name}"
  inputs:
    subject: "Where is my parcel"
    body: "The order did not arrive in time"
    customer:
      name: "Anna"
      email: null
    photo:
{photo}
"""


@dataclass(frozen=True, slots=True)
class Stored:
    media: MediaValue
    data: bytes


def stored(root: Path, data: bytes, media_type: str, name: str | None) -> Stored:
    media = asyncio.run(FileBlobStore(root / ".aqven" / "blobs").put(data, media_type, name))
    return Stored(media, data)


def unstored(data: bytes, media_type: str, name: str | None) -> MediaValue:
    return asyncio.run(MemoryBlobStore().put(data, media_type, name))


def photo_yaml(media: MediaValue) -> str:
    lines = (
        f'      $media: "{media.media_type}"',
        f'      blob_id: "{media.blob_id}"',
        f"      size_bytes: {media.size_bytes}",
        f'      name: "{media.name}"' if media.name is not None else "      name: null",
    )
    return "\n".join(lines)


def write_dataset(root: Path, cases: Mapping[str, MediaValue]) -> None:
    header = 'apiVersion: "aqven/v1"\nkind: "Dataset"\nflow: "triage"\ncases:\n'
    body = "".join(CASE_TEMPLATE.format(name=name, photo=photo_yaml(media)) for name, media in cases.items())
    target = root / DATASET_FILE
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(header + body, encoding="utf-8")


def photos(root: Path) -> dict[str, JsonValue]:
    document = parse_document(DATASET_FILE, (root / DATASET_FILE).read_bytes())
    assert document is not None
    cases = document["cases"]
    assert isinstance(cases, list)
    found: dict[str, JsonValue] = {}
    for case in cases:
        assert isinstance(case, dict)
        inputs = case["inputs"]
        assert isinstance(inputs, dict)
        found[str(case["name"])] = inputs["photo"]
    return found


def resolved_photos(root: Path) -> dict[str, JsonValue]:
    loaded = load_project(root).project
    assert loaded is not None
    source = loaded.datasets[DatasetId(DATASET)]
    resolver = CaseMediaResolver(root, MemoryBlobStore())
    cases = (resolver.resolve_case_sync(case, source.path) for case in source.spec.cases)
    return {case.name: case.inputs["photo"] for case in cases if isinstance(case.inputs, dict)}


def run(root: Path, *arguments: str) -> int:
    return main(["datasets", "materialize", str(root), *arguments])


@pytest.fixture
def shop(tmp_path: Path) -> Path:
    return copy_project(FIXTURE, tmp_path)


def test_datasets_command_is_registered_with_its_materialize_action() -> None:
    assert isinstance(COMMANDS["datasets"], DatasetsCommand)
    assert run(Path("."), "--help") == 0


def test_materialize_copies_blobs_next_to_the_dataset_and_resolves_to_the_same_values(
    shop: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    parcel = stored(shop, PARCEL, "image/jpeg", "parcel.jpg")
    torn = stored(shop, TORN, "image/jpeg", "parcel.jpg")
    sketch = stored(shop, SKETCH, "image/png", None)
    cases = {
        "late_parcel": parcel.media,
        "torn_box": torn.media,
        "same_parcel": parcel.media.model_copy(update={"name": "again.jpg"}),
        "sketch": sketch.media,
    }
    write_dataset(shop, cases)
    before = {name: media.model_dump(mode="json") for name, media in cases.items()}

    code = run(shop, DATASET)
    output = capsys.readouterr().out

    sketch_file = f"{sketch.media.blob_id.removeprefix('sha256-')[:12]}.png"
    assert code == EXIT_OK
    assert (shop / FOLDER / "parcel.jpg").read_bytes() == PARCEL
    assert (shop / FOLDER / "parcel_2.jpg").read_bytes() == TORN
    assert (shop / FOLDER / sketch_file).read_bytes() == SKETCH
    assert sorted(path.name for path in (shop / FOLDER).iterdir()) == sorted(
        ("parcel.jpg", "parcel_2.jpg", sketch_file)
    )
    assert photos(shop) == {
        "late_parcel": {"$media": "image/jpeg", "file": "parcel.jpg"},
        "torn_box": {"$media": "image/jpeg", "file": "parcel_2.jpg", "name": "parcel.jpg"},
        "same_parcel": {"$media": "image/jpeg", "file": "parcel.jpg", "name": "again.jpg"},
        "sketch": {"$media": "image/png", "file": sketch_file},
    }
    assert resolved_photos(shop) == {
        **{name: before[name] for name in ("late_parcel", "torn_box", "same_parcel")},
        "sketch": {**before["sketch"], "name": sketch_file},
    }
    assert check_project(shop).diagnostics == ()
    assert f"copied {parcel.media.blob_id[:19]}" in output
    assert "rewrote cases[1].inputs.photo of case torn_box as file parcel_2.jpg, name parcel.jpg" in output
    assert "4 values as 3 files (3 copied from .aqven/blobs), 0 values left, 0 blobs missing" in output


def test_second_run_finds_nothing_to_do(shop: Path, capsys: pytest.CaptureFixture[str]) -> None:
    write_dataset(shop, {"late_parcel": stored(shop, PARCEL, "image/jpeg", "parcel.jpg").media})
    assert run(shop) == EXIT_OK
    capsys.readouterr()

    assert run(shop) == EXIT_OK
    assert capsys.readouterr().out.strip() == "no dataset case points at a blob"


def test_dry_run_prints_the_plan_and_writes_nothing(shop: Path, capsys: pytest.CaptureFixture[str]) -> None:
    parcel = stored(shop, PARCEL, "image/jpeg", "parcel.jpg")
    write_dataset(shop, {"late_parcel": parcel.media})
    before = (shop / DATASET_FILE).read_bytes()

    code = run(shop, DATASET, "--dry-run")
    output = capsys.readouterr().out

    assert code == EXIT_OK
    assert (shop / DATASET_FILE).read_bytes() == before
    assert not (shop / FOLDER).exists()
    assert output.splitlines()[0] == "dry run: nothing is written"
    assert f"would copy {parcel.media.blob_id[:19]} to {FOLDER}/parcel.jpg (17 bytes)" in output
    assert "would rewrite cases[0].inputs.photo of case late_parcel as file parcel.jpg" in output


def test_missing_blob_is_named_and_its_value_stays(shop: Path, capsys: pytest.CaptureFixture[str]) -> None:
    parcel = stored(shop, PARCEL, "image/jpeg", "parcel.jpg")
    lost = unstored(LOST, "image/jpeg", "lost.jpg")
    write_dataset(shop, {"late_parcel": parcel.media, "lost_photo": lost})

    code = run(shop, DATASET)
    output = capsys.readouterr().out

    assert code == EXIT_FAILED
    assert photos(shop)["lost_photo"] == lost.model_dump(mode="json")
    assert photos(shop)["late_parcel"] == {"$media": "image/jpeg", "file": "parcel.jpg"}
    assert f"left cases[1].inputs.photo of case lost_photo {lost.blob_id[:19]}" in output
    assert "1 blob missing" in output


def test_file_that_already_holds_the_bytes_is_kept(shop: Path, capsys: pytest.CaptureFixture[str]) -> None:
    parcel = stored(shop, PARCEL, "image/jpeg", "parcel.jpg")
    write_dataset(shop, {"late_parcel": parcel.media})
    (shop / FOLDER).mkdir(parents=True)
    (shop / FOLDER / "parcel.jpg").write_bytes(PARCEL)

    assert run(shop, DATASET) == EXIT_OK

    assert "kept datasets/photos/parcel.jpg" in capsys.readouterr().out
    assert [path.name for path in (shop / FOLDER).iterdir()] == ["parcel.jpg"]
    assert photos(shop)["late_parcel"] == {"$media": "image/jpeg", "file": "parcel.jpg"}


def test_unknown_dataset_is_a_usage_error(shop: Path, capsys: pytest.CaptureFixture[str]) -> None:
    write_dataset(shop, {"late_parcel": stored(shop, PARCEL, "image/jpeg", "parcel.jpg").media})

    assert run(shop, "nope") == EXIT_USAGE
    assert "not in the project: nope; its datasets: photos" in capsys.readouterr().err


def test_json_report_carries_the_file_references(shop: Path, capsys: pytest.CaptureFixture[str]) -> None:
    parcel = stored(shop, PARCEL, "image/jpeg", "parcel.jpg")
    write_dataset(shop, {"late_parcel": parcel.media})

    assert run(shop, "--format", "json", "--dry-run") == EXIT_OK
    report = json.loads(capsys.readouterr().out)

    dataset = report["datasets"][0]
    assert report["dry_run"] is True
    assert dataset["copies"] == [
        {"blob_id": parcel.media.blob_id, "file": f"{FOLDER}/parcel.jpg", "size_bytes": 17, "present": False}
    ]
    assert dataset["rewritten"][0]["reference"] == {"$media": "image/jpeg", "file": "parcel.jpg"}
    assert dataset["rewritten"][0]["location"] == ["cases", 0, "inputs", "photo"]


@dataclass(frozen=True, slots=True)
class EditingFirstWriter:
    root: Path

    def write(self, files: Mapping[str, bytes], expected: Mapping[str, str | None]) -> None:
        target = self.root / DATASET_FILE
        target.write_text(target.read_text(encoding="utf-8").replace("Anna", "Anne"), encoding="utf-8")
        ServiceFilesWriter(WriteService(self.root)).write(files, expected)


@dataclass(frozen=True, slots=True)
class CreatingFirstWriter:
    root: Path

    def write(self, files: Mapping[str, bytes], expected: Mapping[str, str | None]) -> None:
        target = self.root / FOLDER / "parcel.jpg"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(TORN)
        ServiceFilesWriter(WriteService(self.root)).write(files, expected)


def test_dataset_edited_meanwhile_is_a_stale_file_and_nothing_is_written(
    shop: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    write_dataset(shop, {"late_parcel": stored(shop, PARCEL, "image/jpeg", "parcel.jpg").media})
    request = MaterializeRequest(root=shop, dataset_ids=(DATASET,), output=OutputFormat.TEXT)

    code = materialize_datasets(request, writer=EditingFirstWriter(shop))

    assert code == EXIT_FAILED
    assert "STALE_FILE: datasets/photos.yaml changed after it was read" in capsys.readouterr().err
    assert "blob_id" in (shop / DATASET_FILE).read_text(encoding="utf-8")
    assert not (shop / FOLDER).exists()


def test_file_created_meanwhile_is_not_overwritten(shop: Path, capsys: pytest.CaptureFixture[str]) -> None:
    write_dataset(shop, {"late_parcel": stored(shop, PARCEL, "image/jpeg", "parcel.jpg").media})
    request = MaterializeRequest(root=shop, dataset_ids=(DATASET,), output=OutputFormat.TEXT)

    code = materialize_datasets(request, writer=CreatingFirstWriter(shop))

    assert code == EXIT_FAILED
    assert "FILE_EXISTS: datasets/photos/parcel.jpg already exists" in capsys.readouterr().err
    assert (shop / FOLDER / "parcel.jpg").read_bytes() == TORN


def test_other_blob_store_folder(shop: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    elsewhere = tmp_path / "elsewhere"
    parcel = asyncio.run(FileBlobStore(elsewhere).put(PARCEL, "image/jpeg", "parcel.jpg"))
    write_dataset(shop, {"late_parcel": parcel})

    assert run(shop, "--blobs", str(elsewhere)) == EXIT_OK

    assert (shop / FOLDER / "parcel.jpg").read_bytes() == PARCEL
    assert f"copied from {elsewhere.as_posix()}" in capsys.readouterr().out


@dataclass(frozen=True, slots=True)
class KnownBlobs:
    stored: Mapping[str, bytes]

    def exists(self, blob_id: str) -> bool:
        return blob_id in self.stored

    def read(self, blob_id: str) -> bytes:
        return self.stored[blob_id]


def test_plan_leaves_values_a_file_reference_cannot_hold_and_follows_node_outputs(tmp_path: Path) -> None:
    parcel = unstored(PARCEL, "image/jpeg", "parcel.jpg")
    poster = unstored(PARCEL, "video/mp4", "clip.mp4").model_copy(update={"poster_blob_id": parcel.blob_id})
    broken: dict[str, JsonValue] = {"$media": "image/jpeg", "blob_id": "sha256-short", "size_bytes": 1, "name": None}
    case: dict[str, JsonValue] = {
        "name": "late_parcel",
        "inputs": {"clip": poster.model_dump(mode="json"), "broken": broken},
        "node_outputs": {"classify": {"preview": [parcel.model_dump(mode="json")]}},
    }
    target = tmp_path / DATASET_FILE
    target.parent.mkdir(parents=True)
    target.write_bytes(document_bytes({"apiVersion": "aqven/v1", "kind": "Dataset", "cases": [case]}))
    materializer = MediaMaterializer(tmp_path, KnownBlobs({parcel.blob_id: PARCEL}), AliasScope(tmp_path.name, ()))

    report = materializer.plan((DatasetSource(DatasetId(DATASET), DATASET_FILE),)).datasets[0].report

    assert [(render_path(item.location), item.reason) for item in report.left] == [
        ("cases[0].inputs.clip", LeftReason.EXTRA_FIELDS),
        ("cases[0].inputs.broken", LeftReason.INVALID),
    ]
    assert [render_path(item.location) for item in report.rewritten] == ["cases[0].node_outputs.classify.preview[0]"]
    assert [copy.file for copy in report.copies] == [f"{FOLDER}/parcel.jpg"]


@pytest.mark.parametrize(
    ("media_type", "name", "expected"),
    [
        ("image/jpeg", "parcel.jpg", "parcel.jpg"),
        ("image/jpeg", "parcel", "parcel.jpg"),
        ("image/jpeg", "parcel.png", "parcel.jpg"),
        ("audio/wav", "voice", "voice.wav"),
        ("application/pdf", "../../invoice.pdf", "invoice.pdf"),
        ("application/x-unknown-kind", "notes", "notes"),
        ("image/png", None, "0123456789ab.png"),
    ],
)
def test_wanted_file_name(media_type: str, name: str | None, expected: str) -> None:
    blob_id = BlobId(f"sha256-0123456789ab{'c' * 52}")
    media = MediaValue(media_type=media_type, blob_id=blob_id, size_bytes=1, name=name)

    assert wanted_file_name(media) == expected
