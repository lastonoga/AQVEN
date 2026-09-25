import json
import os
import tomllib
from pathlib import Path
from typing import Final

import pytest
from agent_settings import SettingsWire
from pydantic import JsonValue, TypeAdapter

from aqven.agent_files import AgentPlace, agent_files_drift, agent_plugin_root, installed_version, sync_agent_files
from aqven.agent_files.skills import skill_files, skill_names
from aqven.cli import main

PACKAGE: Final = "shop"
PROJECT_FILE: Final = 'apiVersion: "aqven/v1"\nkind: "Project"\npackage: "shop"\n'
BLOCK_START: Final = f"<!-- aqven:begin {installed_version()} -->"
OWNER_HEADING: Final = "## Owner's rules"
HOOK_COMMAND: Final = f'uv run --directory "$CLAUDE_PROJECT_DIR" aqven hook reminders {PACKAGE} || true'
JSON_OBJECT: Final[TypeAdapter[dict[str, JsonValue]]] = TypeAdapter(dict[str, JsonValue])
SKILLS: Final = skill_names(skill_files(agent_plugin_root() / "skills"))
USER_HOOK: Final = {"type": "command", "command": "echo mine"}
AQVEN_SERVER: Final = {"type": "stdio", "command": "uv", "args": ["run", "aqven", "mcp", PACKAGE]}
OLD_HOOK: Final = {"type": "command", "command": 'python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/aqven_check.py"'}


@pytest.fixture
def workspace(tmp_path: Path) -> Path:
    (tmp_path / "pyproject.toml").write_text('[project]\nname = "shop"\n', encoding="utf-8")
    (tmp_path / PACKAGE).mkdir()
    (tmp_path / PACKAGE / "aqven.yaml").write_text(PROJECT_FILE, encoding="utf-8")
    return tmp_path


def read_json(path: Path) -> dict[str, JsonValue]:
    return JSON_OBJECT.validate_json(path.read_text(encoding="utf-8"))


def sync(workspace: Path) -> int:
    return main(["skills", "sync", str(workspace / PACKAGE)])


def test_sync_writes_every_agent_file(workspace: Path) -> None:
    assert sync(workspace) == 0

    manifest = read_json(workspace / ".agents" / "skills" / ".aqven-skills.json")
    settings = SettingsWire.read(workspace / ".claude" / "settings.json")
    servers = read_json(workspace / ".mcp.json")["mcpServers"]
    codex = tomllib.loads((workspace / ".codex" / "config.toml").read_text(encoding="utf-8"))
    agents = (workspace / "AGENTS.md").read_text(encoding="utf-8")
    claude = (workspace / "CLAUDE.md").read_text(encoding="utf-8")

    assert len(SKILLS) == 12
    assert [skill for skill in SKILLS if not (workspace / ".agents" / "skills" / skill / "SKILL.md").is_file()] == []
    assert {os.readlink(workspace / ".claude" / "skills" / skill) for skill in SKILLS} == {
        f"../../.agents/skills/{skill}" for skill in SKILLS
    }
    assert manifest["aqven"] == installed_version()
    assert isinstance(manifest["files"], dict) and "building-flows/SKILL.md" in manifest["files"]
    assert not [path for path in manifest["files"] if path.endswith("references.txt")]
    assert agents.startswith(BLOCK_START) and f"`<package>` in this file is `{PACKAGE}`" in agents
    assert agents.rstrip().splitlines()[-3] == OWNER_HEADING
    assert claude.startswith(BLOCK_START) and "\n@AGENTS.md\n" in claude
    assert settings.approved_servers == ["aqven"]
    assert set(settings.commands("PreToolUse")) == {HOOK_COMMAND}
    assert settings.commands("SessionStart") == [HOOK_COMMAND.replace("reminders", "compaction")]
    assert servers == {"aqven": AQVEN_SERVER}
    assert codex["mcp_servers"]["aqven"] == {"command": "uv", "args": ["run", "aqven", "mcp", PACKAGE]}


def test_second_sync_changes_nothing_and_status_is_clean(workspace: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert sync(workspace) == 0
    capsys.readouterr()

    assert sync(workspace) == 0
    again = capsys.readouterr().out.splitlines()
    status = main(["skills", "status", str(workspace / PACKAGE)])

    assert again == [f"skills: in sync with aqven {installed_version()} in {workspace.resolve()}"]
    assert status == 0


def test_sync_replaces_only_the_block_and_keeps_the_owner_text(workspace: Path) -> None:
    old = (
        "Notes above the block.\n<!-- aqven:begin 0.0.1 -->\nold engine rules\n<!-- aqven:end -->\n\n"
        f"{OWNER_HEADING}\n\n- Answer in Russian.\n"
    )
    (workspace / "AGENTS.md").write_text(old, encoding="utf-8")

    assert sync(workspace) == 0

    agents = (workspace / "AGENTS.md").read_text(encoding="utf-8")
    assert agents.startswith(f"Notes above the block.\n{BLOCK_START}\n")
    assert "old engine rules" not in agents
    assert agents.endswith(f"<!-- aqven:end -->\n\n{OWNER_HEADING}\n\n- Answer in Russian.\n")
    assert agents.count(OWNER_HEADING) == 1


def test_sync_puts_the_block_above_an_agents_file_without_one(
    workspace: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (workspace / "AGENTS.md").write_text("# Old rules\n\nKeep this.\n", encoding="utf-8")

    assert sync(workspace) == 0

    agents = (workspace / "AGENTS.md").read_text(encoding="utf-8")
    assert agents.startswith(BLOCK_START)
    assert "<!-- aqven:end -->\n\n# Old rules\n\nKeep this.\n" in agents
    assert agents.index("# Old rules") < agents.index(OWNER_HEADING)
    assert agents.count(OWNER_HEADING) == 1
    assert "keep your own rules under ## Owner's rules" in capsys.readouterr().out


def test_sync_merges_settings_and_servers_it_does_not_own(workspace: Path) -> None:
    claude = workspace / ".claude"
    (claude / "hooks").mkdir(parents=True)
    (claude / "hooks" / "aqven_check.py").write_text("print('old')\n", encoding="utf-8")
    settings = {
        "permissions": {"allow": ["Bash(ls *)"]},
        "enabledMcpjsonServers": ["github"],
        "hooks": {"Stop": [{"hooks": [OLD_HOOK]}], "PreToolUse": [{"matcher": "Bash", "hooks": [USER_HOOK, OLD_HOOK]}]},
    }
    (claude / "settings.json").write_text(json.dumps(settings), encoding="utf-8")
    other = {"type": "stdio", "command": "npx", "args": ["github-mcp"]}
    (workspace / ".mcp.json").write_text(json.dumps({"mcpServers": {"github": other}}), encoding="utf-8")
    (workspace / ".codex").mkdir()
    (workspace / ".codex" / "config.toml").write_text('model = "gpt-5"', encoding="utf-8")

    assert sync(workspace) == 0

    merged = SettingsWire.read(claude / "settings.json")
    raw = read_json(claude / "settings.json")
    codex = tomllib.loads((workspace / ".codex" / "config.toml").read_text(encoding="utf-8"))
    assert raw["permissions"] == {"allow": ["Bash(ls *)"]}
    assert merged.approved_servers == ["github", "aqven"]
    assert "Stop" not in merged.hooks
    assert merged.commands("PreToolUse").count("echo mine") == 1
    assert not [command for command in merged.commands("PreToolUse") if "aqven_check.py" in command]
    assert not (claude / "hooks").exists()
    assert read_json(workspace / ".mcp.json")["mcpServers"] == {"github": other, "aqven": AQVEN_SERVER}
    assert codex["model"] == "gpt-5" and codex["mcp_servers"]["aqven"]["command"] == "uv"


def test_sync_keeps_an_aqven_server_the_owner_changed(workspace: Path, capsys: pytest.CaptureFixture[str]) -> None:
    changed = {"mcpServers": {"aqven": {"type": "stdio", "command": "uv", "args": ["run", "aqven", "mcp", "."]}}}
    (workspace / ".mcp.json").write_text(json.dumps(changed), encoding="utf-8")

    assert sync(workspace) == 0
    output = capsys.readouterr().out
    status = main(["skills", "status", str(workspace / PACKAGE)])

    assert read_json(workspace / ".mcp.json") == changed
    assert "kept .mcp.json: has another aqven server than" in output
    assert "1 kept as they are, fix them by hand" in output
    assert status == 1


def test_status_names_a_stale_copy_and_sync_repairs_it(workspace: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert sync(workspace) == 0
    copy = workspace / ".agents" / "skills" / "building-flows" / "SKILL.md"
    copy.write_text("edited\n", encoding="utf-8")
    capsys.readouterr()

    stale = main(["skills", "status", str(workspace / PACKAGE)])
    report = capsys.readouterr().out
    assert sync(workspace) == 0

    assert stale == 1
    assert ".agents/skills/building-flows/SKILL.md: differs from the installed engine" in report
    assert agent_files_drift(workspace / PACKAGE) == ()


def test_sync_removes_skills_the_engine_no_longer_ships(workspace: Path) -> None:
    assert sync(workspace) == 0
    manifest_path = workspace / ".agents" / "skills" / ".aqven-skills.json"
    manifest = read_json(manifest_path)
    files = manifest["files"]
    assert isinstance(files, dict)
    retired = workspace / ".agents" / "skills" / "retired-skill"
    retired.mkdir()
    (retired / "SKILL.md").write_text("old\n", encoding="utf-8")
    (workspace / ".claude" / "skills" / "retired-skill").symlink_to("../../.agents/skills/retired-skill")
    user_skill = workspace / ".agents" / "skills" / "my-own-skill" / "SKILL.md"
    user_skill.parent.mkdir()
    user_skill.write_text("mine\n", encoding="utf-8")
    manifest_path.write_text(
        json.dumps({**manifest, "files": {**files, "retired-skill/SKILL.md": "sha256-0"}}), encoding="utf-8"
    )

    assert sync(workspace) == 0

    assert not retired.exists()
    assert not (workspace / ".claude" / "skills" / "retired-skill").is_symlink()
    assert user_skill.read_text(encoding="utf-8") == "mine\n"


def test_links_fall_back_to_copies_where_symlinks_fail(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    def refuse(self: Path, target: str | Path, target_is_directory: bool = False) -> None:
        raise OSError("symbolic links are not allowed here")

    monkeypatch.setattr(Path, "symlink_to", refuse)

    changes = sync_agent_files(workspace / PACKAGE)

    copied = workspace / ".claude" / "skills" / "running-series"
    assert copied.is_dir() and not copied.is_symlink()
    assert (copied / "SKILL.md").read_bytes() == (
        agent_plugin_root() / "skills" / "running-series" / "SKILL.md"
    ).read_bytes()
    assert [change.line() for change in changes if "running-series" in change.path][-1].startswith("copied ")
    assert agent_files_drift(workspace / PACKAGE) == ()


def test_package_path_is_relative_to_the_workspace(workspace: Path) -> None:
    assert AgentPlace.of(workspace / PACKAGE).package == PACKAGE
    assert AgentPlace.of(workspace / PACKAGE, workspace / PACKAGE).package == "."


def test_skills_path_prints_the_plugin_folder(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["skills", "path"]) == 0

    printed = Path(capsys.readouterr().out.strip())
    assert (printed / ".claude-plugin" / "plugin.json").is_file()
    assert printed == agent_plugin_root()
