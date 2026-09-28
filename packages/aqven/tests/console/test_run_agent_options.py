import json
from pathlib import Path

import pytest
from console_support import copy_fixture

from aqven.cli import build_parser, main
from aqven.console import run as run_module
from aqven.console.run import FlowRunRequest, run_options
from aqven.engine.request import run_spec_of
from aqven.spec import FlowId


def note_file(tmp_path: Path) -> Path:
    note = tmp_path / "note.json"
    note.write_text(json.dumps({"text": "note"}), encoding="utf-8")
    return note


def test_agent_option_is_repeatable() -> None:
    parsed = build_parser().parse_args(
        ["run", "triage", "--input", "in.json", "--agent", "classify=cheap", "--agent", "grade=critic"]
    )

    assert parsed.agent == ["classify=cheap", "grade=critic"]


def test_an_agent_option_without_an_agent_is_a_usage_error() -> None:
    with pytest.raises(SystemExit):
        build_parser().parse_args(["run", "triage", "--input", "in.json", "--agent", "classify"])


def test_run_command_hands_the_agent_overrides_to_the_run(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = copy_fixture("alias_shop", tmp_path)
    captured: list[FlowRunRequest] = []

    async def capture(request: FlowRunRequest) -> int:
        captured.append(request)
        return 0

    monkeypatch.setattr(run_module, "run_flow", capture)
    code = main(["run", "audit", "--root", str(root), "--input", str(note_file(tmp_path)), "--agent", "judge=critic"])
    [request] = captured
    options = run_options(request)

    assert code == 0
    assert request.agents == (("judge", "critic"),)
    assert options.agent_overrides == {"judge": "critic"}
    assert run_spec_of(FlowId("audit"), options).agent_overrides == {"judge": "critic"}


def test_a_run_without_agent_options_overrides_nothing(tmp_path: Path) -> None:
    request = FlowRunRequest(root=tmp_path, flow_id="triage", input_file=note_file(tmp_path))

    assert run_options(request).agent_overrides == {}
