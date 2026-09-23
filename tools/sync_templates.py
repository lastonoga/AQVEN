import argparse
import re
import sys
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Final

REPO_ROOT: Final = Path(__file__).resolve().parents[1]
EXAMPLE_ROOT: Final = REPO_ROOT / "examples"
TEMPLATES_ROOT: Final = REPO_ROOT / "packages" / "aqven" / "src" / "aqven" / "templates"
SHOWCASE_TEMPLATE: Final = "showcase"
EXAMPLE_PACKAGE: Final = "lumen"
PACKAGE_TOKEN: Final = "__package__"
TEMPLATE_SUFFIX: Final = ".tmpl"
DOT_PREFIX: Final = "dot-"
HIDDEN_PREFIX: Final = "."
ENCODING: Final = "utf-8"
PACKAGE_PATTERN: Final = re.compile(rf"\b{EXAMPLE_PACKAGE}\b")
SOURCES: Final = (
    ".mcp.json",
    ".gitignore",
    "CLAUDE.md",
    "AGENTS.md",
    ".claude",
    EXAMPLE_PACKAGE,
    "tests",
)
SKIPPED_PARTS: Final = frozenset({".aqven", "__pycache__", ".ruff_cache", "cassettes", ".pytest_cache"})
SKIPPED_FILES: Final = frozenset(
    {
        f"{EXAMPLE_PACKAGE}/types.py",
        "tests/test_support_case.py",
        "tests/test_experiment_coverage.py",
        ".env",
        f"{EXAMPLE_PACKAGE}/.env",
    }
)
SKIPPED_SUFFIXES: Final = frozenset({".pyc", ".sqlite"})
BINARY_SUFFIXES: Final = frozenset({".jpg", ".jpeg", ".png", ".pdf", ".mp4", ".wav", ".ico"})
KEPT_TEMPLATE_FILES: Final = frozenset({"pyproject.toml.tmpl"})
IN_SYNC: Final = "templates: in sync"
OUT_OF_SYNC: Final = "templates: out of sync; run python tools/sync_templates.py"


@dataclass(frozen=True, slots=True)
class TemplateFile:
    path: PurePosixPath
    content: bytes


def skipped(relative: PurePosixPath) -> bool:
    if relative.as_posix() in SKIPPED_FILES or relative.suffix in SKIPPED_SUFFIXES:
        return True
    return bool(SKIPPED_PARTS.intersection(relative.parts))


def example_files(root: Path, sources: Sequence[str]) -> Iterator[Path]:
    for name in sources:
        entry = root / name
        if entry.is_file():
            yield entry
            continue
        yield from (found for found in sorted(entry.rglob("*")) if found.is_file())


def visible_name(name: str) -> str:
    plain = name.removeprefix(HIDDEN_PREFIX)
    return f"{DOT_PREFIX}{plain}" if plain != name else name


def template_name(name: str) -> str:
    return f"{visible_name(name)}{TEMPLATE_SUFFIX}"


def template_path(relative: PurePosixPath) -> PurePosixPath:
    parts = tuple(PACKAGE_PATTERN.sub(PACKAGE_TOKEN, part) for part in relative.parts)
    folders = tuple(visible_name(part) for part in parts[:-1])
    return PurePosixPath(*folders, template_name(parts[-1]))


def rendered_bytes(source: Path) -> bytes:
    if source.suffix in BINARY_SUFFIXES:
        return source.read_bytes()
    return PACKAGE_PATTERN.sub(PACKAGE_TOKEN, source.read_text(encoding=ENCODING)).encode(ENCODING)


def showcase_files(root: Path = EXAMPLE_ROOT) -> tuple[TemplateFile, ...]:
    found: list[TemplateFile] = []
    for source in example_files(root, SOURCES):
        relative = PurePosixPath(source.relative_to(root).as_posix())
        if skipped(relative):
            continue
        found.append(TemplateFile(template_path(relative), rendered_bytes(source)))
    return tuple(sorted(found, key=lambda file: file.path.as_posix()))


def current_files(target: Path) -> Mapping[str, bytes]:
    if not target.is_dir():
        return {}
    files = (path for path in sorted(target.rglob("*")) if path.is_file())
    return {
        path.relative_to(target).as_posix(): path.read_bytes() for path in files if path.name not in KEPT_TEMPLATE_FILES
    }


def expected_files(files: Sequence[TemplateFile]) -> Mapping[str, bytes]:
    return {file.path.as_posix(): file.content for file in files}


def differences(target: Path, files: Sequence[TemplateFile]) -> tuple[str, ...]:
    current = current_files(target)
    expected = expected_files(files)
    missing = tuple(f"missing: {name}" for name in sorted(set(expected) - set(current)))
    extra = tuple(f"extra: {name}" for name in sorted(set(current) - set(expected)))
    changed = tuple(
        f"changed: {name}" for name in sorted(set(current) & set(expected)) if current[name] != expected[name]
    )
    return missing + extra + changed


def write_template(target: Path, files: Sequence[TemplateFile]) -> None:
    for name in current_files(target):
        (target / name).unlink()
    for file in files:
        destination = target / file.path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(file.content)
    prune_empty(target)


def prune_empty(target: Path) -> None:
    for folder in sorted((path for path in target.rglob("*") if path.is_dir()), reverse=True):
        if not any(folder.iterdir()):
            folder.rmdir()


def sync(check: bool, root: Path = EXAMPLE_ROOT, templates: Path = TEMPLATES_ROOT) -> int:
    target = templates / SHOWCASE_TEMPLATE
    files = showcase_files(root)
    problems = differences(target, files)
    if not problems:
        print(IN_SYNC)
        return 0
    if check:
        print(OUT_OF_SYNC, *problems, sep="\n", file=sys.stderr)
        return 1
    write_template(target, files)
    print(f"{SHOWCASE_TEMPLATE}: {len(files)} files written")
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="sync_templates", description="build aqven project templates from examples")
    parser.add_argument("--check", action="store_true", help="report differences instead of writing the template")
    parser.add_argument("--example", type=Path, default=EXAMPLE_ROOT, help="example project folder")
    parser.add_argument("--templates", type=Path, default=TEMPLATES_ROOT, help="folder that holds the templates")
    arguments = parser.parse_args(argv)
    return sync(bool(arguments.check), Path(str(arguments.example)), Path(str(arguments.templates)))


if __name__ == "__main__":
    sys.exit(main())
