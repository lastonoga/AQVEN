import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Final

import pytest

from aqven.console.project_template import HELLO_TEMPLATE, TEMPLATES

AQVEN_PACKAGE: Final = Path(__file__).resolve().parents[2]
RUN_SECONDS: Final = 300
PACKAGE: Final = "hello_project"
MODULE: Final = PACKAGE


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
    workspace = tmp_path_factory.mktemp("hello")
    completed = run_python(
        workspace,
        "-m",
        "aqven",
        "new",
        "hello-project",
        "--template",
        HELLO_TEMPLATE,
        "--aqven-path",
        str(AQVEN_PACKAGE),
        "--no-sync",
    )
    assert completed.returncode == 0, completed.stderr
    return workspace / "hello-project"


def test_hello_template_is_registered() -> None:
    assert HELLO_TEMPLATE in TEMPLATES


def test_hello_template_checks_without_errors(created: Path) -> None:
    check = run_python(created, "-m", "aqven", "check", "--static", MODULE)
    assert check.returncode == 0, check.stdout + check.stderr
    assert "errors: 0," in check.stdout


def test_hello_template_runs_with_no_keys_set(created: Path) -> None:
    input_file = created / "input.json"
    input_file.write_text(json.dumps({"name": "Kir"}), encoding="utf-8")
    run = run_python(created, "-m", "aqven", "run", "hello", "--root", MODULE, "--input", "input.json")
    assert run.returncode == 0, run.stdout + run.stderr
    assert "run completed" in run.stdout
    assert "greet ok" in run.stdout
    assert "cost $0" in run.stdout
