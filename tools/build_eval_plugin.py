import argparse
import json
import shutil
import sys
from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from front_matter import FrontMatterError, parse_yaml_mapping, split_document
from pydantic import JsonValue
from set_version import ENGINE, declared

REPO_ROOT: Final = Path(__file__).resolve().parents[1]
PACKAGE_ROOT: Final = REPO_ROOT / "packages" / "aqven" / "src" / "aqven"
PLUGIN_ROOT: Final = PACKAGE_ROOT / "agent_plugin"
SHOWCASE: Final = PACKAGE_ROOT / "templates" / "showcase"
EVALS: Final = REPO_ROOT / "evals" / "agent-skills"
BUILD_ROOT: Final = REPO_ROOT / "build"
TEMPLATE_AGENTS: Final = EVALS / "baseline" / "AGENTS.md.tmpl"
MCP_TEMPLATE: Final = SHOWCASE / "dot-mcp.json.tmpl"
CORE_AGENTS: Final = PLUGIN_ROOT / "project" / "AGENTS.md.tmpl"
MANIFEST_FOLDER: Final = ".claude-plugin"
SKILLS_FOLDER: Final = "skills"
EVALS_FOLDER: Final = "evals"
TRIGGERS_FOLDER: Final = "triggers"
MCP_CONFIG: Final = ".mcp.json"
CASE_PROMPT: Final = "prompt.md"
CASE_FILE: Final = "case.yaml"
GRADERS_FOLDER: Final = "graders"
MOCKS_FOLDER: Final = "mocks"
SKIPPED_PARTS: Final = frozenset({"__pycache__", ".DS_Store"})
RESULTS_FOLDER: Final = "results"
SKILL_TOOL: Final = "Skill"
TOOL_USED: Final = "tool_used"
SYSTEM_PROMPT_KEY: Final = "append_system_prompt"
EXECUTION_KEY: Final = "execution"
GRADERS_KEY: Final = "graders"
PACKAGE_TOKEN: Final = "__package__"
DEFAULT_PACKAGE: Final = "lumen"
FENCE: Final = "---"
ESCAPED_FENCE: Final = "-\\u002d-"
CASES_SUITE: Final = "cases"
TRIGGERS_SUITE: Final = "triggers"
DEFAULT_URL: Final = "http://127.0.0.1:5180"
PART_SEPARATOR: Final = "\n\n"
ENCODING: Final = "utf-8"
EVAL_MODEL: Final = "claude-haiku-4-5"
EXIT_OK: Final = 0
EXIT_FAILED: Final = 1


class BuildError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class Sources:
    plugin: Path
    evals: Path
    template_agents: Path
    mcp_template: Path
    core: Path
    host_block: Path | None
    package: str
    project_root: str
    url: str
    version: str


@dataclass(frozen=True, slots=True)
class Setup:
    folder: str
    with_skills: bool
    ablation: str
    compose: Callable[[Sources], str]


def read(path: Path) -> str:
    return path.read_text(encoding=ENCODING)


def filled(path: Path, sources: Sources) -> str:
    values = {
        PACKAGE_TOKEN: sources.package,
        "<project_root>": sources.project_root,
        "<url>": sources.url,
        "<version>": sources.version,
    }
    text = read(path)
    for placeholder, value in values.items():
        text = text.replace(placeholder, value)
    return text.strip()


def template_prompt(sources: Sources) -> str:
    return filled(sources.template_agents, sources)


def core_prompt(sources: Sources) -> str:
    if sources.host_block is None:
        raise BuildError("no host block: pass --host-block FILE")
    return PART_SEPARATOR.join((filled(sources.core, sources), filled(sources.host_block, sources)))


@dataclass(frozen=True, slots=True)
class Suite:
    evals: Path
    setups: tuple[Setup, ...]
    excluded: frozenset[str]


SETUPS: Final = (
    Setup("eval-plugin", True, "with-without", core_prompt),
    Setup("eval-plugin-core", False, "none", core_prompt),
    Setup("eval-plugin-template", False, "none", template_prompt),
)
TRIGGER_SETUPS: Final = (Setup("eval-plugin-triggers", True, "none", core_prompt),)
SUITES: Final = {
    CASES_SUITE: Suite(EVALS, SETUPS, frozenset({TRIGGERS_FOLDER})),
    TRIGGERS_SUITE: Suite(EVALS / TRIGGERS_FOLDER, TRIGGER_SETUPS, frozenset()),
}


def missing_inputs(sources: Sources) -> list[str]:
    required = {
        "agent plugin": sources.plugin / MANIFEST_FOLDER / "plugin.json",
        "eval cases": sources.evals,
        "template AGENTS.md": sources.template_agents,
        "MCP config template": sources.mcp_template,
        "core AGENTS.md": sources.core,
    }
    found = [f"{label}: {path} does not exist" for label, path in required.items() if not path.exists()]
    if sources.host_block is None:
        found.append("host block: pass --host-block FILE with the text of chat/host_block.py")
    if sources.host_block is not None and not sources.host_block.is_file():
        found.append(f"host block: {sources.host_block} does not exist")
    return found


def yaml_scalar(value: JsonValue) -> str:
    return json.dumps(value, ensure_ascii=False).replace(FENCE, ESCAPED_FENCE)


def yaml_lines(mapping: Mapping[str, JsonValue]) -> str:
    return "".join(f"{key}: {yaml_scalar(value)}\n" for key, value in mapping.items())


def joined_prompt(prompt: str, own: JsonValue) -> str:
    return prompt if not isinstance(own, str) or not own.strip() else f"{prompt}{PART_SEPARATOR}{own.strip()}"


def is_skill_indicator(grader: JsonValue) -> bool:
    return isinstance(grader, dict) and grader.get("type") == TOOL_USED and grader.get("tool") == SKILL_TOOL


def prompt_case(text: str, prompt: str) -> str:
    document = split_document(text)
    front_matter = dict(document.front_matter)
    front_matter[SYSTEM_PROMPT_KEY] = joined_prompt(prompt, front_matter.get(SYSTEM_PROMPT_KEY))
    return f"---\n{yaml_lines(front_matter)}---\n{document.body}"


def with_system_prompt(execution: JsonValue, prompt: str) -> dict[str, JsonValue]:
    settings: dict[str, JsonValue] = dict(execution) if isinstance(execution, dict) else {}
    settings[SYSTEM_PROMPT_KEY] = joined_prompt(prompt, settings.get(SYSTEM_PROMPT_KEY))
    return settings


def yaml_case(text: str, prompt: str | None, with_skills: bool) -> str:
    case = parse_yaml_mapping(text)
    if prompt is not None:
        case[EXECUTION_KEY] = with_system_prompt(case.get(EXECUTION_KEY), prompt)
    graders = case.get(GRADERS_KEY)
    if not with_skills and isinstance(graders, list):
        case[GRADERS_KEY] = [grader for grader in graders if not is_skill_indicator(grader)]
    return yaml_lines(case)


def skill_indicator_file(text: str) -> bool:
    return is_skill_indicator(dict(split_document(text).front_matter))


def eval_files(evals: Path, excluded: frozenset[str]) -> Iterator[Path]:
    for path in sorted(evals.rglob("*")):
        relative = path.relative_to(evals)
        top = relative.parts[0]
        skipped = top == RESULTS_FOLDER or top in excluded or SKIPPED_PARTS.intersection(relative.parts)
        if path.is_file() and not skipped:
            yield path


def is_case_prompt(source: Path, relative: Path) -> bool:
    return relative.name == CASE_PROMPT and (source.parent / GRADERS_FOLDER).is_dir()


def is_case_file(relative: Path) -> bool:
    return relative.name == CASE_FILE and MOCKS_FOLDER not in relative.parts


def has_case_prompt(source: Path) -> bool:
    prompt = source.parent / CASE_PROMPT
    return prompt.is_file() and is_case_prompt(prompt, Path(CASE_PROMPT))


def is_grader(relative: Path) -> bool:
    return relative.parent.name == GRADERS_FOLDER and relative.suffix == ".md"


def copy_evals(sources: Sources, target: Path, prompt: str, with_skills: bool, excluded: frozenset[str]) -> int:
    cases = 0
    for source in eval_files(sources.evals, excluded):
        relative = source.relative_to(sources.evals)
        destination = target / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        if is_case_prompt(source, relative):
            destination.write_text(prompt_case(read(source), prompt), encoding=ENCODING)
            cases += 1
            continue
        if is_case_file(relative):
            paired = has_case_prompt(source)
            destination.write_text(yaml_case(read(source), None if paired else prompt, with_skills), encoding=ENCODING)
            cases += 0 if paired else 1
            continue
        if not with_skills and is_grader(relative) and skill_indicator_file(read(source)):
            continue
        shutil.copy2(source, destination)
    return cases


def copy_plugin(sources: Sources, target: Path, with_skills: bool) -> None:
    ignored = shutil.ignore_patterns(*SKIPPED_PARTS)
    shutil.copytree(sources.plugin / MANIFEST_FOLDER, target / MANIFEST_FOLDER, ignore=ignored)
    if with_skills:
        shutil.copytree(sources.plugin / SKILLS_FOLDER, target / SKILLS_FOLDER, ignore=ignored)
    (target / MCP_CONFIG).write_text(
        read(sources.mcp_template).replace(PACKAGE_TOKEN, sources.package), encoding=ENCODING
    )


def build_setup(sources: Sources, build_root: Path, setup: Setup, excluded: frozenset[str]) -> int:
    target = build_root / setup.folder
    shutil.rmtree(target, ignore_errors=True)
    target.mkdir(parents=True)
    copy_plugin(sources, target, setup.with_skills)
    return copy_evals(sources, target / EVALS_FOLDER, setup.compose(sources), setup.with_skills, excluded)


def run_command(build_root: Path, setup: Setup) -> str:
    target = build_root / setup.folder
    return (
        f"<bundled claude> plugin eval {target} --ablation {setup.ablation} --trust-plugin --no-publish -j 2 "
        f"--model {EVAL_MODEL} --judge-model {EVAL_MODEL} --max-cost-usd 20 --json {target / 'results.json'}"
    )


def build(sources: Sources, build_root: Path, suite: Suite = SUITES[CASES_SUITE]) -> list[str]:
    missing = missing_inputs(sources)
    if missing:
        raise BuildError("\n".join(missing))
    lines: list[str] = []
    for setup in suite.setups:
        cases = build_setup(sources, build_root, setup, suite.excluded)
        lines.append(f"{setup.folder}: {cases} cases\n  {run_command(build_root, setup)}")
    return lines


def optional_path(value: str | None) -> Path | None:
    return None if value is None else Path(value).resolve()


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="build the plugin wrappers that claude plugin eval runs")
    parser.add_argument(
        "--suite",
        choices=sorted(SUITES),
        default=CASES_SUITE,
        help="cases: the behaviour cases in three setups; triggers: which skill fires, with skills only",
    )
    parser.add_argument("--evals", default=None, help="eval cases, mocks and fixtures; defaults to the suite's folder")
    parser.add_argument("--core", default=str(CORE_AGENTS), help="core AGENTS.md template")
    parser.add_argument("--template", default=str(TEMPLATE_AGENTS), help="the AGENTS.md template shipped today")
    parser.add_argument("--host-block", default=None, help="text of the Studio host block")
    parser.add_argument("--package", default=DEFAULT_PACKAGE, help="package name of the fixture project")
    parser.add_argument("--project-root", default=None, help="project root named in the host block")
    parser.add_argument("--url", default=DEFAULT_URL, help="project server URL named in the host block")
    parser.add_argument("--out", default=str(BUILD_ROOT), help="folder that receives the wrappers")
    arguments = parser.parse_args(argv)
    package = str(arguments.package)
    suite = SUITES[str(arguments.suite)]
    sources = Sources(
        plugin=PLUGIN_ROOT,
        evals=Path(arguments.evals or suite.evals).resolve(),
        template_agents=Path(arguments.template).resolve(),
        mcp_template=MCP_TEMPLATE,
        core=Path(arguments.core).resolve(),
        host_block=optional_path(arguments.host_block),
        package=package,
        project_root=arguments.project_root or f"/workspace/{package}",
        url=str(arguments.url),
        version=declared(ENGINE),
    )
    try:
        report = build(sources, Path(arguments.out).resolve(), suite)
    except (BuildError, FrontMatterError) as error:
        print(error, file=sys.stderr)
        return EXIT_FAILED
    print("\n".join(report))
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
