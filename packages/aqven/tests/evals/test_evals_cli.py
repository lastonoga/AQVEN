import io
import json
from pathlib import Path

from evals_harness import EVAL_ID, models, short_answer

from aqven.cli import COMMANDS, build_parser
from aqven.console.command import OutputFormat
from aqven.console.evals import EvalCliRequest, configured_engines, run_eval_command
from aqven.testing.engines import EngineSession


def invoke(root: Path, data_dir: Path, arguments: list[str]) -> tuple[int, str, str]:
    parsed = build_parser().parse_args(["eval", str(root), "--data-dir", str(data_dir), *arguments])
    request = EvalCliRequest(
        root=root,
        eval_id=str(parsed.eval),
        dataset_id=parsed.dataset,
        baseline_run_id=parsed.baseline,
        repeats=parsed.repeats,
        data_dir=data_dir,
        output=OutputFormat.JSON if parsed.json else OutputFormat.TEXT,
    )
    out, err = io.StringIO(), io.StringIO()
    code = run_eval_command(request, out, err, configured_engines)
    return code, out.getvalue(), err.getvalue()


def test_the_eval_command_is_no_longer_a_stub() -> None:
    assert type(COMMANDS["eval"]).__name__ == "EvalCommand"
    assert type(COMMANDS["optimize"]).__name__ == "PendingCommand"


def test_eval_prints_a_scorer_table_and_the_gate_line(
    eval_shop: Path, aqven_engine: EngineSession, tmp_path: Path
) -> None:
    aqven_engine.models(models(short_answer))

    code, out, err = invoke(eval_shop, tmp_path / "data", ["--eval", EVAL_ID])

    assert (code, err) == (0, "")
    assert f"eval {EVAL_ID} on dataset reply_cases" in out
    assert "filled          binary" in out
    assert "gate: not computed" in out


def test_eval_json_mode_prints_the_stored_record(eval_shop: Path, aqven_engine: EngineSession, tmp_path: Path) -> None:
    aqven_engine.models(models(short_answer))

    code, out, _ = invoke(eval_shop, tmp_path / "data", ["--eval", EVAL_ID, "--json"])
    record = json.loads(out)

    assert code == 0
    assert record["eval_id"] == EVAL_ID and record["cases_ok"] == 3
    assert [item["scorer_id"] for item in record["scorers"]] == ["filled", "brief", "grade", "cost_usd"]


def test_an_unknown_eval_is_a_usage_error(eval_shop: Path, aqven_engine: EngineSession, tmp_path: Path) -> None:
    aqven_engine.models(models(short_answer))

    code, _, err = invoke(eval_shop, tmp_path / "data", ["--eval", "nothing_here"])

    assert code == 2
    assert "eval nothing_here is not in the project" in err
