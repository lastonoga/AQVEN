import asyncio
import hashlib
import json
import os
import re
import tempfile
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Final

from pydantic import JsonValue

from aqven.spec import BLOB_ID_PATTERN, BlobId, MediaValue

BLOB_ID_PREFIX: Final = "sha256-"
MEDIA_KEY: Final = "$media"
BLOB_ID: Final = re.compile(BLOB_ID_PATTERN)
DATA_SUFFIX: Final = ".bin"
META_SUFFIX: Final = ".json"


class BlobMissing(LookupError):
    def __init__(self, blob_id: str) -> None:
        super().__init__(f"blob {blob_id} is not in the project blob store")
        self.blob_id = blob_id


def blob_id_of(data: bytes) -> BlobId:
    return BlobId(f"{BLOB_ID_PREFIX}{hashlib.sha256(data).hexdigest()}")


def media_of(blob_id: BlobId, size: int, media_type: str, name: str | None) -> MediaValue:
    document: dict[str, JsonValue] = {MEDIA_KEY: media_type, "blob_id": blob_id, "size_bytes": size, "name": name}
    return MediaValue.model_validate(document)


@dataclass(frozen=True, slots=True)
class FileBlobStore:
    directory: Path

    def path_of(self, blob_id: str) -> Path:
        if BLOB_ID.fullmatch(blob_id) is None:
            raise BlobMissing(blob_id)
        return self.directory / f"{blob_id}{DATA_SUFFIX}"

    def legacy_path_of(self, blob_id: str) -> Path:
        if BLOB_ID.fullmatch(blob_id) is None:
            raise BlobMissing(blob_id)
        return self.directory / blob_id.removeprefix(BLOB_ID_PREFIX)

    async def put(self, data: bytes, media_type: str, name: str | None) -> MediaValue:
        blob_id = blob_id_of(data)
        await asyncio.to_thread(self._write, blob_id, data, media_type, name)
        return media_of(blob_id, len(data), media_type, name)

    async def get(self, media: MediaValue) -> bytes:
        return await asyncio.to_thread(self.read, media.blob_id)

    def read(self, blob_id: str) -> bytes:
        target = self.path_of(blob_id)
        if not target.is_file():
            target = self.legacy_path_of(blob_id)
            if not target.is_file():
                raise BlobMissing(blob_id)
        return target.read_bytes()

    def exists(self, blob_id: str) -> bool:
        return BLOB_ID.fullmatch(blob_id) is not None and (
            self.path_of(blob_id).is_file() or self.legacy_path_of(blob_id).is_file()
        )

    def _write(self, blob_id: BlobId, data: bytes, media_type: str, name: str | None) -> None:
        target = self.path_of(blob_id)
        self.directory.mkdir(parents=True, exist_ok=True)
        if not target.is_file():
            descriptor, temporary = tempfile.mkstemp(dir=self.directory, prefix=".blob-")
            try:
                with os.fdopen(descriptor, "wb") as stream:
                    stream.write(data)
                os.replace(temporary, target)
            except BaseException:
                Path(temporary).unlink(missing_ok=True)
                raise
        meta_path = self.directory / f"{blob_id}{META_SUFFIX}"
        if meta_path.is_file():
            return
        meta = {
            "blob_id": blob_id,
            "sha256": blob_id,
            "size_bytes": len(data),
            "media_type": media_type,
            "name": name,
            "created_at": datetime.now(UTC).isoformat(),
        }
        descriptor, temporary = tempfile.mkstemp(dir=self.directory, prefix=".blob-meta-")
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
                json.dump(meta, stream)
            os.replace(temporary, meta_path)
        except BaseException:
            Path(temporary).unlink(missing_ok=True)
            raise
