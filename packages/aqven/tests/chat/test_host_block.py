from pathlib import Path

import pytest

from aqven.chat.host_block import HostFacts, host_block, server_url_of
from aqven.chat.project_rules import studio_instructions

MCP_URL = "http://127.0.0.1:5181/mcp/"
SERVER_URL = "http://127.0.0.1:5181"


@pytest.mark.parametrize(
    ("mcp_url", "server_url"),
    [
        (MCP_URL, SERVER_URL),
        ("http://127.0.0.1:5181/mcp", SERVER_URL),
        ("http://[::1]:5190/mcp/", "http://[::1]:5190"),
    ],
)
def test_the_server_url_is_the_origin_of_the_mcp_url(mcp_url: str, server_url: str) -> None:
    assert server_url_of(mcp_url) == server_url


def test_the_claude_block_names_the_project_the_server_and_its_pages() -> None:
    block = host_block("claude", HostFacts.of("/work/my_flow", MCP_URL))

    assert block.startswith("You are the agent of AQVEN Studio chat for project my_flow at /work/my_flow.")
    assert f"already running at {SERVER_URL}" in block
    assert f"Continue at {SERVER_URL}/research/series/<series_id>" in block
    assert f"A run is at {SERVER_URL}/runs/<run_id>" in block
    assert "Provider keys live in Studio settings or my_flow/.env" in block
    assert "run_in_background: true" in block
    assert "plugin aqven (aqven:<skill>)" in block
    assert "wait_seconds: 50" not in block


def test_the_codex_block_waits_with_series_get_instead_of_a_background_command() -> None:
    block = host_block("codex", HostFacts.of(Path("/work/my_flow"), MCP_URL))

    assert "series_get and wait_seconds: 50" in block
    assert ".aqven/server.json" in block
    assert "aqven:<skill>" in block
    assert "run_in_background" not in block
    assert f"Continue at {SERVER_URL}/research/series/<series_id>" in block


def test_the_host_block_follows_the_project_rules(tmp_path: Path) -> None:
    (tmp_path / "AGENTS.md").write_text("Project rule", encoding="utf-8")
    (tmp_path / "FINDINGS.md").write_text("# Findings", encoding="utf-8")

    assert studio_instructions(tmp_path, "Host block") == "Project rule\n\n# Findings\n\nHost block"


def test_the_host_block_stands_alone_without_project_rules(tmp_path: Path) -> None:
    assert studio_instructions(tmp_path, "Host block") == "Host block"
