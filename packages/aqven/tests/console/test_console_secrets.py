import io
import json
from pathlib import Path
from typing import Final

import pytest
from console_support import copy_fixture

from aqven.console.command import EXIT_FAILED, EXIT_OK, OutputFormat
from aqven.console.secrets import build_report, list_secrets

KB_TOKEN: Final = "kb-secret-0123456789abcdef"
SHELL_KEY: Final = "sk-openai-shell-0123456789"
KB_TOOL: Final = """apiVersion: "aqven/v1"
kind: "Tool"
description: "Knowledge base search"
run: "@root.tools.functions:stamp"
effect: "read"
secrets:
- name: "kb_token"
  ref: "ref:env/SHOP_KB_TOKEN"
in:
- name: "text"
  type: "Text"
  description: "Query"
  maxLength: 200
out:
- name: "text"
  type: "Text"
  description: "Answer"
  maxLength: 200
"""


@pytest.fixture
def secrets_project(tmp_path: Path) -> Path:
    root = copy_fixture("standard_shop", tmp_path)
    (root / "tools" / "kb.yaml").write_text(KB_TOOL, encoding="utf-8")
    return root


def test_the_command_reports_every_declared_secret_and_its_source(secrets_project: Path) -> None:
    (secrets_project / ".env").write_text(f"SHOP_KB_TOKEN='{KB_TOKEN}'\n", encoding="utf-8")
    out = io.StringIO()

    code = list_secrets(secrets_project, OutputFormat.JSON, {"OPENAI_API_KEY": SHELL_KEY}, out)
    report = json.loads(out.getvalue())
    rows = {row["env_var"]: row for row in report["secrets"]}

    assert code == EXIT_OK
    assert set(rows) == {"OPENAI_API_KEY", "SHOP_KB_TOKEN"}
    assert (rows["SHOP_KB_TOKEN"]["source"], rows["SHOP_KB_TOKEN"]["declared_by"]) == ("dotenv", "kb")
    assert rows["OPENAI_API_KEY"]["source"] == "environment"
    assert report["missing"] == []
    assert KB_TOKEN not in out.getvalue()


def test_an_unset_secret_is_named_in_missing(secrets_project: Path) -> None:
    report = build_report(secrets_project, {})

    assert report is not None
    assert (report.ok, report.missing) == (False, ("OPENAI_API_KEY", "SHOP_KB_TOKEN"))


def test_the_text_table_names_the_owner_and_the_state(secrets_project: Path) -> None:
    out = io.StringIO()

    code = list_secrets(secrets_project, OutputFormat.TEXT, {}, out)
    lines = out.getvalue().splitlines()

    assert code == EXIT_OK
    assert lines[0].startswith("secret")
    assert any("tool kb" in line and "unset" in line for line in lines)


def test_a_project_that_does_not_load_fails(tmp_path: Path) -> None:
    (tmp_path / "aqven.yaml").write_text("apiVersion: nope\n", encoding="utf-8")

    assert list_secrets(tmp_path, OutputFormat.TEXT, {}) == EXIT_FAILED
