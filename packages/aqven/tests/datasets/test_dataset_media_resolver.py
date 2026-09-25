import hashlib
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

import pytest
from pydantic import JsonValue

from aqven.datasets import CaseMediaResolver, MediaFileMissing, MediaPathInvalid, MediaRefUnresolved
from aqven.engine.blobs import FileBlobStore
from aqven.spec import DatasetCase, MediaFileRef, MediaValue, NodeId
from aqven.testing import MemoryBlobStore

DATASET: Final = "datasets/photos.yaml"
PARCEL: Final = b"parcel jpeg bytes"
BOX: Final = b"box png bytes"
BLOB_REF: Final[dict[str, JsonValue]] = {
    "$media": "image/jpeg",
    "blob_id": f"sha256-{'a' * 64}",
    "size_bytes": 3,
    "name": "kept.jpg",
}


@dataclass(slots=True)
class CountingBlobStore:
    inner: MemoryBlobStore = field(default_factory=MemoryBlobStore)
    puts: list[bytes] = field(default_factory=list[bytes])

    async def put(self, data: bytes, media_type: str, name: str | None) -> MediaValue:
        self.puts.append(data)
        return await self.inner.put(data, media_type, name)


def blob_id(data: bytes) -> str:
    return f"sha256-{hashlib.sha256(data).hexdigest()}"


def media_file(root: Path, relative: str, data: bytes) -> Path:
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return target


def file_ref(file: str, media_type: str = "image/jpeg", name: str | None = None) -> dict[str, JsonValue]:
    reference: dict[str, JsonValue] = {"$media": media_type, "file": file}
    if name is not None:
        reference["name"] = name
    return reference


def nested_case() -> DatasetCase:
    return DatasetCase(
        name="late_parcel",
        inputs={
            "subject": "Where is my parcel",
            "photos": [file_ref("parcel.jpg"), {"caption": "box", "image": file_ref("damaged/box.png", "image/png")}],
            "kept": BLOB_REF,
        },
        node_outputs={NodeId("classify"): {"evidence": file_ref("@root/samples/parcel.jpg", name="shared.jpg")}},
        expected_output={"proof": file_ref("parcel.jpg"), "category": "delivery"},
    )


def step(value: JsonValue, key: str | int) -> JsonValue:
    if isinstance(value, dict) and isinstance(key, str):
        return value[key]
    if isinstance(value, list) and isinstance(key, int):
        return value[key]
    raise KeyError(key)


def media_at(value: JsonValue, *path: str | int) -> MediaValue:
    current = value
    for key in path:
        current = step(current, key)
    return MediaValue.model_validate(current)


@pytest.fixture
def project(tmp_path: Path) -> Path:
    media_file(tmp_path, "datasets/photos/parcel.jpg", PARCEL)
    media_file(tmp_path, "datasets/photos/damaged/box.png", BOX)
    media_file(tmp_path, "samples/parcel.jpg", PARCEL)
    return tmp_path


@pytest.mark.asyncio
async def test_resolve_case_turns_every_nested_file_ref_into_a_blob_media_value(project: Path) -> None:
    store = CountingBlobStore()
    resolver = CaseMediaResolver(project, store)

    resolved = await resolver.resolve_case(nested_case(), DATASET)

    parcel = media_at(resolved.inputs, "photos", 0)
    box = media_at(resolved.inputs, "photos", 1, "image")
    assert parcel == MediaValue.model_validate(
        {"$media": "image/jpeg", "blob_id": blob_id(PARCEL), "size_bytes": len(PARCEL), "name": "parcel.jpg"}
    )
    assert (box.media_type, box.blob_id, box.name) == ("image/png", blob_id(BOX), "box.png")
    assert media_at(resolved.inputs, "kept") == MediaValue.model_validate(BLOB_REF)
    assert isinstance(resolved.inputs, dict)
    assert resolved.inputs["subject"] == "Where is my parcel"
    outputs = resolved.node_outputs or {}
    shared = media_at(outputs[NodeId("classify")], "evidence")
    assert (shared.blob_id, shared.name) == (blob_id(PARCEL), "shared.jpg")
    assert media_at(resolved.expected_output, "proof").blob_id == blob_id(PARCEL)
    assert isinstance(resolved.expected_output, dict)
    assert resolved.expected_output["category"] == "delivery"
    assert store.inner.stored[parcel.blob_id] == PARCEL
    assert store.inner.stored[box.blob_id] == BOX


@pytest.mark.asyncio
async def test_resolved_case_holds_no_file_refs_and_keeps_the_rest(project: Path) -> None:
    case = nested_case()
    resolver = CaseMediaResolver(project, CountingBlobStore())

    resolved = await resolver.resolve_case(case, DATASET)

    assert "file" not in resolved.model_dump_json()
    assert (resolved.name, resolved.tags, resolved.metadata) == (case.name, case.tags, case.metadata)


@pytest.mark.asyncio
async def test_case_without_file_refs_is_returned_as_is(project: Path) -> None:
    case = DatasetCase(name="plain", inputs={"photo": BLOB_REF})
    store = CountingBlobStore()

    assert await CaseMediaResolver(project, store).resolve_case(case, DATASET) is case
    assert store.puts == []


@pytest.mark.asyncio
async def test_unchanged_file_is_read_and_stored_once(project: Path) -> None:
    store = CountingBlobStore()
    resolver = CaseMediaResolver(project, store)
    reference = MediaFileRef.model_validate(file_ref("parcel.jpg"))

    first = await resolver.resolve(reference, DATASET)
    second = await resolver.resolve(reference, DATASET)

    assert first == second
    assert store.puts == [PARCEL]


@pytest.mark.asyncio
async def test_changed_file_is_stored_again_under_its_new_content(project: Path) -> None:
    store = CountingBlobStore()
    resolver = CaseMediaResolver(project, store)
    reference = MediaFileRef.model_validate(file_ref("parcel.jpg"))
    before = await resolver.resolve(reference, DATASET)

    media_file(project, "datasets/photos/parcel.jpg", b"another parcel photo")
    after = await resolver.resolve(reference, DATASET)

    assert before.blob_id == blob_id(PARCEL)
    assert after.blob_id == blob_id(b"another parcel photo")
    assert store.puts == [PARCEL, b"another parcel photo"]


@pytest.mark.asyncio
async def test_touched_file_keeps_its_content_address(project: Path) -> None:
    store = CountingBlobStore()
    resolver = CaseMediaResolver(project, store)
    reference = MediaFileRef.model_validate(file_ref("parcel.jpg"))
    target = project / "datasets" / "photos" / "parcel.jpg"
    before = await resolver.resolve(reference, DATASET)

    status = target.stat()
    os.utime(target, ns=(status.st_atime_ns, status.st_mtime_ns + 1_000_000_000))
    after = await resolver.resolve(reference, DATASET)

    assert len(store.puts) == 2
    assert after.blob_id == before.blob_id


@pytest.mark.asyncio
async def test_same_bytes_in_two_files_share_one_blob(project: Path) -> None:
    resolver = CaseMediaResolver(project, CountingBlobStore())
    local = MediaFileRef.model_validate(file_ref("parcel.jpg"))
    shared = MediaFileRef.model_validate(file_ref("@root/samples/parcel.jpg", name="shared.jpg"))

    first = await resolver.resolve(local, DATASET)
    second = await resolver.resolve(shared, DATASET)

    assert first.blob_id == second.blob_id
    assert (first.name, second.name) == ("parcel.jpg", "shared.jpg")


@pytest.mark.asyncio
async def test_new_file_content_changes_the_resolved_case(project: Path) -> None:
    case = nested_case()
    resolver = CaseMediaResolver(project, CountingBlobStore())
    before = await resolver.resolve_case(case, DATASET)

    media_file(project, "datasets/photos/damaged/box.png", b"a different box")
    after = await resolver.resolve_case(case, DATASET)

    assert before.model_dump(mode="json") != after.model_dump(mode="json")


@pytest.mark.asyncio
async def test_missing_file_names_the_case_and_the_place(project: Path) -> None:
    case = DatasetCase(name="lost", inputs={"photos": [file_ref("lost.jpg")]})

    with pytest.raises(MediaRefUnresolved) as caught:
        await CaseMediaResolver(project, CountingBlobStore()).resolve_case(case, DATASET)

    assert caught.value.case == "lost"
    assert caught.value.location == ("inputs", "photos", 0)
    assert isinstance(caught.value.reason, MediaFileMissing)
    assert str(caught.value).startswith("case lost: inputs.photos[0]: media file lost.jpg does not exist")


@pytest.mark.asyncio
async def test_invalid_path_is_not_read(project: Path) -> None:
    store = CountingBlobStore()
    value: JsonValue = {"photo": file_ref("../../secret.jpg")}

    with pytest.raises(MediaRefUnresolved) as caught:
        await CaseMediaResolver(project, store).resolve_value(value, DATASET)

    assert isinstance(caught.value.reason, MediaPathInvalid)
    assert store.puts == []


def test_sync_resolution_matches_async(project: Path) -> None:
    store = CountingBlobStore()
    resolver = CaseMediaResolver(project, store)

    resolved = resolver.resolve_case_sync(nested_case(), DATASET)
    value = resolver.resolve_value_sync(file_ref("parcel.jpg"), DATASET)

    assert media_at(resolved.inputs, "photos", 0) == MediaValue.model_validate(value)
    assert store.puts == [PARCEL, BOX, PARCEL]


@pytest.mark.asyncio
async def test_bytes_land_in_the_engine_blob_store(project: Path) -> None:
    blobs = FileBlobStore(project / ".aqven" / "blobs")
    resolver = CaseMediaResolver(project, blobs)

    resolved = await resolver.resolve_case(nested_case(), DATASET)

    parcel = media_at(resolved.inputs, "photos", 0)
    assert blobs.read(parcel.blob_id) == PARCEL
    assert await blobs.get(parcel) == PARCEL
