import asyncio
import json
import logging
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

import pytest
from claude_agent_sdk.types import HookContext, HookEvent, PreToolUseHookInput

from aqven.chat.agent_hooks import AgentHooks, studio_agent_hooks
from aqven.chat.claude_options import default_guard
from aqven.chat.env_guard import GuardChain
from aqven.chat.hook_context import (
    POST_TOOL_USE,
    PRE_COMPACT,
    PRE_TOOL_USE,
    USER_PROMPT_SUBMIT,
    ContextRule,
    HookMoment,
    SessionMemory,
)
from aqven.chat.hook_inputs import ProjectFiles
from aqven.chat.hook_rules import (
    CHECK_CLEAN,
    COMPACTED,
    FOREGROUND_SERIES,
    CheckAfterEdit,
    CompactionReminder,
    PreviewAfterEdit,
    ProbeTracker,
    RestReminder,
    SeriesPreflight,
    SeriesWait,
    SkillGuard,
    SkillTracker,
)
from aqven.chat.project_probes import (
    CheckOutcome,
    NodePreview,
    agent_factor_agents,
    parsed_check,
    project_previews,
    tree_fingerprint,
)
from aqven.diagnostics import Diagnostic, DiagnosticCode, Severity

SESSION: Final = "cli-session"
OTHER_SESSION: Final = "other-session"
SNIPPETS: Final = Path(__file__).parents[1] / "fixtures" / "skill_snippets"
MISSING_REF: Final = Diagnostic(
    code=DiagnosticCode.E_REF_MISSING,
    severity=Severity.ERROR,
    file="flows/triage/flow.yaml",
    path=("nodes", 0),
    message="ref $nodes.missing.out.x names no node",
    line=7,
)


@dataclass
class FakeCheck:
    outcomes: list[CheckOutcome]
    calls: int = 0

    async def static(self) -> CheckOutcome:
        self.calls += 1
        return self.outcomes[min(self.calls, len(self.outcomes)) - 1]


@dataclass
class FakePreviews:
    rounds: list[tuple[NodePreview, ...] | None]
    calls: int = 0

    async def previews(self) -> tuple[NodePreview, ...] | None:
        self.calls += 1
        return self.rounds[min(self.calls, len(self.rounds)) - 1]


@dataclass
class FakeAgents:
    agents: Mapping[str, tuple[str, ...]] = field(default_factory=dict[str, tuple[str, ...]])

    async def factor_agents(self, experiment_id: str) -> tuple[str, ...]:
        return self.agents.get(experiment_id, ())


@dataclass(frozen=True, slots=True)
class BrokenRule:
    async def remind(self, moment: HookMoment, memory: SessionMemory) -> str | None:
        raise RuntimeError("probe crashed")


@dataclass(frozen=True, slots=True)
class FixedRule:
    text: str

    async def remind(self, moment: HookMoment, memory: SessionMemory) -> str | None:
        return self.text


def project(tmp_path: Path) -> ProjectFiles:
    (tmp_path / "pyproject.toml").write_text('[project]\nname = "shop"\n', encoding="utf-8")
    module = tmp_path / "shop"
    (module / "flows" / "triage").mkdir(parents=True)
    (module / "aqven.yaml").write_text('apiVersion: "aqven/v1"\n', encoding="utf-8")
    (module / "flows" / "triage" / "flow.yaml").write_text('kind: "Flow"\n', encoding="utf-8")
    return ProjectFiles.of(module)


def hooks_of(*rules: ContextRule) -> AgentHooks:
    return AgentHooks(rules=rules)


def moment(
    event: HookEvent,
    tool_name: str = "",
    tool_input: Mapping[str, object] | None = None,
    response: object = None,
    session: str = SESSION,
    tool_use_id: str = "toolu_1",
) -> HookMoment:
    return HookMoment(event, session, tool_name, dict(tool_input or {}), response, tool_use_id)


def write(files: ProjectFiles, relative: str, content: str = "x", session: str = SESSION) -> HookMoment:
    return moment(PRE_TOOL_USE, "Write", {"file_path": str(files.root / relative), "content": content}, session=session)


def edited(files: ProjectFiles, relative: str, event: HookEvent = POST_TOOL_USE) -> HookMoment:
    tool_input = {"file_path": str(files.root / relative), "old_string": "a", "new_string": "b"}
    return moment(event, "Edit", tool_input)


def bash(command: str, event: HookEvent = PRE_TOOL_USE, tool_use_id: str = "toolu_1", **extra: object) -> HookMoment:
    return moment(event, "Bash", {"command": command, **extra}, tool_use_id=tool_use_id)


def remind(hooks: AgentHooks, *moments: HookMoment) -> list[str]:
    async def scenario() -> list[str]:
        return [await hooks.reminders(item) for item in moments]

    return asyncio.run(scenario())


def preview(node: str, digest: str) -> NodePreview:
    return NodePreview(node, 2, 1200, ("Image",), "tool", 300, digest)


def series_response(series_id: str, status: str) -> list[dict[str, str]]:
    body = {"series": {"series_id": series_id, "status": status, "verdict": None}, "cases": None}
    return [{"type": "text", "text": json.dumps(body)}]


def test_writing_a_flow_reminds_to_load_building_flows_once_per_session(tmp_path: Path) -> None:
    files = project(tmp_path)
    hooks = hooks_of(SkillTracker(), SkillGuard(files))

    first, again, other = remind(
        hooks,
        write(files, "flows/triage/flow.yaml"),
        write(files, "flows/triage/nodes/route/route.node.yaml"),
        write(files, "flows/triage/flow.yaml", session=OTHER_SESSION),
    )

    assert first.startswith("Load aqven:building-flows with the Skill tool before this")
    assert "goes through either way" in first
    assert again == ""
    assert other == first


def test_a_loaded_skill_is_never_reminded(tmp_path: Path) -> None:
    files = project(tmp_path)
    hooks = hooks_of(SkillTracker(), SkillGuard(files))

    loaded, writing = remind(
        hooks,
        moment(POST_TOOL_USE, "Skill", {"skill": "aqven:building-flows"}),
        write(files, "flows/triage/flow.yaml"),
    )

    assert (loaded, writing) == ("", "")


@pytest.mark.parametrize(
    ("relative", "skills"),
    [
        ("experiments/look/nodes/alt/alt.node.yaml", ("building-flows", "designing-experiments")),
        ("experiments/look/experiment.yaml", ("designing-experiments",)),
        ("agents/reader.yaml", ("choosing-models",)),
        ("aqven.yaml", ("choosing-models",)),
        ("flows/triage/nodes/look/look.inference.yaml", ("building-flows", "designing-output-contracts")),
        ("datasets/cases.yaml", ("building-datasets",)),
        ("../scripts/build_cases.py", ("building-datasets",)),
        ("EXPERIMENTS.md", ("reporting-results",)),
    ],
)
def test_each_path_mask_names_its_skills(tmp_path: Path, relative: str, skills: tuple[str, ...]) -> None:
    files = project(tmp_path)

    (text,) = remind(hooks_of(SkillGuard(files)), write(files, relative))

    assert [line.split()[1] for line in text.splitlines()] == [f"aqven:{skill}" for skill in skills]


def test_an_image_field_asks_for_the_media_skill(tmp_path: Path) -> None:
    files = project(tmp_path)
    content = 'kind: "Type"\nfields:\n- name: "photos"\n  type: "Image[]"\n'

    (text,) = remind(hooks_of(SkillGuard(files)), write(files, "types/records/listing.yaml", content))

    assert "aqven:designing-output-contracts" in text
    assert "aqven:preparing-media-inputs" in text


def test_series_calls_ask_for_the_series_skill(tmp_path: Path) -> None:
    files = project(tmp_path)
    hooks = hooks_of(SkillGuard(files))

    tool, command = remind(
        hooks,
        moment(PRE_TOOL_USE, "mcp__aqven__series_start", {"experiment_id": "look"}),
        moment(PRE_TOOL_USE, "Bash", {"command": "uv run aqven series look --on dev"}, session=OTHER_SESSION),
    )

    assert tool.startswith("Load aqven:running-series")
    assert command.startswith("Load aqven:running-series")


def test_reads_and_foreign_files_get_no_skill_reminder(tmp_path: Path) -> None:
    files = project(tmp_path)

    texts = remind(
        hooks_of(SkillGuard(files)),
        moment(PRE_TOOL_USE, "Read", {"file_path": str(files.root / "flows/triage/flow.yaml")}),
        moment(PRE_TOOL_USE, "Write", {"file_path": "/tmp/elsewhere/flows/x.yaml", "content": "x"}),
        moment(PRE_TOOL_USE, "Bash", {"command": "grep aqven series docs"}),
        moment(POST_TOOL_USE, "Write", {"file_path": str(files.root / "flows/triage/flow.yaml"), "content": "x"}),
    )

    assert texts == ["", "", "", ""]


def test_a_reminder_rides_along_and_never_blocks_the_call(tmp_path: Path) -> None:
    files = project(tmp_path)
    hooks = hooks_of(SkillGuard(files))
    hook_input = PreToolUseHookInput(
        session_id=SESSION,
        transcript_path="/tmp/t.jsonl",
        cwd=str(files.root),
        hook_event_name="PreToolUse",
        tool_name="Write",
        tool_input={"file_path": str(files.root / "flows/triage/flow.yaml"), "content": "x"},
        tool_use_id="toolu_1",
    )

    output = asyncio.run(hooks.callback(hook_input, "toolu_1", HookContext(signal=None)))

    assert output == {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "additionalContext": remind(hooks_of(SkillGuard(files)), write(files, "flows/triage/flow.yaml"))[0],
        }
    }


def test_an_edit_reports_new_check_diagnostics_then_the_clean_state(tmp_path: Path) -> None:
    files = project(tmp_path)
    check = FakeCheck([CheckOutcome((MISSING_REF,)), CheckOutcome((MISSING_REF,)), CheckOutcome()])
    hooks = hooks_of(CheckAfterEdit(files, check))

    broken, same, fixed = remind(
        hooks,
        edited(files, "flows/triage/flow.yaml"),
        edited(files, "flows/triage/flow.yaml"),
        edited(files, "flows/triage/flow.yaml"),
    )

    assert broken.splitlines() == [
        "aqven check --static after this change: 1 errors and 0 warnings in the project. New:",
        "- E_REF_MISSING flows/triage/flow.yaml:7: ref $nodes.missing.out.x names no node",
    ]
    assert same == ""
    assert fixed == CHECK_CLEAN
    assert check.calls == 3


def test_notes_outside_files_and_the_pre_phase_run_no_check(tmp_path: Path) -> None:
    files = project(tmp_path)
    check = FakeCheck([CheckOutcome((MISSING_REF,))])

    texts = remind(
        hooks_of(CheckAfterEdit(files, check)),
        edited(files, "EXPERIMENTS.md"),
        edited(files, ".aqven/cache/simulation.json"),
        edited(files, "types.py"),
        moment(POST_TOOL_USE, "Edit", {"file_path": "/tmp/other/flow.yaml"}),
        edited(files, "flows/triage/flow.yaml", PRE_TOOL_USE),
    )

    assert texts == ["", "", "", "", ""]
    assert check.calls == 0


def test_a_failed_check_is_reported(tmp_path: Path) -> None:
    files = project(tmp_path)
    check = FakeCheck([CheckOutcome(failure="it did not finish in 60 s")])

    (text,) = remind(hooks_of(CheckAfterEdit(files, check)), edited(files, "flows/triage/flow.yaml"))

    assert text == "aqven check --static failed after this change: it did not finish in 60 s. Run aqven_check."


def test_a_shell_command_that_changes_project_files_runs_the_check(tmp_path: Path) -> None:
    files = project(tmp_path)
    check = FakeCheck([CheckOutcome((MISSING_REF,))])
    hooks = hooks_of(CheckAfterEdit(files, check))

    (before,) = remind(hooks, bash("mv flows/triage flows/intake", tool_use_id="b1"))
    (files.root / "flows" / "triage" / "flow.yaml").rename(files.root / "flows" / "intake.yaml")
    (after,) = remind(hooks, bash("mv flows/triage flows/intake", POST_TOOL_USE, tool_use_id="b1"))

    assert before == ""
    assert "E_REF_MISSING" in after
    assert check.calls == 1


def test_a_shell_command_that_changes_nothing_or_checks_itself_runs_no_check(tmp_path: Path) -> None:
    files = project(tmp_path)
    check = FakeCheck([CheckOutcome((MISSING_REF,))])
    hooks = hooks_of(CheckAfterEdit(files, check))

    remind(hooks, bash("ls flows", tool_use_id="b1"), bash("ls flows", POST_TOOL_USE, tool_use_id="b1"))
    remind(hooks, bash("uv run aqven check .", tool_use_id="b2"))
    (files.root / "types.py").write_text("generated", encoding="utf-8")
    remind(hooks, bash("uv run aqven check .", POST_TOOL_USE, tool_use_id="b2"))
    remind(hooks, bash("echo hi", POST_TOOL_USE, tool_use_id="never-started"))

    assert check.calls == 0


def test_a_running_series_is_reminded_once_per_series() -> None:
    hooks = hooks_of(SeriesWait())

    started, polled, done, other = remind(
        hooks,
        moment(POST_TOOL_USE, "mcp__aqven__series_start", response=series_response("s-1", "running")),
        moment(POST_TOOL_USE, "mcp__aqven__series_get", response=series_response("s-1", "running")),
        moment(POST_TOOL_USE, "mcp__aqven__series_get", response=series_response("s-2", "done")),
        moment(POST_TOOL_USE, "mcp__aqven__series_get", response={"series_id": "s-3", "status": "running"}),
    )

    assert started.startswith("Series s-1 is running and nothing wakes you when it ends")
    assert (polled, done) == ("", "")
    assert other.startswith("Series s-3 is running")


def test_a_foreground_series_command_is_sent_to_the_background() -> None:
    hooks = hooks_of(SeriesWait())

    background, foreground, again = remind(
        hooks,
        bash("uv run aqven series look --on dev", run_in_background=True),
        bash("uv run aqven series look --on dev"),
        bash("uv run aqven series look --on dev"),
    )

    assert (background, foreground, again) == ("", FOREGROUND_SERIES, "")


def test_raw_http_to_routes_with_mcp_tools_names_the_tools_once_per_route() -> None:
    hooks = hooks_of(RestReminder())
    token = "-H 'Authorization: Bearer abc'"

    series, again, runs, approve, blob, grep = remind(
        hooks,
        bash(f"curl -s {token} http://127.0.0.1:5181/api/series/s-1"),
        bash(f"curl -s {token} 'http://127.0.0.1:5181/api/series/s-1?wait_seconds=50'"),
        bash(f"curl -s {token} http://127.0.0.1:5181/api/runs/r-1"),
        bash(f"curl -X POST {token} http://127.0.0.1:5181/api/series/s-1/approve"),
        bash(f"curl -X POST {token} -F file=@photo.jpg http://127.0.0.1:5181/api/blobs"),
        bash('grep -rn "http://127.0.0.1:5181/api/series" docs'),
    )

    assert "series_start, series_get with wait_seconds and series_cancel" in series
    assert again == ""
    assert "run_start, run_get, run_list" in runs
    assert approve.startswith("Only the owner approves spend, in Studio")
    assert (blob, grep) == ("", "")


def test_a_prompt_edit_previews_the_nodes_it_changed(tmp_path: Path) -> None:
    files = project(tmp_path)
    previews = FakePreviews(
        [
            (preview("triage.look", "a"), preview("triage.route", "r")),
            (preview("triage.look", "b"), preview("triage.route", "r")),
            (preview("triage.look", "b"), preview("triage.route", "r")),
        ]
    )
    hooks = hooks_of(PreviewAfterEdit(files, previews))
    prompt = "flows/triage/nodes/look/look.prompt.md"

    baseline, changed, second_pre, unchanged = remind(
        hooks,
        edited(files, prompt, PRE_TOOL_USE),
        edited(files, prompt),
        edited(files, prompt, PRE_TOOL_USE),
        edited(files, prompt),
    )

    assert baseline == ""
    assert changed.splitlines() == [
        "prompt_preview of the llm nodes this change touched, on sample input:",
        "- triage.look: 2 messages, 1,200 characters, attachments: Image, output tool with a 300-character schema",
        "Read the full prompt_preview of each before you run it.",
    ]
    assert (second_pre, unchanged) == ("", "")
    assert previews.calls == 3


def test_edits_outside_prompts_and_broken_projects_preview_nothing(tmp_path: Path) -> None:
    files = project(tmp_path)
    previews = FakePreviews([None])
    hooks = hooks_of(PreviewAfterEdit(files, previews))

    texts = remind(
        hooks,
        edited(files, "datasets/cases.yaml", PRE_TOOL_USE),
        edited(files, "datasets/cases.yaml"),
        edited(files, "fragments/rules.md", PRE_TOOL_USE),
        edited(files, "fragments/rules.md"),
    )

    assert texts == ["", "", "", ""]
    assert previews.calls == 2


def test_a_compaction_is_reminded_once_on_the_next_prompt_or_tool() -> None:
    hooks = hooks_of(CompactionReminder())

    texts = remind(
        hooks,
        moment(USER_PROMPT_SUBMIT),
        moment(PRE_COMPACT),
        moment(USER_PROMPT_SUBMIT),
        moment(USER_PROMPT_SUBMIT),
        moment(PRE_COMPACT),
        moment(POST_TOOL_USE, "Read", {"file_path": "FINDINGS.md"}),
    )

    assert texts == ["", "", COMPACTED, "", "", COMPACTED]


def test_an_agent_factor_without_live_probes_is_reminded_until_probed() -> None:
    hooks = hooks_of(ProbeTracker(), SeriesPreflight(FakeAgents({"look_agent": ("critic", "reader")})))
    start = moment(PRE_TOOL_USE, "mcp__aqven__series_start", {"experiment_id": "look_agent", "on": "dev"})

    first, repeated, probed, dry, after_probe = remind(
        hooks,
        start,
        start,
        bash("uv run aqven models check critic --project . --live", POST_TOOL_USE),
        bash("uv run aqven models check reader --project .", POST_TOOL_USE),
        bash("uv run aqven series look_agent --on dev", run_in_background=True),
    )

    assert first.startswith("This series compares `critic`, `reader` with no `uv run aqven models check")
    assert (repeated, probed, dry) == ("", "", "")
    assert after_probe.startswith("This series compares `reader` with no")


def test_probing_every_agent_silences_the_probe_reminder() -> None:
    hooks = hooks_of(ProbeTracker(), SeriesPreflight(FakeAgents({"look_agent": ("critic", "reader")})))

    _, start = remind(
        hooks,
        bash("uv run aqven models check --project . --live", POST_TOOL_USE),
        moment(PRE_TOOL_USE, "mcp__aqven__series_start", {"experiment_id": "look_agent"}),
    )

    assert start == ""


def test_a_holdout_series_asks_for_the_owner_line_once_per_experiment() -> None:
    hooks = hooks_of(SeriesPreflight(FakeAgents()))

    dev, holdout, again, tool = remind(
        hooks,
        bash("uv run aqven series look_prompt --on dev", run_in_background=True),
        bash("uv run aqven series look_prompt --on holdout", run_in_background=True),
        bash("uv run aqven series look_prompt --on=holdout", run_in_background=True),
        moment(PRE_TOOL_USE, "mcp__aqven__series_start", {"experiment_id": "tally_rule", "on": "holdout"}),
    )

    assert dev == ""
    assert holdout.startswith("Before a holdout series of look_prompt, tell the owner in one line")
    assert again == ""
    assert tool.startswith("Before a holdout series of tally_rule")


def test_a_failing_rule_is_logged_and_the_others_still_remind(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.WARNING, logger="aqven.chat.hooks")
    hooks = hooks_of(BrokenRule(), FixedRule("first"), FixedRule("second"))

    (text,) = remind(hooks, moment(USER_PROMPT_SUBMIT))

    assert text == "first\n\nsecond"
    assert "chat hook BrokenRule failed on UserPromptSubmit: probe crashed" in caplog.text


def test_the_guard_chain_adds_the_reminders_next_to_its_refusals(tmp_path: Path) -> None:
    project(tmp_path)
    chain = GuardChain(default_guard(), (), studio_agent_hooks(tmp_path / "shop"))

    hooks = chain.hooks()

    assert set(hooks) == {"PreToolUse", "PostToolUse", "PostToolUseFailure", "UserPromptSubmit", "PreCompact"}
    assert [matcher.matcher for matcher in hooks["PreToolUse"]] == [
        "Read|Write|Edit|MultiEdit|NotebookEdit|Grep|Glob|Bash",
        None,
    ]
    assert "Stop" not in hooks


def test_parsed_check_reads_the_json_report_or_names_the_failure() -> None:
    report = json.dumps({"ok": False, "diagnostics": [MISSING_REF.model_dump(mode="json")]}).encode()

    assert parsed_check(report, b"") == CheckOutcome((MISSING_REF,))
    assert parsed_check(b"", b"Traceback: boom\n") == CheckOutcome(failure="Traceback: boom")
    assert parsed_check(b"", b"") == CheckOutcome(failure="it printed no report")


def test_the_tree_fingerprint_skips_state_and_caches(tmp_path: Path) -> None:
    files = project(tmp_path)
    before = tree_fingerprint(files.root)
    (files.root / ".aqven").mkdir()
    (files.root / ".aqven" / "server.json").write_text("{}", encoding="utf-8")
    (files.root / "__pycache__").mkdir()
    (files.root / "__pycache__" / "x.pyc").write_text("x", encoding="utf-8")

    assert tree_fingerprint(files.root) == before
    (files.root / "agents").mkdir()
    (files.root / "agents" / "reader.yaml").write_text("x", encoding="utf-8")
    assert tree_fingerprint(files.root) != before


def test_previews_and_factor_agents_come_from_the_real_project() -> None:
    first = project_previews(SNIPPETS)
    second = project_previews(SNIPPETS)

    assert first is not None and second is not None
    assert "listing_review.match_photos" in {item.node for item in first}
    assert [item.digest for item in first] == [item.digest for item in second]
    assert agent_factor_agents(SNIPPETS, "photo_agent") == ("critic", "reader")
    assert agent_factor_agents(SNIPPETS, "photo_prompt") == ()
    assert agent_factor_agents(SNIPPETS, "missing") == ()
