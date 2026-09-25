import json
from dataclasses import replace
from pathlib import Path

import pytest
from build_eval_plugin import CASES_SUITE, SUITES, TRIGGERS_SUITE, BuildError, Sources, build
from front_matter import parse_yaml_mapping, split_document

PLUGIN_JSON = '{"name": "aqven", "version": "0.0.2", "description": "skills", "author": {"name": "AQVEN"}}\n'
MCP_TEMPLATE = json.dumps(
    {"mcpServers": {"aqven": {"type": "stdio", "command": "uv", "args": ["run", "aqven", "mcp", "__package__"]}}}
)
CASE_PROMPT = '---\nruns: 3\nmax_turns: 30\ntags: ["core"]\n---\nCompare the ways tally merges the ballots.\n'
CASE_WITH_OWN_PROMPT = '---\nruns: 1\nappend_system_prompt: "Summary: new .py needs a restart."\n---\nContinue.\n'
SKILL_GRADER = '---\ntype: tool_used\ntool: "Skill"\ninput_match: "designing-experiments"\n---\n'
LLM_GRADER = "---\ntype: llm\nweight: 3\n---\nPass only if the experiment declares one factor.\n"
CASE_YAML = """schema_version: "1.0"
name: "resume"
context:
  history_file: "history.jsonl"
execution:
  prompt: "What next?"
  max_turns: 3
graders:
  - type: "tool_used"
    name: "skill-fired"
    tool: "Skill"
  - type: "regex"
    name: "marker"
    target: "last_message"
    pattern: "QUOKKA"
"""


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def sources(tmp_path: Path, host_block: bool = True) -> Sources:
    plugin = tmp_path / "agent_plugin"
    evals = tmp_path / "evals"
    write(plugin / ".claude-plugin" / "plugin.json", PLUGIN_JSON)
    write(plugin / "skills" / "designing-experiments" / "SKILL.md", "---\nname: x\n---\n")
    write(plugin / "skills" / "designing-experiments" / "__pycache__" / "x.pyc", "")
    write(tmp_path / "template.md", "# Rules for __package__\n\nThe whole template.\n")
    write(tmp_path / "mcp.json", MCP_TEMPLATE)
    write(
        tmp_path / "core.md",
        "<!-- aqven:begin <version> -->\n# Rules for coding agents\n\n| Before | Skill |\n|---|---|\n\n"
        "Load the skill for __package__.\n",
    )
    write(tmp_path / "host.md", "Project lumen at <project_root>, server <url>; skills write `<package>`.\n")
    write(evals / "aggregation" / "prompt.md", CASE_PROMPT)
    write(evals / "aggregation" / "graders" / "skill-fired.md", SKILL_GRADER)
    write(evals / "aggregation" / "graders" / "judge.md", LLM_GRADER)
    write(evals / "compaction" / "prompt.md", CASE_WITH_OWN_PROMPT)
    write(evals / "compaction" / "graders" / "judge.md", LLM_GRADER)
    write(evals / "resume" / "case.yaml", CASE_YAML)
    write(evals / "resume" / "history.jsonl", '{"type": "user"}\n')
    write(evals / "mocks" / "aqven" / "series_get.md", "---\nexpect:\n  series_id: s-1\n---\n{}\n")
    write(evals / "fixtures" / "lumen" / "prompt.md", "A fixture file, not a case.\n")
    write(evals / "results" / "2026-09-25" / "aggregate-result.json", "{}\n")
    return Sources(
        plugin=plugin,
        evals=evals,
        template_agents=tmp_path / "template.md",
        mcp_template=tmp_path / "mcp.json",
        core=tmp_path / "core.md",
        host_block=tmp_path / "host.md" if host_block else None,
        package="lumen",
        project_root="/workspace/lumen",
        url="http://127.0.0.1:5180",
        version="0.0.2",
    )


def system_prompt(case: Path) -> object:
    return split_document(case.read_text(encoding="utf-8")).front_matter["append_system_prompt"]


CORE_TEXT = (
    "<!-- aqven:begin 0.0.2 -->\n# Rules for coding agents\n\n| Before | Skill |\n|---|---|\n\n"
    "Load the skill for lumen.\n\n"
    "Project lumen at /workspace/lumen, server http://127.0.0.1:5180; skills write `<package>`."
)


def test_three_wrappers_are_built_with_the_same_cases(tmp_path: Path) -> None:
    out = tmp_path / "build"
    report = build(sources(tmp_path), out)
    assert [line.split("\n")[0] for line in report] == [
        "eval-plugin: 3 cases",
        "eval-plugin-core: 3 cases",
        "eval-plugin-template: 3 cases",
    ]
    assert "--ablation with-without" in report[0]
    assert "--ablation none" in report[1]


def test_only_the_full_wrapper_carries_skills(tmp_path: Path) -> None:
    out = tmp_path / "build"
    build(sources(tmp_path), out)
    assert (out / "eval-plugin" / "skills" / "designing-experiments" / "SKILL.md").is_file()
    assert not (out / "eval-plugin" / "skills" / "designing-experiments" / "__pycache__").exists()
    assert not (out / "eval-plugin-core" / "skills").exists()
    assert not (out / "eval-plugin-template" / "skills").exists()
    for folder in ("eval-plugin", "eval-plugin-core", "eval-plugin-template"):
        manifest = json.loads((out / folder / ".claude-plugin" / "plugin.json").read_text(encoding="utf-8"))
        assert manifest["name"] == "aqven"


def test_every_wrapper_declares_the_aqven_server_for_the_fixture_package(tmp_path: Path) -> None:
    out = tmp_path / "build"
    build(sources(tmp_path), out)
    config = json.loads((out / "eval-plugin-core" / ".mcp.json").read_text(encoding="utf-8"))
    assert config["mcpServers"]["aqven"]["args"] == ["run", "aqven", "mcp", "lumen"]


def test_cases_get_the_system_prompt_of_their_wrapper(tmp_path: Path) -> None:
    out = tmp_path / "build"
    build(sources(tmp_path), out)
    assert system_prompt(out / "eval-plugin" / "evals" / "aggregation" / "prompt.md") == CORE_TEXT
    assert system_prompt(out / "eval-plugin-core" / "evals" / "aggregation" / "prompt.md") == CORE_TEXT
    template = system_prompt(out / "eval-plugin-template" / "evals" / "aggregation" / "prompt.md")
    assert template == "# Rules for lumen\n\nThe whole template."


def test_a_case_keeps_its_other_keys_and_its_prompt(tmp_path: Path) -> None:
    out = tmp_path / "build"
    build(sources(tmp_path), out)
    document = split_document((out / "eval-plugin" / "evals" / "aggregation" / "prompt.md").read_text("utf-8"))
    assert dict(document.front_matter) == {
        "runs": 3,
        "max_turns": 30,
        "tags": ["core"],
        "append_system_prompt": CORE_TEXT,
    }
    assert document.body == "Compare the ways tally merges the ballots.\n"


def test_a_case_prompt_of_its_own_follows_the_wrapper_prompt(tmp_path: Path) -> None:
    out = tmp_path / "build"
    build(sources(tmp_path), out)
    case = out / "eval-plugin-core" / "evals" / "compaction" / "prompt.md"
    assert system_prompt(case) == f"{CORE_TEXT}\n\nSummary: new .py needs a restart."


def test_case_yaml_gets_the_prompt_under_execution(tmp_path: Path) -> None:
    out = tmp_path / "build"
    build(sources(tmp_path), out)
    case = parse_yaml_mapping((out / "eval-plugin" / "evals" / "resume" / "case.yaml").read_text("utf-8"))
    assert case["execution"] == {"prompt": "What next?", "max_turns": 3, "append_system_prompt": CORE_TEXT}
    assert case["context"] == {"history_file": "history.jsonl"}
    assert (out / "eval-plugin" / "evals" / "resume" / "history.jsonl").is_file()


def test_skill_indicators_are_dropped_where_there_are_no_skills(tmp_path: Path) -> None:
    out = tmp_path / "build"
    build(sources(tmp_path), out)
    assert (out / "eval-plugin" / "evals" / "aggregation" / "graders" / "skill-fired.md").is_file()
    assert not (out / "eval-plugin-core" / "evals" / "aggregation" / "graders" / "skill-fired.md").exists()
    assert (out / "eval-plugin-core" / "evals" / "aggregation" / "graders" / "judge.md").is_file()
    full = parse_yaml_mapping((out / "eval-plugin" / "evals" / "resume" / "case.yaml").read_text("utf-8"))
    bare = parse_yaml_mapping((out / "eval-plugin-template" / "evals" / "resume" / "case.yaml").read_text("utf-8"))
    assert full["graders"] == parse_yaml_mapping(CASE_YAML)["graders"]
    assert bare["graders"] == [{"type": "regex", "name": "marker", "target": "last_message", "pattern": "QUOKKA"}]


def test_mocks_and_fixtures_are_copied_untouched_and_results_are_left_out(tmp_path: Path) -> None:
    out = tmp_path / "build"
    build(sources(tmp_path), out)
    evals = out / "eval-plugin" / "evals"
    assert (evals / "mocks" / "aqven" / "series_get.md").read_text("utf-8").startswith("---\nexpect:\n")
    assert (evals / "fixtures" / "lumen" / "prompt.md").read_text("utf-8") == "A fixture file, not a case.\n"
    assert not (evals / "results").exists()


def test_a_rebuild_replaces_the_previous_wrapper(tmp_path: Path) -> None:
    out = tmp_path / "build"
    stale = out / "eval-plugin" / "evals" / "gone" / "prompt.md"
    write(stale, "old\n")
    build(sources(tmp_path), out)
    assert not stale.exists()


def test_missing_inputs_are_listed_before_anything_is_written(tmp_path: Path) -> None:
    out = tmp_path / "build"
    with pytest.raises(BuildError) as raised:
        build(sources(tmp_path, host_block=False), out)
    assert str(raised.value) == "host block: pass --host-block FILE with the text of chat/host_block.py"
    assert not out.exists()


TRIGGER_PROMPT = '---\nruns: 3\nmax_turns: 4\ntags:\n- "trigger"\n---\nRename the node classify.\n'
TRIGGER_GRADER = '---\ntype: "tool_used"\ntool: "Skill"\ninput_match: "building-flows"\n---\n'
PAIRED_CASE = 'schema_version: "1.0"\nname: "staged"\ncontext:\n  scaffold_script: "scaffold.sh"\n'


def with_triggers(tmp_path: Path) -> Sources:
    found = sources(tmp_path)
    write(found.evals / "triggers" / "building-flows-rename" / "prompt.md", TRIGGER_PROMPT)
    write(found.evals / "triggers" / "building-flows-rename" / "graders" / "skill-fired.md", TRIGGER_GRADER)
    return found


def test_front_matter_carries_no_fence_so_the_cli_reads_the_whole_prompt(tmp_path: Path) -> None:
    out = tmp_path / "build"
    build(sources(tmp_path), out)
    text = (out / "eval-plugin" / "evals" / "aggregation" / "prompt.md").read_text("utf-8")
    front_matter = text.split("\n---\n", 1)[0].removeprefix("---\n")
    assert "---" not in front_matter
    assert system_prompt(out / "eval-plugin" / "evals" / "aggregation" / "prompt.md") == CORE_TEXT


def test_the_cases_suite_leaves_the_trigger_suite_out(tmp_path: Path) -> None:
    out = tmp_path / "build"
    report = build(with_triggers(tmp_path), out, SUITES[CASES_SUITE])
    assert report[0].split("\n")[0] == "eval-plugin: 3 cases"
    assert not (out / "eval-plugin" / "evals" / "triggers").exists()


def test_the_trigger_suite_builds_one_wrapper_with_skills_and_only_its_cases(tmp_path: Path) -> None:
    out = tmp_path / "build"
    found = with_triggers(tmp_path)
    report = build(replace(found, evals=found.evals / "triggers"), out, SUITES[TRIGGERS_SUITE])
    assert [line.split("\n")[0] for line in report] == ["eval-plugin-triggers: 1 cases"]
    assert "--ablation none" in report[0]
    wrapper = out / "eval-plugin-triggers"
    assert (wrapper / "skills" / "designing-experiments" / "SKILL.md").is_file()
    assert (wrapper / "evals" / "building-flows-rename" / "graders" / "skill-fired.md").is_file()
    assert not (wrapper / "evals" / "aggregation").exists()
    assert system_prompt(wrapper / "evals" / "building-flows-rename" / "prompt.md") == CORE_TEXT
    assert not (out / "eval-plugin").exists()


def test_a_case_yaml_next_to_a_prompt_gets_no_second_system_prompt(tmp_path: Path) -> None:
    out = tmp_path / "build"
    found = sources(tmp_path)
    write(found.evals / "aggregation" / "case.yaml", PAIRED_CASE)
    report = build(found, out)
    assert report[0].split("\n")[0] == "eval-plugin: 3 cases"
    case = parse_yaml_mapping((out / "eval-plugin" / "evals" / "aggregation" / "case.yaml").read_text("utf-8"))
    assert case == parse_yaml_mapping(PAIRED_CASE)
    assert system_prompt(out / "eval-plugin" / "evals" / "aggregation" / "prompt.md") == CORE_TEXT
