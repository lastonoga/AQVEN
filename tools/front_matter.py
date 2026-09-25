from collections.abc import Mapping
from dataclasses import dataclass
from typing import Final, Protocol, cast

from pydantic import JsonValue, TypeAdapter, ValidationError
from ruamel.yaml import YAML
from ruamel.yaml.error import YAMLError

FENCE: Final = "---"
MAPPING: Final = TypeAdapter(dict[str, JsonValue])


class _SafeLoader(Protocol):
    def load(self, stream: str) -> object: ...


class FrontMatterError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class Document:
    front_matter: Mapping[str, JsonValue]
    body: str


def parse_yaml_mapping(text: str) -> dict[str, JsonValue]:
    try:
        loaded = cast(_SafeLoader, YAML(typ="safe", pure=True)).load(text)
    except YAMLError as error:
        raise FrontMatterError(f"invalid YAML: {error}") from error
    try:
        return MAPPING.validate_python(loaded if loaded is not None else {})
    except ValidationError as error:
        raise FrontMatterError("YAML is not a mapping of names to values") from error


def split_document(text: str) -> Document:
    lines = text.split("\n")
    if not lines or lines[0].rstrip() != FENCE:
        raise FrontMatterError("no front matter: the first line must be ---")
    closing = next((index for index, line in enumerate(lines[1:], start=1) if line.rstrip() == FENCE), None)
    if closing is None:
        raise FrontMatterError("front matter is not closed with ---")
    front_matter = parse_yaml_mapping("\n".join(lines[1:closing]))
    return Document(front_matter, "\n".join(lines[closing + 1 :]))


def text_field(document: Document, key: str) -> str | None:
    value = document.front_matter.get(key)
    return value if isinstance(value, str) else None
