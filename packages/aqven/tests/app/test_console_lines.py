import logging
from decimal import Decimal
from types import TracebackType
from typing import Final

from console_log_support import (
    CLOCK,
    RUN_ID,
    STUDIO,
    address,
    at_fixed_time,
    rendered,
    rendered_event,
    run_event,
)
from pydantic import JsonValue, TypeAdapter

from aqven.app.console_log.run_lines import RunTranscript, run_line
from aqven.app.console_log.series_lines import SeriesTranscript, series_line, series_started_line
from aqven.app.console_log.spec_lines import spec_line
from aqven.series.events import decode_series_event
from aqven.series.model import SeriesId, SeriesStatus
from aqven.series.views import SeriesEvent, SeriesProgress, SeriesStarted
from aqven.server.spec_channel import SpecEvent
from aqven.spec import FlowId, VariantId

MODEL: Final = "openrouter:openai/gpt-5-nano"
HINT: Final = "set output.mode: native or prompted in agents/looker_nano.yaml"
JSON_MESSAGE: Final = f"model {MODEL} returned output that is not valid JSON: Expecting value"
SERIES_ID: Final = SeriesId("01a0d355-aaaa-7bbb-8ccc-00005e71e5a1")
SERIES_AT: Final = "2026-09-24T12:36:33+00:00"
TREE: Final = "sha256-tree"
SPEC_EVENTS: Final[TypeAdapter[SpecEvent]] = TypeAdapter(SpecEvent)


def transcript() -> RunTranscript:
    return RunTranscript(run_id=RUN_ID, studio_url=f"{STUDIO}/runs/{RUN_ID}")


def looker_error() -> dict[str, JsonValue]:
    return {
        "code": "MODEL_INVALID_JSON",
        "message": f"{JSON_MESSAGE}\nsecond line of the raw error",
        "address": address("reply", item_index=3),
        "hint": HINT,
        "details": {"agent": "looker_nano", "model": MODEL},
    }


def series_event(payload: dict[str, object]) -> SeriesEvent:
    event = decode_series_event({"seq": 1, "at": SERIES_AT, "series_id": SERIES_ID, **payload})
    assert event is not None
    return event


def spec_event(payload: dict[str, object]) -> SpecEvent:
    return SPEC_EVENTS.validate_python({"seq": 1, "at": SERIES_AT, "tree_hash": TREE, **payload})


def test_run_started_names_the_flow_the_mode_and_the_studio_page() -> None:
    event = run_event(
        "run_started", 1, flow_id="looker", content_hash="sha256-c", mode="live", order=["reply"], input_ref=None
    )

    assert rendered_event(run_line(event, transcript())) == (
        f"{CLOCK} ▶ run bf3c852f started · flow looker · live · {STUDIO}/runs/{RUN_ID}\n"
    )


def test_step_finished_shows_the_item_agent_short_model_duration_tokens_and_cost() -> None:
    notes = transcript()
    captured = run_event(
        "inference_input_captured",
        2,
        address=address("reply", item_index=2),
        stage="bound",
        agent="looker_nano",
        inference="look",
        input_ref={"kind": "inline", "value": {}},
        variants={},
    )
    finished = run_event(
        "node_finished",
        3,
        address=address("reply", item_index=2),
        status="ok",
        attempt=1,
        output_ref=None,
        cost_usd="0.0012",
        tokens_in=1234,
        tokens_out=340,
        latency_ms=2400,
        model=MODEL,
        cache_hit=False,
        degraded=False,
        checks_failed=0,
    )

    assert run_line(captured, notes) is None
    assert rendered_event(run_line(finished, notes)) == (
        f"{CLOCK} ✓ reply[item=2] · looker_nano · gpt-5-nano · 2.4s · 1,234→340 tok · $0.0012\n"
    )


def test_code_step_shows_only_its_duration_and_branch() -> None:
    finished = run_event(
        "node_finished",
        3,
        address=address("prepare", branch_key="gpt"),
        status="ok",
        attempt=1,
        output_ref=None,
        cost_usd="0",
        tokens_in=0,
        tokens_out=0,
        latency_ms=12,
        model=None,
        cache_hit=False,
        degraded=False,
        checks_failed=0,
    )

    assert rendered_event(run_line(finished, transcript())) == f"{CLOCK} ✓ prepare[branch=gpt] · 12ms\n"


def test_retry_shows_attempt_code_message_hint_and_agent_file() -> None:
    notes = transcript()
    notes.agent_files["looker_nano"] = "agents/looker_nano.yaml"
    retry = run_event(
        "node_attempt_failed",
        4,
        address=address("reply", item_index=2),
        attempt=1,
        cause={
            "kind": "invalid_json",
            "message": JSON_MESSAGE,
            "schema_errors": [],
            "code": "MODEL_INVALID_JSON",
            "hint": HINT,
            "details": {"agent": "looker_nano", "model": MODEL},
        },
        action="retry",
    )

    assert rendered_event(run_line(retry, notes)) == (
        f"{CLOCK} ↻ reply[item=2] attempt 1 → retry · MODEL_INVALID_JSON\n"
        f"           {JSON_MESSAGE}\n"
        f"           hint: {HINT}\n"
        "           agent looker_nano (agents/looker_nano.yaml)\n"
    )


def test_failed_step_shows_code_one_line_message_and_hint() -> None:
    failed = run_event(
        "node_finished",
        5,
        address=address("reply", item_index=3),
        status="failed",
        attempt=2,
        output_ref=None,
        cost_usd="0",
        tokens_in=900,
        tokens_out=0,
        latency_ms=1100,
        model=MODEL,
        cache_hit=False,
        degraded=False,
        checks_failed=0,
        error=looker_error(),
    )

    assert rendered_event(run_line(failed, transcript())) == (
        f"{CLOCK} ✗ reply[item=3] · failed · looker_nano · gpt-5-nano · 1.1s · 900→0 tok · "
        f"MODEL_INVALID_JSON: {JSON_MESSAGE}\n"
        f"           hint: {HINT}\n"
    )


def test_completed_run_with_failed_steps_says_how_many_failed() -> None:
    notes = transcript()
    started = run_event(
        "run_started", 1, flow_id="looker", content_hash="sha256-c", mode="live", order=["reply"], input_ref=None
    )
    failed = run_event(
        "node_finished",
        2,
        address=address("reply", item_index=3),
        status="failed",
        attempt=1,
        output_ref=None,
        cost_usd="0",
        tokens_in=0,
        tokens_out=0,
        latency_ms=0,
        model=None,
        cache_hit=False,
        degraded=False,
        checks_failed=0,
        error=looker_error(),
    )
    finished = run_event(
        "run_finished",
        3,
        after_seconds=12.4,
        status="completed",
        output_ref=None,
        error=None,
        cost_usd="0.0213",
        tokens_in=3210,
        tokens_out=1020,
    )
    run_line(started, notes)
    run_line(failed, notes)

    assert rendered_event(run_line(finished, notes)) == (
        f"{CLOCK} ■ run bf3c852f completed · 1 step failed · 12.4s · 3,210→1,020 tok · $0.0213\n"
    )


def test_failed_run_shows_its_error_and_hint() -> None:
    finished = run_event(
        "run_finished",
        3,
        status="failed",
        output_ref=None,
        error=looker_error(),
        cost_usd="0",
        tokens_in=0,
        tokens_out=0,
    )

    assert rendered_event(run_line(finished, transcript())) == (
        f"{CLOCK} ■ run bf3c852f failed · MODEL_INVALID_JSON: {JSON_MESSAGE}\n           hint: {HINT}\n"
    )


def test_waiting_step_names_the_form_and_the_assignee() -> None:
    suspended = run_event(
        "node_suspended",
        6,
        address=address("review"),
        wait_kind="form",
        attempt=1,
        form_type_id="ReviewForm",
        assignee="reviewer",
        waiting_since=SERIES_AT,
        deadline_at=SERIES_AT,
        on_timeout="fail",
    )

    assert rendered_event(run_line(suspended, transcript())) == (
        f"{CLOCK} ⏸ review waits for form · ReviewForm · reviewer\n"
    )


def test_events_before_a_resume_update_the_transcript_silently() -> None:
    notes = transcript()
    notes.quiet_until = run_event("run_resumed", 9, after_seconds=5, address=address("review")).at
    started = run_event(
        "run_started", 1, flow_id="looker", content_hash="sha256-c", mode="live", order=["reply"], input_ref=None
    )

    assert run_line(started, notes) is None
    assert notes.flow_id == "looker"


def test_series_lines_cover_start_every_tenth_and_the_verdict() -> None:
    notes = SeriesTranscript(series_id=SERIES_ID, studio_url=f"{STUDIO}/research/series/{SERIES_ID}")
    started = SeriesStarted.model_construct(
        series_id=SERIES_ID,
        flow_id=FlowId("looker"),
        progress=SeriesProgress(done=0, total=120),
        variants=(VariantId("nano"), VariantId("qwen")),
        status=SeriesStatus.RUNNING,
    )
    progress = [
        series_line(
            series_event(
                {
                    "type": "attempt_finished",
                    "attempt_id": f"attempt-{done}",
                    "ordinal": done - 1,
                    "variant_id": "nano",
                    "case_name": "front",
                    "repeat": 0,
                    "run_id": RUN_ID,
                    "outcome": "ok",
                    "passed": True,
                    "cost_usd": "0.01",
                    "done": done,
                    "total": 120,
                    "spend_usd": str(Decimal("0.01") * done),
                }
            ),
            notes,
        )
        for done in (5, 12, 13, 36, 120)
    ]
    notes.verdict_text = "nano is not worse than qwen on success rate by more than 2 points"
    finished = series_line(series_event({"type": "series_finished", "status": "done", "verdict": "confirmed"}), notes)

    assert rendered_event(series_started_line(started, notes)) == (
        f"{CLOCK} ◆ series 5e71e5a1 started · flow looker · 120 attempts · 2 variants · "
        f"{STUDIO}/research/series/{SERIES_ID}\n"
    )
    assert [None if line is None else line.text for line in progress] == [
        None,
        "series 5e71e5a1 10% · 12/120 attempts · $0.12 spent",
        None,
        "series 5e71e5a1 30% · 36/120 attempts · $0.36 spent",
        None,
    ]
    assert rendered_event(finished) == (
        f"{CLOCK} ◆ series 5e71e5a1 done · verdict confirmed\n"
        "           nano is not worse than qwen on success rate by more than 2 points\n"
    )


def test_spec_lines_name_the_file_and_the_flow_health() -> None:
    changed = spec_event(
        {
            "type": "files_changed",
            "changes": [
                {
                    "path": "agents/looker_nano.yaml",
                    "change": "modified",
                    "file_hash_before": "a",
                    "file_hash_after": "b",
                }
            ],
            "actor": {"kind": "fs", "id": "watchfiles"},
            "client_op_id": None,
            "ops": None,
            "summary": "modified: 1",
        }
    )
    health = spec_event(
        {
            "type": "diagnostics_changed",
            "flow_id": "looker",
            "compile_status": "invalid",
            "problems": {"error": 2, "warning": 1, "info": 0},
        }
    )

    assert rendered_event(spec_line(changed)) == f"{CLOCK} ✎ agents/looker_nano.yaml modified · reindexed\n"
    assert rendered_event(spec_line(health)) == f"{CLOCK} ✎ flow looker · does not compile · 2 errors · 1 warning\n"


def test_foreign_records_carry_their_source_and_ours_do_not() -> None:
    ours = at_fixed_time(logging.LogRecord("aqven.engine.llm", logging.WARNING, __file__, 41, "CODE: text", (), None))
    theirs = at_fixed_time(logging.LogRecord("dbos", logging.WARNING, __file__, 805, "Workflow w lost", (), None))

    assert rendered(ours) == f"{CLOCK} ▲ CODE: text\n"
    assert rendered(theirs) == f"{CLOCK} ▲ dbos  Workflow w lost\n"


def failing() -> None:
    raise ValueError("boom")


def failure_info() -> tuple[type[BaseException], BaseException, TracebackType | None]:
    try:
        failing()
    except ValueError as error:
        return type(error), error, error.__traceback__
    raise AssertionError("failing() did not raise")


def test_tracebacks_are_printed_only_for_errors_unless_verbose() -> None:
    info = failure_info()
    warning = at_fixed_time(logging.LogRecord("uvicorn.error", logging.WARNING, __file__, 1, "slow", (), info))
    failure = at_fixed_time(logging.LogRecord("uvicorn.error", logging.ERROR, __file__, 1, "crashed", (), info))

    assert rendered(warning) == f"{CLOCK} ▲ uvicorn  slow\n           ValueError: boom\n"
    printed = rendered(failure)
    assert printed.startswith(f"{CLOCK} ✗ uvicorn  crashed\n")
    assert "Traceback" in printed and "ValueError: boom" in printed and "failing" in printed
    assert "Traceback" in rendered(warning, verbose=True)
