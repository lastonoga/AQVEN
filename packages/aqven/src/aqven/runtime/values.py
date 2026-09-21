from typing import Annotated, Literal

from pydantic import Field, JsonValue

from aqven.runtime.address import ResourceModel
from aqven.spec import BlobId


class InlineValue(ResourceModel):
    kind: Literal["inline"] = "inline"
    value: JsonValue


class BlobValue(ResourceModel):
    kind: Literal["blob"] = "blob"
    blob_id: BlobId
    sha256: str
    size_bytes: Annotated[int, Field(ge=0)]
    media_type: str
    preview: Annotated[str, Field(max_length=8192)]
    truncated: bool


type ValueRef = Annotated[InlineValue | BlobValue, Field(discriminator="kind")]


class BlobUploaded(ResourceModel):
    blob_id: BlobId
    sha256: str
    size_bytes: Annotated[int, Field(ge=0)]
    media_type: str
