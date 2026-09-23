from pathlib import Path

from aqven.chat.project_rules import project_rules, rule_roots


def workspace_with_module(tmp_path: Path) -> Path:
    (tmp_path / "pyproject.toml").write_text('[project]\nname = "shop"\n', encoding="utf-8")
    (tmp_path / "AGENTS.md").write_text("Workspace agents rule", encoding="utf-8")
    (tmp_path / "CLAUDE.md").write_text("Workspace claude rule", encoding="utf-8")
    module = tmp_path / "shop"
    module.mkdir()
    (module / "aqven.yaml").write_text('apiVersion: "aqven/v1"\n', encoding="utf-8")
    return module


def test_rules_come_from_the_module_root_then_the_workspace_then_the_findings(tmp_path: Path) -> None:
    module = workspace_with_module(tmp_path)
    (module / "AGENTS.md").write_text("Module agents rule", encoding="utf-8")
    (module / "FINDINGS.md").write_text("# Findings", encoding="utf-8")

    assert project_rules(module).split("\n\n") == [
        "Module agents rule",
        "Workspace agents rule",
        "Workspace claude rule",
        "# Findings",
    ]


def test_findings_are_read_from_the_module_root_only(tmp_path: Path) -> None:
    module = workspace_with_module(tmp_path)
    (tmp_path / "FINDINGS.md").write_text("# Workspace findings", encoding="utf-8")

    assert "Workspace findings" not in project_rules(module)


def test_a_module_without_a_workspace_reads_its_own_rules_once(tmp_path: Path) -> None:
    (tmp_path / "AGENTS.md").write_text("Only rule", encoding="utf-8")

    assert rule_roots(tmp_path) == (tmp_path.resolve(),)
    assert project_rules(tmp_path) == "Only rule"


def test_symlinked_rule_files_are_skipped_in_every_root(tmp_path: Path) -> None:
    module = workspace_with_module(tmp_path)
    secret = tmp_path / "secret.txt"
    secret.write_text("secret", encoding="utf-8")
    (tmp_path / "AGENTS.md").unlink()
    (tmp_path / "AGENTS.md").symlink_to(secret)
    (module / "FINDINGS.md").symlink_to(secret)

    assert project_rules(module) == "Workspace claude rule"
