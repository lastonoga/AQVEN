import json
from pathlib import Path

import pytest
from console_support import copy_fixture
from pydantic import ValidationError

from aqven.cli import build_parser, main
from aqven.console import run as run_module
from aqven.console.run import FlowRunRequest, run_context, run_options
from aqven.runtime.options import RunContext


def note_file(tmp_path: Path) -> Path:
    note = tmp_path / "note.json"
    note.write_text(json.dumps({"text": "note"}), encoding="utf-8")
    return note


def test_context_option_is_repeatable() -> None:
    parsed = build_parser().parse_args(
        ["run", "triage", "--input", "in.json", "--context", "date=2026-09-18", "--context", "tenant_id=lumen"]
    )

    assert parsed.context == ["date=2026-09-18", "tenant_id=lumen"]


def test_a_context_option_without_a_value_is_a_usage_error() -> None:
    with pytest.raises(SystemExit):
        build_parser().parse_args(["run", "triage", "--input", "in.json", "--context", "date"])


def test_run_command_hands_the_context_to_the_run(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = copy_fixture("alias_shop", tmp_path)
    captured: list[FlowRunRequest] = []

    async def capture(request: FlowRunRequest) -> int:
        captured.append(request)
        return 0

    monkeypatch.setattr(run_module, "run_flow", capture)
    code = main(
        [
            "run",
            "audit",
            "--root",
            str(root),
            "--input",
            str(note_file(tmp_path)),
            "--context",
            "date=2026-09-18",
            "--context",
            "tenant_id=lumen",
        ]
    )
    [request] = captured

    assert code == 0
    assert request.context == (("date", "2026-09-18"), ("tenant_id", "lumen"))
    assert run_options(request).context == RunContext.model_validate({"date": "2026-09-18", "tenant_id": "lumen"})


def test_a_run_without_context_options_sends_no_context(tmp_path: Path) -> None:
    request = FlowRunRequest(root=tmp_path, flow_id="triage", input_file=note_file(tmp_path))

    assert run_options(request).context is None


def test_an_unknown_context_key_is_rejected() -> None:
    with pytest.raises(ValidationError):
        run_context((("weather", "sunny"),))
