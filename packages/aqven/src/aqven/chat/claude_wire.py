from collections.abc import AsyncIterator, Mapping
from typing import Final

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError

from aqven.runtime.address import JsonObject


class WireModel(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True, validate_by_alias=True, validate_by_name=True)


class OutputDetailsWire(WireModel):
    thinking_tokens: int = 0


class UsageWire(WireModel):
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_input_tokens: int | None = None
    cache_creation_input_tokens: int | None = None
    output_tokens_details: OutputDetailsWire | None = None

    @property
    def thinking_tokens(self) -> int:
        return 0 if self.output_tokens_details is None else self.output_tokens_details.thinking_tokens


class StreamMessageWire(WireModel):
    id: str
    usage: UsageWire | None = None


class BlockOpenWire(WireModel):
    type: str
    id: str | None = None
    name: str | None = None


class BlockDeltaWire(WireModel):
    type: str = ""
    text: str | None = None
    thinking: str | None = None
    partial_json: str | None = None


class StreamEventWire(WireModel):
    type: str
    index: int | None = None
    message: StreamMessageWire | None = None
    content_block: BlockOpenWire | None = None
    delta: BlockDeltaWire | None = None
    usage: UsageWire | None = None


class ContentItemWire(WireModel):
    type: str
    text: str | None = None


class BashInputWire(WireModel):
    command: str
    description: str | None = None


class EditInputWire(WireModel):
    file_path: str
    old_string: str
    new_string: str


class EditPairWire(WireModel):
    old_string: str
    new_string: str


class MultiEditInputWire(WireModel):
    file_path: str
    edits: tuple[EditPairWire, ...]


class WriteInputWire(WireModel):
    file_path: str
    content: str


class WriteResultWire(WireModel):
    type: str | None = None
    original_file: str | None = Field(default=None, alias="originalFile")


class AuthStatusWire(WireModel):
    logged_in: bool = Field(alias="loggedIn")
    auth_method: str | None = Field(default=None, alias="authMethod")
    email: str | None = None
    org_name: str | None = Field(default=None, alias="orgName")


STREAM_EVENT: Final[TypeAdapter[StreamEventWire]] = TypeAdapter(StreamEventWire)
NEXT_STEP_PRIORITY: Final[str] = "next"
CONTENT_ITEMS: Final[TypeAdapter[tuple[ContentItemWire, ...]]] = TypeAdapter(tuple[ContentItemWire, ...])
JSON_OBJECT: Final[TypeAdapter[JsonObject]] = TypeAdapter(JsonObject)


def json_object(value: Mapping[str, object]) -> JsonObject:
    try:
        return JSON_OBJECT.validate_python(dict(value))
    except ValidationError:
        return {}


def parse_wire[W: WireModel](model: type[W], value: object) -> W | None:
    try:
        return model.model_validate(value)
    except ValidationError:
        return None


def parse_wire_json[W: WireModel](model: type[W], raw: bytes) -> W | None:
    try:
        return model.model_validate_json(raw)
    except ValidationError:
        return None


def content_text(content: str | list[dict[str, object]] | None) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    try:
        items = CONTENT_ITEMS.validate_python(content)
    except ValidationError:
        return ""
    return "\n".join(item.text for item in items if item.text is not None)


def queued_user_frame(wire_id: str, text: str) -> JsonObject:
    return {
        "type": "user",
        "message": {"role": "user", "content": text},
        "parent_tool_use_id": None,
        "uuid": wire_id,
        "priority": NEXT_STEP_PRIORITY,
    }


async def single_frame(frame: JsonObject) -> AsyncIterator[JsonObject]:
    yield frame
