from pathlib import Path
from typing import Final

import pytest

from aqven.agent_files import installed_version, sync_agent_files
from aqven.check import check_project
from aqven.diagnostics import Diagnostic, DiagnosticCode, Severity
from aqven.testing import copy_project

FIXTURE: Final = Path(__file__).parent / "fixtures" / "standard_shop"
PACKAGE: Final = FIXTURE.name


@pytest.fixture
def shop(tmp_path: Path) -> Path:
    (tmp_path / "pyproject.toml").write_text('[project]\nname = "shop"\n', encoding="utf-8")
    return copy_project(FIXTURE, tmp_path)


def stale(root: Path) -> list[Diagnostic]:
    return [item for item in check_project(root).diagnostics if item.code is DiagnosticCode.W_AGENT_SKILLS_STALE]


def test_a_project_without_synced_skills_is_not_warned(shop: Path) -> None:
    assert stale(shop) == []


def test_synced_skills_are_clean(shop: Path) -> None:
    sync_agent_files(shop)

    assert check_project(shop).diagnostics == ()


def test_an_edited_skill_copy_warns_at_the_manifest(shop: Path) -> None:
    sync_agent_files(shop)
    (shop.parent / ".agents" / "skills" / "running-series" / "SKILL.md").write_text("edited\n", encoding="utf-8")

    [warning] = stale(shop)

    assert warning.severity is Severity.WARNING
    assert warning.file == "../.agents/skills/.aqven-skills.json"
    assert ".agents/skills/running-series/SKILL.md: differs from the installed engine" in warning.message
    assert warning.hint is not None and f"uv run aqven skills sync {PACKAGE}" in warning.hint


def test_a_block_of_another_engine_version_warns_at_its_file(shop: Path) -> None:
    sync_agent_files(shop)
    agents = shop.parent / "AGENTS.md"
    text = agents.read_text(encoding="utf-8")
    agents.write_text(text.replace(f"aqven:begin {installed_version()}", "aqven:begin 0.0.1"), encoding="utf-8")

    [warning] = stale(shop)

    assert warning.file == "../AGENTS.md"
    assert "AGENTS.md: has the aqven block of aqven 0.0.1" in warning.message


def test_rules_without_an_aqven_block_are_the_owner_s_own(shop: Path) -> None:
    (shop.parent / "AGENTS.md").write_text("# My rules\n", encoding="utf-8")

    assert stale(shop) == []
