import contextlib
import io
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Final

import pytest
from agent_settings import SettingsWire
from pydantic import JsonValue, TypeAdapter

from aqven.agent_files import sync_agent_files
from aqven.chat.hook_rules import COMPACTED
from aqven.console.hook import CliWording, run_hook

PACKAGE: Final = "shop"
PROJECT_FILE: Final = 'apiVersion: "aqven/v1"\nkind: "Project"\npackage: "shop"\n'
RUN_SECONDS: Final = 120
JSON_OBJECT: Final[TypeAdapter[dict[str, JsonValue]]] = TypeAdapter(dict[str, JsonValue])


@pytest.fixture
def workspace(tmp_path: Path) -> Path:
    (tmp_path / "pyproject.toml").write_text('[project]\nname = "shop"\n', encoding="utf-8")
    (tmp_path / PACKAGE).mkdir()
    (tmp_path / PACKAGE / "aqven.yaml").write_text(PROJECT_FILE, encoding="utf-8")
    return tmp_path.resolve()


def flow_write(workspace: Path, session: str) -> dict[str, JsonValue]:
    target = workspace / PACKAGE / "flows" / "intake" / "flow.yaml"
    return {
        "hook_event_name": "PreToolUse",
        "session_id": session,
        "tool_name": "Write",
        "tool_input": {"file_path": str(target), "content": 'kind: "Flow"\n'},
        "tool_use_id": f"{session}-write",
    }


def answer(name: str, path: Path, event: dict[str, JsonValue]) -> tuple[int, str, str]:
    out = io.StringIO()
    error = io.StringIO()
    with contextlib.redirect_stderr(error):
        code = run_hook(name, str(path), io.StringIO(json.dumps(event)), out)
    return code, out.getvalue(), error.getvalue()


def context(output: str) -> str:
    specific = JSON_OBJECT.validate_json(output)["hookSpecificOutput"]
    assert isinstance(specific, dict)
    text = specific["additionalContext"]
    assert isinstance(text, str)
    return text


def test_settings_route_tool_events_and_compaction_to_the_hooks(workspace: Path) -> None:
    sync_agent_files(workspace / PACKAGE)
    settings = SettingsWire.read(workspace / ".claude" / "settings.json")

    matchers = settings.matchers()
    rules = settings.rules("PreToolUse")

    assert matchers == {
        "PreToolUse": [
            "Write|Edit|MultiEdit|NotebookEdit|mcp__aqven__series_start|mcp__aqven__series_get",
            "Bash",
        ],
        "PostToolUse": [
            "Write|Edit|MultiEdit|NotebookEdit|Skill|mcp__aqven__series_start|mcp__aqven__series_get",
            "Bash",
        ],
        "SessionStart": ["compact"],
    }
    assert "Bash(uv *)" in rules and "Bash(curl *)" in rules


def test_a_write_under_flows_reminds_of_the_skill_once_per_session(workspace: Path) -> None:
    first = answer("reminders", workspace / PACKAGE, flow_write(workspace, "one"))
    again = answer("reminders", workspace / PACKAGE, flow_write(workspace, "one"))
    other = answer("reminders", workspace / PACKAGE, flow_write(workspace, "two"))

    assert first[0] == 0 and again[0] == 0
    assert "Load building-flows with the Skill tool" in context(first[1])
    assert "aqven:building-flows" not in first[1]
    assert again[1] == ""
    assert "Load building-flows" in context(other[1])
    assert (workspace / PACKAGE / ".aqven" / "hooks" / "one.reminders.json").is_file()


def test_a_loaded_skill_is_not_reminded(workspace: Path) -> None:
    loaded: dict[str, JsonValue] = {
        "hook_event_name": "PostToolUse",
        "session_id": "loaded",
        "tool_name": "Skill",
        "tool_input": {"skill": "building-flows"},
        "tool_response": "Launching skill: building-flows",
        "tool_use_id": "skill-1",
    }

    assert answer("reminders", workspace / PACKAGE, loaded)[1] == ""
    assert answer("reminders", workspace / PACKAGE, flow_write(workspace, "loaded"))[1] == ""


def test_a_foreground_series_is_sent_to_the_background(workspace: Path) -> None:
    event: dict[str, JsonValue] = {
        "hook_event_name": "PreToolUse",
        "session_id": "series",
        "tool_name": "Bash",
        "tool_input": {"command": f"uv run aqven series intake_check --path {PACKAGE} --on dev"},
        "tool_use_id": "bash-1",
    }

    code, output, _ = answer("reminders", workspace / PACKAGE, event)

    assert code == 0
    assert "Run `uv run aqven series` in the background" in context(output)
    assert "Load running-series with the Skill tool" in context(output)


def test_compaction_answers_only_a_session_started_by_compaction(workspace: Path) -> None:
    compacted = answer("compaction", workspace / PACKAGE, {"hook_event_name": "SessionStart", "source": "compact"})
    started = answer("compaction", workspace / PACKAGE, {"hook_event_name": "SessionStart", "source": "startup"})

    assert context(compacted[1]) == COMPACTED
    assert JSON_OBJECT.validate_json(compacted[1])["hookSpecificOutput"] == {
        "hookEventName": "SessionStart",
        "additionalContext": COMPACTED,
    }
    assert started[1] == ""


def test_bad_input_never_blocks_a_tool_call(workspace: Path, tmp_path_factory: pytest.TempPathFactory) -> None:
    outside = tmp_path_factory.mktemp("outside")
    out = io.StringIO()

    unknown = answer("guard", workspace / PACKAGE, flow_write(workspace, "x"))
    missing = answer("reminders", outside, flow_write(workspace, "x"))
    broken = run_hook("reminders", str(workspace / PACKAGE), io.StringIO("not json"), out)

    assert unknown[0] == 0 and "unknown hook guard; known hooks: reminders, compaction" in unknown[2]
    assert missing[0] == 0 and missing[1] == ""
    assert broken == 0 and out.getvalue() == ""


def test_cli_wording_names_project_skills_and_the_package() -> None:
    wording = CliWording(PACKAGE)

    text = wording.of("Load aqven:running-series first. Run `uv run aqven models check a --project . --live`.")

    assert text == f"Load running-series first. Run `uv run aqven models check a --project {PACKAGE} --live`."


def test_the_cli_prints_only_the_hook_answer(workspace: Path) -> None:
    environment = {key: value for key, value in os.environ.items() if key != "PYTHONPATH"}
    completed = subprocess.run(
        (sys.executable, "-m", "aqven", "hook", "reminders", PACKAGE),
        input=json.dumps(flow_write(workspace, "cli")),
        cwd=workspace,
        env=environment,
        capture_output=True,
        text=True,
        timeout=RUN_SECONDS,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr
    assert "Load building-flows" in context(completed.stdout)
