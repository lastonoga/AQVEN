import hashlib
import os
import re
import tempfile
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Final, Protocol

from anyio import to_thread
from pydantic import AwareDatetime, Field

from aqven.runtime.address import ResourceModel
from aqven.runtime.values import BlobUploaded
from aqven.server.workspace import utc_now
from aqven.spec import BlobId, MediaValue

BLOB_PREFIX: Final = "sha256-"
BLOB_ID: Final = re.compile(r"^sha256-[0-9a-f]{64}$")
META_SUFFIX: Final = ".json"
DATA_SUFFIX: Final = ".bin"
DEFAULT_MEDIA_TYPE: Final = "application/octet-stream"


class BlobMeta(ResourceModel):
    blob_id: BlobId
    sha256: str
    size_bytes: Annotated[int, Field(ge=0)]
    media_type: str
    name: str | None
    created_at: AwareDatetime


@dataclass(frozen=True, slots=True)
class BlobFile:
    path: Path
    meta: BlobMeta


class BlobMissing(LookupError):
    def __init__(self, blob_id: str) -> None:
        super().__init__(f"blob {blob_id} is not in the store")
        self.blob_id = blob_id


class BlobFiles(Protocol):
    async def store(self, chunks: AsyncIterator[bytes], media_type: str, name: str | None) -> BlobMeta: ...

    async def locate(self, blob_id: str) -> BlobFile | None: ...


def valid_blob_id(blob_id: str) -> bool:
    return BLOB_ID.fullmatch(blob_id) is not None


@dataclass(frozen=True, slots=True)
class DirectoryBlobStore:
    directory: Path

    async def store(self, chunks: AsyncIterator[bytes], media_type: str, name: str | None) -> BlobMeta:
        await to_thread.run_sync(self._ensure_directory)
        digest = hashlib.sha256()
        size = 0
        descriptor, temporary = tempfile.mkstemp(dir=self.directory, suffix=".part")
        with os.fdopen(descriptor, "wb") as target:
            async for chunk in chunks:
                digest.update(chunk)
                size += len(chunk)
                await to_thread.run_sync(target.write, chunk)
        blob_id = BlobId(f"{BLOB_PREFIX}{digest.hexdigest()}")
        meta = BlobMeta(
            blob_id=blob_id,
            sha256=blob_id,
            size_bytes=size,
            media_type=media_type or DEFAULT_MEDIA_TYPE,
            name=name,
            created_at=utc_now(),
        )
        return await to_thread.run_sync(self._commit, Path(temporary), meta)

    async def locate(self, blob_id: str) -> BlobFile | None:
        if not valid_blob_id(blob_id):
            return None
        return await to_thread.run_sync(self._read, blob_id)

    async def put(self, data: bytes, media_type: str, name: str | None) -> MediaValue:
        meta = await self.store(_single(data), media_type, name)
        return media_of(meta)

    async def get(self, media: MediaValue) -> bytes:
        found = await self.locate(media.blob_id)
        if found is None:
            raise BlobMissing(media.blob_id)
        return await to_thread.run_sync(found.path.read_bytes)

    def _ensure_directory(self) -> None:
        self.directory.mkdir(parents=True, exist_ok=True)

    def _data_path(self, blob_id: str) -> Path:
        return self.directory / f"{blob_id}{DATA_SUFFIX}"

    def _meta_path(self, blob_id: str) -> Path:
        return self.directory / f"{blob_id}{META_SUFFIX}"

    def _commit(self, temporary: Path, meta: BlobMeta) -> BlobMeta:
        existing = self._read_canonical(meta.blob_id)
        if existing is not None:
            temporary.unlink(missing_ok=True)
            return existing.meta
        os.replace(temporary, self._data_path(meta.blob_id))
        meta_temporary = self._meta_path(meta.blob_id).with_suffix(".json.part")
        meta_temporary.write_text(meta.model_dump_json(), encoding="utf-8")
        os.replace(meta_temporary, self._meta_path(meta.blob_id))
        return meta

    def _read(self, blob_id: str) -> BlobFile | None:
        canonical = self._read_canonical(blob_id)
        if canonical is not None:
            return canonical
        legacy = self.directory / blob_id.removeprefix(BLOB_PREFIX)
        if not legacy.is_file():
            return None
        status = legacy.stat()
        return BlobFile(
            legacy,
            BlobMeta(
                blob_id=BlobId(blob_id),
                sha256=blob_id,
                size_bytes=status.st_size,
                media_type=DEFAULT_MEDIA_TYPE,
                name=None,
                created_at=datetime.fromtimestamp(status.st_mtime, UTC),
            ),
        )

    def _read_canonical(self, blob_id: str) -> BlobFile | None:
        data = self._data_path(blob_id)
        meta = self._meta_path(blob_id)
        if not data.is_file() or not meta.is_file():
            return None
        return BlobFile(data, BlobMeta.model_validate_json(meta.read_bytes()))


async def _single(data: bytes) -> AsyncIterator[bytes]:
    yield data


def media_of(meta: BlobMeta) -> MediaValue:
    return MediaValue.model_validate(
        {"$media": meta.media_type, "blob_id": meta.blob_id, "size_bytes": meta.size_bytes, "name": meta.name}
    )


def uploaded(meta: BlobMeta) -> BlobUploaded:
    return BlobUploaded(
        blob_id=meta.blob_id, sha256=meta.sha256, size_bytes=meta.size_bytes, media_type=meta.media_type
    )
