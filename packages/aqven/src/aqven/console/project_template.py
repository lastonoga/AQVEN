from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from importlib.resources import files
from importlib.resources.abc import Traversable
from pathlib import PurePosixPath
from typing import Final, Protocol

TEMPLATE_PACKAGE: Final = "aqven"
TEMPLATES_FOLDER: Final = "templates"
TEMPLATE_SUFFIX: Final = ".tmpl"
DOT_PREFIX: Final = "dot-"
HIDDEN_PREFIX: Final = "."
TEMPLATE_ENCODING: Final = "utf-8"
PACKAGE_TOKEN: Final = "__package__"
PROJECT_TOKEN: Final = "__project__"
AQVEN_REQUIREMENT_TOKEN: Final = "__aqven_requirement__"
UV_SOURCES_TOKEN: Final = "__uv_sources__\n"
MINIMAL_TEMPLATE: Final = "minimal"
SHOWCASE_TEMPLATE: Final = "showcase"
HELLO_TEMPLATE: Final = "hello"
BINARY_SUFFIXES: Final = frozenset({".jpg", ".jpeg", ".png", ".pdf", ".mp4", ".wav", ".ico"})
MODULE_ROOT: Final = PACKAGE_TOKEN
TESTS_FOLDER: Final = "tests"


@dataclass(frozen=True, slots=True)
class TemplateValues:
    package: str
    project: str
    aqven_requirement: str
    uv_sources: str
    with_tests: bool = False

    def tokens(self) -> Mapping[str, str]:
        return {
            UV_SOURCES_TOKEN: self.uv_sources,
            AQVEN_REQUIREMENT_TOKEN: self.aqven_requirement,
            PACKAGE_TOKEN: self.package,
            PROJECT_TOKEN: self.project,
        }


@dataclass(frozen=True, slots=True)
class RenderedFile:
    path: PurePosixPath
    content: str | bytes


@dataclass(frozen=True, slots=True)
class RenderedProject:
    files: tuple[RenderedFile, ...]
    module_root: PurePosixPath


class ProjectTemplate(Protocol):
    @property
    def name(self) -> str: ...

    @property
    def description(self) -> str: ...

    def render(self, values: TemplateValues) -> RenderedProject: ...


def substituted(text: str, tokens: Mapping[str, str]) -> str:
    for token, value in tokens.items():
        text = text.replace(token, value)
    return text


def output_name(name: str, tokens: Mapping[str, str]) -> str:
    plain = name.removesuffix(TEMPLATE_SUFFIX)
    visible = HIDDEN_PREFIX + plain.removeprefix(DOT_PREFIX) if plain.startswith(DOT_PREFIX) else plain
    return substituted(visible, tokens)


def template_files(folder: Traversable, prefix: PurePosixPath) -> Iterator[tuple[PurePosixPath, Traversable]]:
    for entry in sorted(folder.iterdir(), key=lambda item: item.name):
        path = prefix / entry.name
        if entry.is_dir():
            yield from template_files(entry, path)
            continue
        if entry.name.endswith(TEMPLATE_SUFFIX):
            yield path, entry


def rendered_path(relative: PurePosixPath, tokens: Mapping[str, str]) -> PurePosixPath:
    return PurePosixPath(*(output_name(part, tokens) for part in relative.parts))


def rendered_content(path: PurePosixPath, source: Traversable, tokens: Mapping[str, str]) -> str | bytes:
    if path.suffix in BINARY_SUFFIXES:
        return source.read_bytes()
    return substituted(source.read_text(TEMPLATE_ENCODING), tokens)


def template_folder(name: str) -> Traversable:
    return files(TEMPLATE_PACKAGE).joinpath(TEMPLATES_FOLDER, name)


def in_tests(relative: PurePosixPath) -> bool:
    return relative.parts[0] == TESTS_FOLDER


@dataclass(frozen=True, slots=True)
class PackageDataTemplate:
    name: str
    description: str
    module_root: str = MODULE_ROOT

    def render(self, values: TemplateValues) -> RenderedProject:
        tokens = values.tokens()
        rendered = tuple(
            self._file(rendered_path(relative, tokens), source, tokens)
            for relative, source in template_files(template_folder(self.name), PurePosixPath())
            if values.with_tests or not in_tests(relative)
        )
        return RenderedProject(files=rendered, module_root=PurePosixPath(substituted(self.module_root, tokens)))

    def _file(self, path: PurePosixPath, source: Traversable, tokens: Mapping[str, str]) -> RenderedFile:
        return RenderedFile(path, rendered_content(path, source, tokens))


TEMPLATES: Final[Mapping[str, ProjectTemplate]] = {
    MINIMAL_TEMPLATE: PackageDataTemplate(
        name=MINIMAL_TEMPLATE,
        description="one flow with a code step, an llm step on OpenRouter, a tool, types and an offline test",
    ),
    SHOWCASE_TEMPLATE: PackageDataTemplate(
        name=SHOWCASE_TEMPLATE,
        description="the lumen example: two flows with every node kind, human waits, tools, experiments and main.py",
    ),
    HELLO_TEMPLATE: PackageDataTemplate(
        name=HELLO_TEMPLATE,
        description="one code step, no model calls — runs immediately, a placeholder for your real workflow",
    ),
}
