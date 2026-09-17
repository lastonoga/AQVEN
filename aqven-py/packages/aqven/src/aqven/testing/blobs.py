from dataclasses import dataclass, field
from typing import Final

from pydantic import JsonValue

from aqven.loader import file_hash
from aqven.spec import BlobId, MediaValue

MEDIA_KEY: Final = "$media"


class BlobNotFound(LookupError):
    def __init__(self, blob_id: str, location: str) -> None:
        super().__init__(f"blob {blob_id} is not in {location}")
        self.blob_id = blob_id
        self.location = location


def blob_id_for(data: bytes) -> BlobId:
    return BlobId(file_hash(data))


def media_value(data: bytes, media_type: str, name: str | None) -> MediaValue:
    document: dict[str, JsonValue] = {
        MEDIA_KEY: media_type,
        "blob_id": blob_id_for(data),
        "size_bytes": len(data),
        "name": name,
    }
    return MediaValue.model_validate(document)


@dataclass(slots=True)
class MemoryBlobStore:
    stored: dict[BlobId, bytes] = field(default_factory=dict[BlobId, bytes])

    async def put(self, data: bytes, media_type: str, name: str | None) -> MediaValue:
        media = media_value(data, media_type, name)
        self.stored[media.blob_id] = data
        return media

    async def get(self, media: MediaValue) -> bytes:
        data = self.stored.get(media.blob_id)
        if data is None:
            raise BlobNotFound(media.blob_id, "memory")
        return data
