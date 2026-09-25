import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Final

import pytest

from aqven.check import check_project
from aqven.write.model import ULID_PATTERN

REPO: Final = Path(__file__).resolve().parents[3]
DOCS: Final = REPO / "apps/site/src/content/docs"
PAGE: Final = DOCS / "engine/snippets.md"
QUOTING_PAGES: Final = (DOCS / "integrations/openrouter-model-selection.md", DOCS / "engine/image-preparation.md")
FIXTURE: Final = Path(__file__).parent / "fixtures" / "skill_snippets"
SCRIPTS: Final = "scripts/"
DATASET_BUILDER: Final = "scripts/build_listing_cases.py"
DATASET: Final = "datasets/listing_cases.yaml"
ULID_SCRIPT: Final = "scripts/new_ulid.py"
GENERATED: Final = frozenset({"types.py"})
UNTRACKED_PARTS: Final = frozenset({"__pycache__", ".aqven"})
TITLED_FENCE: Final = re.compile(
    r'^```(?P<language>[a-z]+) title="(?P<path>[^"]+)"\n(?P<body>.*?)^```$', re.MULTILINE | re.DOTALL
)


@dataclass(frozen=True, slots=True)
class Snippet:
    path: str
    body: str


def page_snippets(page: Path = PAGE) -> tuple[Snippet, ...]:
    text = page.read_text(encoding="utf-8")
    return tuple(Snippet(match["path"], match["body"]) for match in TITLED_FENCE.finditer(text))


def fixture_snippets(page: Path = PAGE) -> tuple[Snippet, ...]:
    return tuple(snippet for snippet in page_snippets(page) if not snippet.path.startswith(SCRIPTS))


def quoted_snippets() -> tuple[Snippet, ...]:
    return tuple(snippet for page in QUOTING_PAGES for snippet in fixture_snippets(page))


def script(path: str) -> Snippet:
    return next(snippet for snippet in page_snippets() if snippet.path == path)


def fixture_files() -> frozenset[str]:
    return frozenset(
        path.relative_to(FIXTURE).as_posix()
        for path in FIXTURE.rglob("*")
        if path.is_file()
        and not UNTRACKED_PARTS.intersection(path.relative_to(FIXTURE).parts)
        and path.name not in GENERATED
    )


def run_script(tmp_path: Path, snippet: Snippet, *arguments: str) -> str:
    file = tmp_path / Path(snippet.path).name
    file.write_text(snippet.body, encoding="utf-8")
    completed = subprocess.run(
        [sys.executable, str(file), *arguments], capture_output=True, text=True, check=True, timeout=60
    )
    return completed.stdout


@pytest.mark.parametrize("snippet", (*fixture_snippets(), *quoted_snippets()), ids=lambda snippet: snippet.path)
def test_snippet_matches_its_fixture_file(snippet: Snippet) -> None:
    assert (FIXTURE / snippet.path).read_text(encoding="utf-8") == snippet.body


def test_every_fixture_file_is_on_the_page() -> None:
    shown = [snippet.path for snippet in fixture_snippets()]
    assert len(shown) == len(set(shown))
    assert set(shown) == fixture_files()


def test_fixture_project_checks_clean() -> None:
    assert check_project(FIXTURE).diagnostics == ()


def test_dataset_builder_writes_the_fixture_dataset(tmp_path: Path) -> None:
    target = tmp_path / "listing_cases.yaml"
    run_script(tmp_path, script(DATASET_BUILDER), str(target))
    assert target.read_text(encoding="utf-8") == (FIXTURE / DATASET).read_text(encoding="utf-8")


def test_ulid_snippet_prints_a_client_op_id(tmp_path: Path) -> None:
    printed = run_script(tmp_path, script(ULID_SCRIPT)).strip()
    assert re.fullmatch(ULID_PATTERN, printed)
