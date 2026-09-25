import argparse
import re
import sys
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Protocol, cast

from mcp_tools import EVALS, AnyOperation, operations
from pydantic import BaseModel, JsonValue, TypeAdapter, ValidationError
from ruamel.yaml import YAML
from ruamel.yaml.error import YAMLError

from aqven.server.errors import ApiError

MOCKS_FOLDER: Final = "mocks"
SERVER_NAME: Final = "aqven"
SERVER_RESPONDER: Final = "_server.md"
FENCE: Final = "---"
INPUT_TOKEN: Final = re.compile(r"\{\{\s*input\.([A-Za-z0-9_]+)\s*\}\}")
MOCK_KEYS: Final = frozenset({"type", "expect", "error", "tools", "abort_when"})
FIXED: Final = "fixed"
AGENT: Final = "agent"
MAPPING: Final = TypeAdapter(dict[str, JsonValue])
SKIPPED_PARTS: Final = frozenset({"results", "__pycache__"})
EXIT_OK: Final = 0
EXIT_FAILED: Final = 1


class SafeLoader(Protocol):
    def load(self, stream: str) -> object: ...


class MockError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class Mock:
    path: Path
    tool: str
    front_matter: Mapping[str, JsonValue]
    body: str

    @property
    def kind(self) -> JsonValue:
        return self.front_matter.get("type", FIXED)

    @property
    def expect(self) -> Mapping[str, JsonValue]:
        value = self.front_matter.get("expect")
        return value if isinstance(value, dict) else {}

    @property
    def is_error(self) -> bool:
        return self.front_matter.get("error") is True


def yaml_mapping(text: str, path: Path) -> dict[str, JsonValue]:
    try:
        loaded = cast(SafeLoader, YAML(typ="safe", pure=True)).load(text)
    except YAMLError as error:
        raise MockError(f"{path}: invalid front matter: {error}") from error
    try:
        return MAPPING.validate_python(loaded if loaded is not None else {})
    except ValidationError as error:
        raise MockError(f"{path}: front matter is not a mapping") from error


def read_mock(path: Path) -> Mock:
    text = path.read_text(encoding="utf-8")
    lines = text.split("\n")
    if not lines or lines[0].rstrip() != FENCE:
        return Mock(path, path.stem, {}, text)
    closing = next((index for index, line in enumerate(lines[1:], start=1) if line.rstrip() == FENCE), None)
    if closing is None:
        raise MockError(f"{path}: front matter is not closed with ---")
    front_matter = yaml_mapping("\n".join(lines[1:closing]), path)
    return Mock(path, path.stem, front_matter, "\n".join(lines[closing + 1 :]))


def mock_files(root: Path) -> Iterator[Path]:
    for path in sorted(root.rglob(f"{MOCKS_FOLDER}/*/*.md")):
        relative = path.relative_to(root)
        if SKIPPED_PARTS.intersection(relative.parts) or path.name == SERVER_RESPONDER:
            continue
        yield path


def filled_body(mock: Mock) -> str:
    def value(match: re.Match[str]) -> str:
        expected = mock.expect.get(match.group(1))
        return expected if isinstance(expected, str) else "0"

    return INPUT_TOKEN.sub(value, mock.body).strip()


def validated(model: type[BaseModel], mock: Mock) -> list[str]:
    try:
        model.model_validate_json(filled_body(mock))
    except ValidationError as error:
        first = error.errors(include_url=False)[:3]
        return [f"{mock.path}: body is not a {model.__name__}: {first}"]
    return []


def unknown_keys(mock: Mock) -> list[str]:
    extra = sorted(set(mock.front_matter) - MOCK_KEYS)
    return [f"{mock.path}: unknown front matter keys {extra}"] if extra else []


def unknown_inputs(mock: Mock, operation: AnyOperation) -> list[str]:
    fields = set(operation.input_model.model_fields)
    named = set(mock.expect) | set(INPUT_TOKEN.findall(mock.body))
    stray = sorted(named - fields)
    return [f"{mock.path}: {stray} are not arguments of {mock.tool}"] if stray else []


def problems_of(mock: Mock, catalog: Mapping[str, AnyOperation]) -> list[str]:
    if mock.path.parent.name != SERVER_NAME:
        return [f"{mock.path}: the plugin declares only the {SERVER_NAME} server"]
    operation = catalog.get(mock.tool)
    if operation is None:
        return [f"{mock.path}: {mock.tool} is not a tool of the {SERVER_NAME} server"]
    found = [*unknown_keys(mock), *unknown_inputs(mock, operation)]
    if mock.kind == AGENT:
        return found
    model: type[BaseModel] = ApiError if mock.is_error else operation.output_model
    return [*found, *validated(model, mock)]


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="check every fixed mock body against the real tool output model")
    parser.add_argument("--evals", default=str(EVALS), help="folder with cases and mocks")
    arguments = parser.parse_args(argv)
    catalog = operations()
    checked = 0
    problems: list[str] = []
    try:
        for path in mock_files(Path(arguments.evals).resolve()):
            problems.extend(problems_of(read_mock(path), catalog))
            checked += 1
    except MockError as error:
        problems.append(str(error))
    if problems:
        print("\n".join(problems), file=sys.stderr)
        return EXIT_FAILED
    print(f"mocks: {checked} responders match the {SERVER_NAME} tools")
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
