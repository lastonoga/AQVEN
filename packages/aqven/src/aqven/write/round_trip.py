import io
from collections.abc import Callable, Iterator
from decimal import Decimal
from typing import Final, Protocol, cast

from ruamel.yaml import YAML
from ruamel.yaml.comments import CommentedMap
from ruamel.yaml.error import YAMLError
from ruamel.yaml.representer import RoundTripRepresenter

from aqven.spec import ProjectSpec, ResearchSettings

INT_TAG: Final = "tag:yaml.org,2002:int"
FLOAT_TAG: Final = "tag:yaml.org,2002:float"
FIXED_POINT: Final = "f"
DECIMAL_POINT: Final = "."
UNLIMITED_WIDTH: Final = 2**31 - 1
INDENT: Final = 2
RESEARCH_KEY: Final = "research"


class RoundTripYaml(Protocol):
    preserve_quotes: bool

    def load(self, stream: object) -> object: ...

    def dump(self, data: object, stream: object) -> None: ...


class YamlMapping(Protocol):
    def __contains__(self, key: object) -> bool: ...

    def __iter__(self) -> Iterator[object]: ...

    def __len__(self) -> int: ...

    def __setitem__(self, key: str, value: object) -> None: ...

    def get(self, key: str) -> object: ...

    def insert(self, pos: int, key: str, value: object) -> None: ...


class _ScalarRepresenter(Protocol):
    def represent_scalar(self, tag: str, value: str) -> object: ...


class _DecimalRegistry(Protocol):
    def add_representer(
        self, data_type: type, representer: Callable[[_ScalarRepresenter, Decimal], object]
    ) -> None: ...


class _Representer(RoundTripRepresenter):
    pass


class ProjectYamlInvalid(ValueError):
    def __init__(self, reason: str) -> None:
        super().__init__(f"aqven.yaml cannot be edited: {reason}")
        self.reason = reason


def _represent_decimal(representer: _ScalarRepresenter, data: Decimal) -> object:
    text = format(data, FIXED_POINT)
    return representer.represent_scalar(FLOAT_TAG if DECIMAL_POINT in text else INT_TAG, text)


cast("_DecimalRegistry", _Representer).add_representer(Decimal, _represent_decimal)


def round_trip_yaml() -> RoundTripYaml:
    yaml = YAML(typ="rt", pure=True)
    yaml.Representer = _Representer
    yaml.width = UNLIMITED_WIDTH
    yaml.indent(mapping=INDENT, sequence=INDENT, offset=0)
    typed = cast("RoundTripYaml", yaml)
    typed.preserve_quotes = True
    return typed


def keys_after(key: str) -> frozenset[str]:
    names = [info.alias or name for name, info in ProjectSpec.model_fields.items()]
    return frozenset(names[names.index(key) + 1 :])


def canonical_position(document: YamlMapping, key: str) -> int:
    later = keys_after(key)
    return next((index for index, present in enumerate(document) if present in later), len(document))


def put_in_order(document: YamlMapping, key: str, value: object) -> None:
    document.insert(canonical_position(document, key), key, value)


def yaml_mapping(value: object) -> YamlMapping | None:
    return cast("YamlMapping", value) if isinstance(value, CommentedMap) else None


def research_block(research: ResearchSettings) -> CommentedMap:
    return CommentedMap(research.model_dump(by_alias=True, exclude_none=True).items())


def place_research(document: YamlMapping, research: ResearchSettings) -> None:
    current = yaml_mapping(document.get(RESEARCH_KEY))
    if current is not None:
        for key, value in research.model_dump(by_alias=True, exclude_none=True).items():
            current[key] = value
        return
    if RESEARCH_KEY in document:
        document[RESEARCH_KEY] = research_block(research)
        return
    put_in_order(document, RESEARCH_KEY, research_block(research))


def project_mapping(yaml: RoundTripYaml, text: str) -> YamlMapping:
    try:
        document = yaml_mapping(yaml.load(text))
    except YAMLError as error:
        raise ProjectYamlInvalid(f"it does not parse as YAML: {error}") from error
    if document is None:
        raise ProjectYamlInvalid("its top level is not a mapping")
    return document


def with_research(text: str, research: ResearchSettings) -> str:
    yaml = round_trip_yaml()
    document = project_mapping(yaml, text)
    place_research(document, research)
    stream = io.StringIO()
    yaml.dump(document, stream)
    return stream.getvalue()
