import os
import shutil
import subprocess
import sys
import tomllib
from pathlib import Path
from typing import Final

import pytest

from aqven.codegen import GENERATED_HEADER, GENERATED_TYPES
from aqven.console.project_template import SHOWCASE_TEMPLATE, TEMPLATE_SUFFIX, TEMPLATES

AQVEN_PACKAGE: Final = Path(__file__).resolve().parents[2]
REPO_ROOT: Final = AQVEN_PACKAGE.parents[1]
SYNC_SCRIPT: Final = REPO_ROOT / "scripts" / "sync_templates.py"
EXAMPLE_ROOT: Final = REPO_ROOT / "examples"
RUN_SECONDS: Final = 600
PACKAGE: Final = "media_shop"
MODULE: Final = PACKAGE
TOKENS: Final = ("__package__", "__project__", "__aqven_requirement__", "__uv_sources__")
TEXT_SUFFIXES: Final = frozenset({".py", ".yaml", ".md", ".json", ".toml", ".example", ".gitignore"})
COPY_IGNORED: Final = ("__pycache__", ".aqven", "cassettes", "*.pyc")


def run_python(cwd: Path, *arguments: str) -> subprocess.CompletedProcess[str]:
    environment = {key: value for key, value in os.environ.items() if key != "PYTHONPATH"}
    return subprocess.run(
        (sys.executable, *arguments),
        cwd=cwd,
        env={**environment, "PYDANTIC_AI_NO_BANNER": "1"},
        capture_output=True,
        text=True,
        timeout=RUN_SECONDS,
        check=False,
    )


@pytest.fixture(scope="module")
def created(tmp_path_factory: pytest.TempPathFactory) -> Path:
    workspace = tmp_path_factory.mktemp("showcase")
    completed = run_python(
        workspace,
        "-m",
        "aqven",
        "new",
        "media-shop",
        "--template",
        SHOWCASE_TEMPLATE,
        "--aqven-path",
        str(AQVEN_PACKAGE),
        "--no-sync",
        "--with-tests",
    )
    assert completed.returncode == 0, completed.stderr
    return workspace / "media-shop"


def test_showcase_template_is_registered() -> None:
    assert SHOWCASE_TEMPLATE in TEMPLATES
    assert TEMPLATES[SHOWCASE_TEMPLATE].name == SHOWCASE_TEMPLATE


def test_showcase_project_has_the_example_layout(created: Path) -> None:
    expected = (
        ".gitignore",
        ".mcp.json",
        "AGENTS.md",
        "CLAUDE.md",
        ".claude/settings.json",
        ".claude/hooks/aqven_check.py",
        "pyproject.toml",
        "tests/conftest.py",
        "tests/support.py",
        f"{MODULE}/app.py",
        f"{MODULE}/__main__.py",
        f"{MODULE}/samples/case_request.json",
        f"{MODULE}/samples/flow_strip_controller.jpg",
        f"{MODULE}/aqven.yaml",
        f"{MODULE}/.env.example",
        f"{MODULE}/flows/support_case/flow.yaml",
        f"{MODULE}/flows/judge_panel/flow.yaml",
        f"{MODULE}/{GENERATED_TYPES}",
    )

    assert [path for path in expected if not (created / path).is_file()] == []
    assert not (created / "tests" / "cassettes").exists()
    assert not (created / "tests" / "test_support_case.py").exists()
    assert (created / MODULE / GENERATED_TYPES).read_text(encoding="utf-8").splitlines()[0] == GENERATED_HEADER


def test_showcase_project_keeps_no_template_tokens(created: Path) -> None:
    written = [path for path in created.rglob("*") if path.is_file() and "__pycache__" not in path.parts]
    texts = [path for path in written if path.suffix in TEXT_SUFFIXES or path.name.startswith(".")]

    assert [path for path in written if path.suffix == TEMPLATE_SUFFIX] == []
    assert [path for path in texts if any(token in path.read_text(encoding="utf-8") for token in TOKENS)] == []
    assert (created / MODULE / "samples" / "flow_strip_controller.jpg").read_bytes()[:2] == b"\xff\xd8"


def test_showcase_project_renames_the_package_everywhere(created: Path) -> None:
    manifest = tomllib.loads((created / "pyproject.toml").read_text(encoding="utf-8"))
    project_file = (created / MODULE / "aqven.yaml").read_text(encoding="utf-8")
    main_module = (created / MODULE / "app.py").read_text(encoding="utf-8")

    assert manifest["project"]["name"] == "media-shop"
    assert manifest["tool"]["pytest"]["ini_options"]["aqven_project"] == MODULE
    assert f'package: "{PACKAGE}"' in project_file
    assert f"from {PACKAGE}.types import" in main_module
    assert "lumen" not in main_module


def test_showcase_project_checks_without_errors(created: Path) -> None:
    check = run_python(created, "-m", "aqven", "check", "--static", MODULE)

    assert check.returncode == 0, check.stdout + check.stderr
    assert "errors: 0," in check.stdout


def test_showcase_project_imports_its_generated_models(created: Path) -> None:
    probe = f"from {PACKAGE}.types import CaseOutcome, CaseRequest; print(CaseRequest.__name__, CaseOutcome.__name__)"

    completed = run_python(created, "-c", f"import sys; sys.path.insert(0, '.'); {probe}")

    assert completed.returncode == 0, completed.stderr
    assert completed.stdout.split() == ["CaseRequest", "CaseOutcome"]


@pytest.mark.skipif(not SYNC_SCRIPT.is_file(), reason="the repository layout with scripts/ is not available")
def test_template_stays_in_sync_with_the_example() -> None:
    completed = run_python(REPO_ROOT, str(SYNC_SCRIPT), "--check")

    assert completed.returncode == 0, completed.stdout + completed.stderr
    assert "in sync" in completed.stdout


@pytest.mark.skipif(not SYNC_SCRIPT.is_file(), reason="the repository layout with scripts/ is not available")
def test_sync_reports_an_example_change_that_is_not_in_the_template(tmp_path: Path) -> None:
    example = tmp_path / "showcase"
    templates = tmp_path / "templates"
    shutil.copytree(EXAMPLE_ROOT, example, ignore=shutil.ignore_patterns(*COPY_IGNORED))
    shutil.copytree(AQVEN_PACKAGE / "src" / "aqven" / "templates", templates)
    edited = example / "lumen" / "app.py"
    edited.write_text(edited.read_text(encoding="utf-8") + "\nSTUDIO_HINT = 1\n", encoding="utf-8")

    checked = run_python(
        REPO_ROOT, str(SYNC_SCRIPT), "--check", "--example", str(example), "--templates", str(templates)
    )
    written = run_python(REPO_ROOT, str(SYNC_SCRIPT), "--example", str(example), "--templates", str(templates))
    repaired = run_python(
        REPO_ROOT, str(SYNC_SCRIPT), "--check", "--example", str(example), "--templates", str(templates)
    )

    assert checked.returncode == 1
    assert "changed: __package__/app.py.tmpl" in checked.stderr
    assert written.returncode == 0
    assert repaired.returncode == 0
