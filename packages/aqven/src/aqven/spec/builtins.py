from collections.abc import Mapping
from pathlib import PurePosixPath
from typing import Final, Self

from pydantic import BaseModel, ConfigDict, Field, JsonValue, model_validator

from aqven.spec.common import SpecModel
from aqven.spec.names import BLOB_ID_PATTERN, NAME_PATTERN, TYPE_REF_PATTERN, BlobId, Modality, TypeId

TEXT: Final = TypeId("Text")
INT: Final = TypeId("Int")
FLOAT: Final = TypeId("Float")
BOOL: Final = TypeId("Bool")
DATE: Final = TypeId("Date")
DATE_TIME: Final = TypeId("DateTime")
TIME_ZONE: Final = TypeId("TimeZone")
LOCALE: Final = TypeId("Locale")
TENANT_ID: Final = TypeId("TenantId")
IMAGE: Final = TypeId("Image")
AUDIO: Final = TypeId("Audio")
VIDEO: Final = TypeId("Video")
DOCUMENT: Final = TypeId("Document")
DYNAMIC: Final = TypeId("Dynamic")
FIELD_SPEC: Final = TypeId("FieldSpec")
MAP_ITEM_ERROR: Final = TypeId("MapItemError")
RECORD_LABEL: Final = TypeId("Record")

SCALAR_TYPES: Final = frozenset({TEXT, INT, FLOAT, BOOL, DATE, DATE_TIME})
CONTEXT_TYPES: Final = frozenset({TIME_ZONE, LOCALE, TENANT_ID})
MEDIA_TYPES: Final = frozenset({IMAGE, AUDIO, VIDEO, DOCUMENT})
DYNAMIC_TYPES: Final = frozenset({DYNAMIC, FIELD_SPEC})
BUILTIN_TYPE_IDS: Final = frozenset({*SCALAR_TYPES, *CONTEXT_TYPES, *MEDIA_TYPES, *DYNAMIC_TYPES, MAP_ITEM_ERROR})
ALWAYS_BOUNDED_TYPES: Final = frozenset(
    {INT, FLOAT, BOOL, DATE, DATE_TIME, *CONTEXT_TYPES, *MEDIA_TYPES, FIELD_SPEC, MAP_ITEM_ERROR}
)

MEDIA_MODALITY: Final[Mapping[TypeId, Modality]] = {
    IMAGE: Modality.IMAGE,
    AUDIO: Modality.AUDIO,
    VIDEO: Modality.VIDEO,
    DOCUMENT: Modality.DOCUMENT,
}

FIELD_SPEC_FORBIDDEN_TYPES: Final = frozenset({*MEDIA_TYPES, *DYNAMIC_TYPES})
FIELD_SPEC_MAX_ENUM: Final = 50

MEDIA_URL_LIMIT: Final = 2048
MEDIA_NOTE_LIMIT: Final = 1000
MEDIA_FILE_LIMIT: Final = 1024
MEDIA_KEY: Final = "$media"
MEDIA_FILE_KEY: Final = "file"
MEDIA_TYPE_PATTERN: Final = r"^[a-z]+/[a-z0-9.+-]+$"
READ_ONLY: Final[dict[str, JsonValue]] = {"readOnly": True}


def absent(value: object) -> bool:
    return value is None


DATA_CONFIG: Final = ConfigDict(
    extra="forbid",
    frozen=True,
    validate_by_alias=True,
    validate_by_name=False,
    serialize_by_alias=True,
)


class MediaValue(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        validate_by_alias=True,
        validate_by_name=True,
        serialize_by_alias=True,
    )

    media_type: str = Field(
        validation_alias="$media",
        serialization_alias="$media",
        min_length=3,
        max_length=255,
        pattern=MEDIA_TYPE_PATTERN,
    )
    blob_id: BlobId = Field(pattern=BLOB_ID_PATTERN)
    size_bytes: int = Field(ge=0)
    name: str | None = Field(max_length=255)
    url: str | None = Field(default=None, max_length=MEDIA_URL_LIMIT, json_schema_extra=READ_ONLY, exclude_if=absent)
    poster_blob_id: BlobId | None = Field(
        default=None, pattern=BLOB_ID_PATTERN, json_schema_extra=READ_ONLY, exclude_if=absent
    )
    note: str | None = Field(default=None, max_length=MEDIA_NOTE_LIMIT, json_schema_extra=READ_ONLY, exclude_if=absent)


class MediaFileRef(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        validate_by_alias=True,
        validate_by_name=True,
        serialize_by_alias=True,
    )

    media_type: str = Field(
        validation_alias=MEDIA_KEY,
        serialization_alias=MEDIA_KEY,
        min_length=3,
        max_length=255,
        pattern=MEDIA_TYPE_PATTERN,
    )
    file: str = Field(min_length=1, max_length=MEDIA_FILE_LIMIT)
    name: str | None = Field(default=None, max_length=255, exclude_if=absent)

    @property
    def media_name(self) -> str:
        return self.name or PurePosixPath(self.file.replace("\\", "/")).name


class Image(MediaValue):
    media_type: str = Field(
        validation_alias="$media",
        serialization_alias="$media",
        max_length=255,
        pattern=r"^image/[a-z0-9.+-]+$",
    )


class Audio(MediaValue):
    media_type: str = Field(
        validation_alias="$media",
        serialization_alias="$media",
        max_length=255,
        pattern=r"^audio/[a-z0-9.+-]+$",
    )


class Video(MediaValue):
    media_type: str = Field(
        validation_alias="$media",
        serialization_alias="$media",
        max_length=255,
        pattern=r"^video/[a-z0-9.+-]+$",
    )


class Document(MediaValue):
    media_type: str = Field(
        validation_alias="$media",
        serialization_alias="$media",
        max_length=255,
        pattern=r"^(application|text)/[a-z0-9.+-]+$",
    )


class FieldSpec(BaseModel):
    model_config = DATA_CONFIG

    name: str = Field(pattern=NAME_PATTERN)
    type: str = Field(pattern=TYPE_REF_PATTERN)
    description: str = Field(min_length=1, max_length=300)
    max_length: int | None = Field(default=None, alias="maxLength", ge=1)
    max_items: int | None = Field(default=None, alias="maxItems", ge=1)
    minimum: int | float | None = None
    maximum: int | float | None = None
    pattern: str | None = Field(default=None, max_length=500)
    enum: list[str] | None = Field(default=None, min_length=1, max_length=FIELD_SPEC_MAX_ENUM)
    fields: list[FieldSpec] | None = None

    @model_validator(mode="after")
    def _check_shape(self) -> Self:
        type_id = self.type.removesuffix("?").removesuffix("[]")
        if type_id in FIELD_SPEC_FORBIDDEN_TYPES:
            raise ValueError(
                f"type {type_id} is not allowed in FieldSpec: media types, Dynamic and FieldSpec are forbidden"
            )
        if (type_id == RECORD_LABEL) != (self.fields is not None):
            raise ValueError("fields is set if and only if type is Record")
        copied = [key for key, value in self._item_constraints() if value is not None]
        if copied and type_id not in BUILTIN_TYPE_IDS and type_id != RECORD_LABEL:
            raise ValueError(
                f"type {type_id} comes from the registry: constraints are taken from it, do not set {', '.join(copied)}"
            )
        return self

    def _item_constraints(self) -> tuple[tuple[str, object], ...]:
        return (
            ("maxLength", self.max_length),
            ("pattern", self.pattern),
            ("enum", self.enum),
            ("minimum", self.minimum),
            ("maximum", self.maximum),
        )


class DynamicLimits(SpecModel):
    max_fields: int = Field(ge=1)
    max_depth: int = Field(ge=1, le=3)
    max_text_length: int = Field(ge=1)
    max_items: int = Field(ge=1)


class DynamicValue(BaseModel):
    model_config = DATA_CONFIG

    value: JsonValue
    fields: tuple[FieldSpec, ...]
    schema_hash: str = Field(pattern=BLOB_ID_PATTERN)


class MapItemError(BaseModel):
    model_config = DATA_CONFIG

    index: int = Field(ge=0)
    code: str = Field(max_length=64)
    message: str = Field(max_length=400)
