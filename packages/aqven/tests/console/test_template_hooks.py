import json
import os
import subprocess
import sys
from collections.abc import Mapping
from pathlib import Path
from typing import Final

import pytest

from aqven.console.new import NewProjectRequest, create_project

PACKAGE: Final = "hook_shop"
MODULE: Final = PACKAGE
SETTINGS: Final = Path(".claude") / "settings.json"
HOOK: Final = Path(".claude") / "hooks" / "aqven_check.py"
FAKE_UV: Final = '#!/bin/sh\necho "$@" > "$RECORD"\necho \'errors: 1, warnings: 0\'\nexit 1\n'
RUN_SECONDS: Final = 60


@pytest.fixture(scope="module")
def project(tmp_path_factory: pytest.TempPathFactory) -> Path:
    target = tmp_path_factory.mktemp("hooks") / PACKAGE
    assert create_project(NewProjectRequest(target=target, sync=False)) == 0
    return target


@pytest.fixture(scope="module")
def fake_uv(tmp_path_factory: pytest.TempPathFactory) -> Path:
    folder = tmp_path_factory.mktemp("bin")
    script = folder / "uv"
    script.write_text(FAKE_UV, encoding="utf-8")
    script.chmod(0o755)
    return folder


def run_hook(project: Path, fake_uv: Path, event: Mapping[str, object], record: Path, static: bool) -> tuple[int, str]:
    environment = {
        **{key: value for key, value in os.environ.items() if key != "PYTHONPATH"},
        "PATH": f"{fake_uv}{os.pathsep}{os.environ.get('PATH', '')}",
        "CLAUDE_PROJECT_DIR": str(project),
        "RECORD": str(record),
    }
    command = (sys.executable, str(project / HOOK), *(("--static",) if static else ()))
    completed = subprocess.run(
        command,
        input=json.dumps(event),
        cwd=project,
        env=environment,
        capture_output=True,
        text=True,
        timeout=RUN_SECONDS,
        check=False,
    )
    return completed.returncode, completed.stderr


def test_settings_wire_both_hooks_to_the_script(project: Path) -> None:
    settings = json.loads((project / SETTINGS).read_text(encoding="utf-8"))["hooks"]
    [edits] = settings["PostToolUse"]
    [stop] = settings["Stop"]

    assert "Edit" in edits["matcher"]
    assert edits["hooks"][0]["command"].endswith('aqven_check.py" --static')
    assert "$CLAUDE_PROJECT_DIR/.claude/hooks/aqven_check.py" in stop["hooks"][0]["command"]
    assert stop["hooks"][0]["type"] == "command"


def test_hook_script_is_rendered_for_the_project_module(project: Path) -> None:
    text = (project / HOOK).read_text(encoding="utf-8")

    assert f'MODULE = "{MODULE}"' in text
    assert "__package__" not in text


def test_edit_inside_the_module_runs_the_static_check_and_blocks_on_errors(
    project: Path, fake_uv: Path, tmp_path: Path
) -> None:
    record = tmp_path / "edit.txt"
    event = {
        "hook_event_name": "PostToolUse",
        "tool_name": "Edit",
        "tool_input": {"file_path": str(project / MODULE / "agents" / "assistant.yaml")},
    }

    code, errors = run_hook(project, fake_uv, event, record, static=True)

    assert code == 2
    assert record.read_text(encoding="utf-8").split() == ["run", "aqven", "check", "--static", MODULE]
    assert "errors: 1" in errors
    assert "fix every error before you finish" in errors


def test_edit_outside_the_module_runs_nothing(project: Path, fake_uv: Path, tmp_path: Path) -> None:
    record = tmp_path / "outside.txt"
    event = {
        "hook_event_name": "PostToolUse",
        "tool_name": "Edit",
        "tool_input": {"file_path": str(project / "README.md")},
    }

    code, _ = run_hook(project, fake_uv, event, record, static=True)

    assert code == 0
    assert not record.exists()


def test_stop_runs_the_full_check_and_never_loops(project: Path, fake_uv: Path, tmp_path: Path) -> None:
    record = tmp_path / "stop.txt"

    blocked, errors = run_hook(project, fake_uv, {"hook_event_name": "Stop"}, record, static=False)
    called = record.read_text(encoding="utf-8").split()
    record.unlink()
    again, _ = run_hook(project, fake_uv, {"hook_event_name": "Stop", "stop_hook_active": True}, record, static=False)

    assert blocked == 2
    assert called == ["run", "aqven", "check", MODULE]
    assert "errors: 1" in errors
    assert again == 0
    assert not record.exists()
