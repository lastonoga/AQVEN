import asyncio
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

from pydantic import JsonValue

from aqven.datasets.media_refs import (
    EXPECTED_OUTPUT_PART,
    INPUTS_PART,
    NODE_OUTPUTS_PART,
    JsonPath,
    MediaFileError,
    has_media_file_refs,
    locate_media_file,
    media_file_refs,
    parse_media_file_ref,
    replace_media_file_refs,
)
from aqven.diagnostics import render_path
from aqven.spec import BlobId, DatasetCase, MediaFileRef, MediaValue, NodeId


class BlobWriter(Protocol):
    async def put(self, data: bytes, media_type: str, name: str | None) -> MediaValue: ...


class MediaRefUnresolved(MediaFileError):
    def __init__(self, location: JsonPath, reason: MediaFileError, case: str | None = None) -> None:
        where = render_path(location) or "value"
        owner = "" if case is None else f"case {case}: "
        super().__init__(f"{owner}{where}: {reason}")
        self.location = location
        self.reason = reason
        self.case = case


@dataclass(frozen=True, slots=True)
class MediaFileStamp:
    path: Path
    mtime_ns: int
    size_bytes: int


@dataclass(frozen=True, slots=True)
class StoredMedia:
    blob_id: BlobId
    size_bytes: int


def file_stamp(location: Path) -> MediaFileStamp:
    status = location.stat()
    return MediaFileStamp(location, status.st_mtime_ns, status.st_size)


def stored_media_value(stored: StoredMedia, reference: MediaFileRef) -> MediaValue:
    return MediaValue(
        media_type=reference.media_type,
        blob_id=stored.blob_id,
        size_bytes=stored.size_bytes,
        name=reference.media_name,
    )


@dataclass(slots=True)
class CaseMediaResolver:
    root: Path
    blobs: BlobWriter
    stored: dict[MediaFileStamp, StoredMedia] = field(default_factory=dict[MediaFileStamp, StoredMedia])

    async def resolve(self, reference: MediaFileRef, dataset_path: str) -> MediaValue:
        location = await asyncio.to_thread(locate_media_file, self.root, reference.file, dataset_path)
        stamp = await asyncio.to_thread(file_stamp, location)
        known = self.stored.get(stamp)
        stored = known if known is not None else await self._store(stamp, reference)
        return stored_media_value(stored, reference)

    async def resolve_value(self, value: JsonValue, dataset_path: str) -> JsonValue:
        return await self._resolve_at(None, (), value, dataset_path)

    async def resolve_case(self, case: DatasetCase, dataset_path: str) -> DatasetCase:
        if not has_media_file_refs(case):
            return case
        inputs = await self._resolve_at(case.name, (INPUTS_PART,), case.inputs, dataset_path)
        expected = await self._resolve_at(case.name, (EXPECTED_OUTPUT_PART,), case.expected_output, dataset_path)
        node_outputs = await self._node_outputs(case, dataset_path)
        return case.model_copy(update={"inputs": inputs, "expected_output": expected, "node_outputs": node_outputs})

    def resolve_value_sync(self, value: JsonValue, dataset_path: str) -> JsonValue:
        return asyncio.run(self.resolve_value(value, dataset_path))

    def resolve_case_sync(self, case: DatasetCase, dataset_path: str) -> DatasetCase:
        return asyncio.run(self.resolve_case(case, dataset_path))

    async def _node_outputs(self, case: DatasetCase, dataset_path: str) -> dict[NodeId, JsonValue] | None:
        if case.node_outputs is None:
            return None
        return {
            node: await self._resolve_at(case.name, (NODE_OUTPUTS_PART, node), value, dataset_path)
            for node, value in case.node_outputs.items()
        }

    async def _resolve_at(self, case: str | None, prefix: JsonPath, value: JsonValue, dataset_path: str) -> JsonValue:
        resolved = {
            path: await self._resolve_ref(case, path, reference, dataset_path)
            for path, reference in media_file_refs(value, prefix)
        }
        if not resolved:
            return value
        return replace_media_file_refs(value, lambda path, _: resolved[path], prefix)

    async def _resolve_ref(
        self, case: str | None, path: JsonPath, reference: dict[str, JsonValue], dataset_path: str
    ) -> JsonValue:
        try:
            media = await self.resolve(parse_media_file_ref(reference), dataset_path)
        except MediaFileError as error:
            raise MediaRefUnresolved(path, error, case) from error
        return media.model_dump(mode="json")

    async def _store(self, stamp: MediaFileStamp, reference: MediaFileRef) -> StoredMedia:
        data = await asyncio.to_thread(stamp.path.read_bytes)
        media = await self.blobs.put(data, reference.media_type, reference.media_name)
        stored = StoredMedia(media.blob_id, media.size_bytes)
        self.stored[stamp] = stored
        return stored
