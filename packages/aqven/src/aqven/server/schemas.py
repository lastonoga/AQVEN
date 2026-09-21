from collections.abc import Mapping
from functools import cache
from pathlib import Path
from typing import Final, get_args

from pydantic import BaseModel, Field, TypeAdapter

from aqven.ports.chat import ChatEvent
from aqven.runtime.address import JsonObject, ResourceModel
from aqven.runtime.events import RunEvent
from aqven.server.spec_channel import SpecEvent
from aqven.spec import SCHEMA_DIALECT, NodeSpec, SpecKind, TypeSpec, editor_schema, schema_path

JSON_OBJECT: Final[TypeAdapter[JsonObject]] = TypeAdapter(JsonObject)
EVENT_TAG: Final = "type"
NODE_TAG: Final = "node"
TYPE_TAG: Final = "type"
CHANNEL_ANCHOR: Final = (
    "Empty at runtime: the array exists so the generated client can name the channel union. "
    "The JSON Schema of every event lives in schemas."
)

VARIANT_UNIONS: Final[Mapping[SpecKind, tuple[object, str]]] = {
    SpecKind.NODE: (NodeSpec.__value__, NODE_TAG),
    SpecKind.TYPE: (TypeSpec.__value__, TYPE_TAG),
}


class EventSchemas(ResourceModel):
    dialect: str
    spec: dict[str, JsonObject]
    run: dict[str, JsonObject]
    chat: dict[str, JsonObject]


class EventCatalog(ResourceModel):
    spec: list[SpecEvent] = Field(description=CHANNEL_ANCHOR)
    run: list[RunEvent] = Field(description=CHANNEL_ANCHOR)
    chat: list[ChatEvent] = Field(description=CHANNEL_ANCHOR)
    schemas: EventSchemas


class SpecSchema(ResourceModel):
    kind: SpecKind
    path: str
    json_schema: JsonObject
    variants: dict[str, JsonObject]


class SpecSchemaCatalog(ResourceModel):
    dialect: str
    schemas: tuple[SpecSchema, ...]


def union_models(annotated: object) -> tuple[type[BaseModel], ...]:
    members: tuple[object, ...] = get_args(get_args(annotated)[0])
    return tuple(item for item in members if isinstance(item, type) and issubclass(item, BaseModel))


def tag_value(model: type[BaseModel], tag: str) -> str:
    values: tuple[object, ...] = get_args(model.model_fields[tag].annotation)
    return str(values[0])


def model_schema(model: type[BaseModel]) -> JsonObject:
    body = JSON_OBJECT.validate_python(model.model_json_schema(by_alias=True))
    return {"$schema": SCHEMA_DIALECT, **body}


def tagged_schemas(annotated: object, tag: str) -> dict[str, JsonObject]:
    return {tag_value(model, tag): model_schema(model) for model in union_models(annotated)}


@cache
def event_schemas() -> EventSchemas:
    return EventSchemas(
        dialect=SCHEMA_DIALECT,
        spec=tagged_schemas(SpecEvent.__value__, EVENT_TAG),
        run=tagged_schemas(RunEvent.__value__, EVENT_TAG),
        chat=tagged_schemas(ChatEvent.__value__, EVENT_TAG),
    )


@cache
def event_catalog() -> EventCatalog:
    return EventCatalog(spec=[], run=[], chat=[], schemas=event_schemas())


def spec_variants(kind: SpecKind) -> dict[str, JsonObject]:
    union = VARIANT_UNIONS.get(kind)
    return {} if union is None else tagged_schemas(*union)


@cache
def spec_schema(kind: SpecKind) -> SpecSchema:
    return SpecSchema(
        kind=kind,
        path=schema_path(Path(), kind).as_posix(),
        json_schema=editor_schema(kind),
        variants=spec_variants(kind),
    )


@cache
def spec_schema_catalog() -> SpecSchemaCatalog:
    return SpecSchemaCatalog(dialect=SCHEMA_DIALECT, schemas=tuple(spec_schema(kind) for kind in SpecKind))
