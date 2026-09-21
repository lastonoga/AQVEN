import re
from dataclasses import dataclass
from typing import Annotated, Literal, Self, cast

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    SerializerFunctionWrapHandler,
    StringConstraints,
    model_serializer,
    model_validator,
)

from aqven.runtime.address import ExecutionAddress, JsonObject, RequestModel


class DisplayModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


type DisplayTone = Literal["neutral", "positive", "warning", "critical"]
type DisplaySide = Literal["input", "output"]
type DisplayStatus = Literal["formatted", "unavailable", "error"]
JSON_POINTER_PATTERN = r"^(?:|/(?:[^~/]|~[01])*(?:/(?:[^~/]|~[01])*)*)$"
type JsonPointer = Annotated[str, StringConstraints(pattern=JSON_POINTER_PATTERN)]
type ScalarValue = str | int | float | bool | None


class DisplayScalar(DisplayModel):
    value: ScalarValue = None
    path: JsonPointer | None = None
    represented_paths: tuple[JsonPointer, ...] = ()
    tone: DisplayTone = "neutral"

    @model_validator(mode="before")
    @classmethod
    def one_source(cls, value: object) -> object:
        if isinstance(value, dict) and ("value" in value) == ("path" in value):
            raise ValueError("exactly one of value and path is required")
        return cast(object, value)

    @model_validator(mode="after")
    def path_or_value(self) -> Self:
        if self.path is not None and self.represented_paths:
            raise ValueError("represented_paths is for literal values only")
        return self

    @model_serializer(mode="wrap")
    def serialize_source(self, handler: SerializerFunctionWrapHandler) -> dict[str, object]:
        payload = cast(dict[str, object], handler(self))
        payload.pop("value" if self.path is not None else "path", None)
        return payload


class DisplayText(DisplayScalar):
    kind: Literal["text"] = "text"


class DisplayField(DisplayScalar):
    kind: Literal["field"] = "field"
    label: str = Field(min_length=1)


class DisplayBadge(DisplayScalar):
    kind: Literal["badge"] = "badge"


class DisplayMedia(DisplayModel):
    kind: Literal["media"] = "media"
    path: JsonPointer
    alt: str | None = None


class DisplayList(DisplayModel):
    kind: Literal["list"] = "list"
    title: str | None = None
    children: tuple[DisplayElement, ...] = ()


class DisplayCard(DisplayModel):
    kind: Literal["card"] = "card"
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
    description: str | None = None
    tone: DisplayTone = "neutral"
    children: tuple[DisplayElement, ...] = ()


class DisplaySection(DisplayModel):
    kind: Literal["section"] = "section"
    title: str | None = None
    children: tuple[DisplayElement, ...] = ()


type DisplayElement = Annotated[
    DisplaySection | DisplayText | DisplayField | DisplayList | DisplayCard | DisplayBadge | DisplayMedia,
    Field(discriminator="kind"),
]

DisplaySection.model_rebuild()
DisplayList.model_rebuild()
DisplayCard.model_rebuild()


class DisplayDocument(DisplayModel):
    version: Literal[1] = 1
    root: DisplaySection


@dataclass(frozen=True, slots=True)
class PresentationContext:
    side: DisplaySide
    input: JsonValue
    output: JsonValue
    variables: JsonObject
    variants: dict[str, str]
    model: str | None
    inference_id: str
    address: ExecutionAddress
    locale: str


class PresentationTarget(RequestModel):
    address: ExecutionAddress
    side: DisplaySide


class PresentationRequest(RequestModel):
    locale: Annotated[str, Field(min_length=1)]
    targets: Annotated[tuple[PresentationTarget, ...], Field(min_length=1, max_length=100)]


class PresentationResult(DisplayModel):
    target: PresentationTarget
    status: DisplayStatus
    document: DisplayDocument | None = None
    formatter: str | None = None
    formatter_version: str | None = None
    error: str | None = None


class PresentationResponse(DisplayModel):
    results: tuple[PresentationResult, ...]


def pointer_value(value: JsonValue, path: str) -> JsonValue:
    """Read a JSON Pointer from a recorded value, preserving missing versus null."""
    if re.fullmatch(JSON_POINTER_PATTERN, path) is None:
        raise KeyError(path)
    if path == "":
        return value
    current = value
    for encoded in path[1:].split("/"):
        segment = encoded.replace("~1", "/").replace("~0", "~")
        if isinstance(current, dict) and segment in current:
            current = current[segment]
        elif isinstance(current, list) and segment.isascii() and segment.isdecimal() and str(int(segment)) == segment:
            index = int(segment)
            if index >= len(current):
                raise KeyError(path)
            current = current[index]
        else:
            raise KeyError(path)
    return current
