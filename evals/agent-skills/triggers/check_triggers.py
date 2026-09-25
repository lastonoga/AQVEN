import argparse
import json
import sys
from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Protocol, cast

from pydantic import JsonValue, TypeAdapter, ValidationError
from ruamel.yaml import YAML
from ruamel.yaml.error import YAMLError

TRIGGERS: Final = Path(__file__).resolve().parent
REPO_ROOT: Final = TRIGGERS.parents[2]
SKILLS: Final = REPO_ROOT / "packages" / "aqven" / "src" / "aqven" / "agent_plugin" / "skills"
PLUGIN: Final = "aqven"
SKILL_FILE: Final = "SKILL.md"
PROMPT: Final = "prompt.md"
GRADERS: Final = "graders"
SEPARATOR: Final = "--"
TRIGGER_TAG: Final = "trigger"
SKILL_TOOL: Final = "Skill"
CASES_PER_SKILL: Final = 2
FENCE: Final = "---"
ALLOWED_KEYS: Final = frozenset({"description", "tags", "runs", "max_turns", "timeout_seconds", "allowed_tools"})
READ_ONLY_TOOLS: Final = frozenset({SKILL_TOOL, "Read", "Glob", "Grep", "TodoWrite"})
MAPPING: Final = TypeAdapter(dict[str, JsonValue])
ENCODING: Final = "utf-8"
EXIT_OK: Final = 0
EXIT_FAILED: Final = 1


class _SafeLoader(Protocol):
    def load(self, stream: str) -> object: ...


class TriggerError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class Case:
    folder: Path
    front_matter: Mapping[str, JsonValue]
    body: str

    @property
    def name(self) -> str:
        return self.folder.name

    @property
    def skill(self) -> str:
        return self.name.split(SEPARATOR, 1)[0]


def skill_names(skills: Path) -> list[str]:
    return sorted(path.parent.name for path in skills.glob(f"*/{SKILL_FILE}"))


def invocation() -> str:
    return f'"skill":\\s*"(?:{PLUGIN}:)?'


def skill_fired(skill: str) -> str:
    return f'---\ntype: "tool_used"\ntool: "{SKILL_TOOL}"\ninput_match: "\\"({PLUGIN}:)?{skill}\\""\nweight: 2\n---\n'


def no_other_skill_first(skill: str, skills: Sequence[str]) -> str:
    others = "|".join(name for name in skills if name != skill)
    pattern = f'{invocation()}(?:{others})"[\\s\\S]*{invocation()}{skill}"'
    return f'---\ntype: "regex"\ntarget: "trace"\nmatch: "not_contains"\n---\n{pattern}\n'


def graders_of(skill: str, skills: Sequence[str]) -> dict[str, str]:
    return {"skill-fired.md": skill_fired(skill), "no-other-skill-first.md": no_other_skill_first(skill, skills)}


def parsed_front_matter(text: str) -> dict[str, JsonValue]:
    try:
        loaded = cast(_SafeLoader, YAML(typ="safe", pure=True)).load(text)
        return MAPPING.validate_python(loaded if loaded is not None else {})
    except (YAMLError, ValidationError) as error:
        raise TriggerError(f"front matter is not a YAML mapping: {error}") from error


def read_case(folder: Path) -> Case:
    lines = (folder / PROMPT).read_text(encoding=ENCODING).split("\n")
    closing = next((index for index, line in enumerate(lines[1:], start=1) if line.rstrip() == FENCE), None)
    if lines[0].rstrip() != FENCE or closing is None:
        raise TriggerError(f"{folder.name}/{PROMPT}: front matter must open and close with {FENCE}")
    front_matter = parsed_front_matter("\n".join(lines[1:closing]))
    return Case(folder, front_matter, "\n".join(lines[closing + 1 :]))


def case_folders(triggers: Path) -> Iterator[Path]:
    for prompt in sorted(triggers.glob(f"*/{PROMPT}")):
        yield prompt.parent


def string_list(value: JsonValue) -> list[str]:
    return [item for item in value if isinstance(item, str)] if isinstance(value, list) else []


def unknown_keys(case: Case, skills: Sequence[str]) -> list[str]:
    extra = sorted(set(case.front_matter) - ALLOWED_KEYS)
    return [f"{case.name}: unknown front matter keys {extra}"] if extra else []


def tags_name_the_skill(case: Case, skills: Sequence[str]) -> list[str]:
    expected = [TRIGGER_TAG, case.skill]
    problems = [] if case.skill in skills else [f"{case.name}: {case.skill} is not a skill of the {PLUGIN} plugin"]
    if string_list(case.front_matter.get("tags")) != expected:
        problems.append(f"{case.name}: tags must be {expected}")
    return problems


def tools_are_read_only(case: Case, skills: Sequence[str]) -> list[str]:
    tools = string_list(case.front_matter.get("allowed_tools"))
    extra = sorted(set(tools) - READ_ONLY_TOOLS)
    problems = [f"{case.name}: a trigger case writes nothing, drop {extra}"] if extra else []
    if SKILL_TOOL not in tools:
        problems.append(f"{case.name}: allowed_tools must hold {SKILL_TOOL}")
    return problems


def no_fence_in_values(case: Case, skills: Sequence[str]) -> list[str]:
    text = json.dumps(case.front_matter, ensure_ascii=False)
    return [f"{case.name}: the CLI ends front matter at any {FENCE}"] if FENCE in text else []


def has_prompt(case: Case, skills: Sequence[str]) -> list[str]:
    return [] if case.body.strip() else [f"{case.name}: {PROMPT} has no user message"]


def graders_are_current(case: Case, skills: Sequence[str]) -> list[str]:
    folder = case.folder / GRADERS
    expected = graders_of(case.skill, skills)
    present = {path.name: path.read_text(encoding=ENCODING) for path in sorted(folder.glob("*.md"))}
    if present == expected:
        return []
    return [f"{case.name}: graders differ from the rendered ones, run with --write"]


CASE_CHECKS: Final[tuple[Callable[[Case, Sequence[str]], list[str]], ...]] = (
    unknown_keys,
    tags_name_the_skill,
    tools_are_read_only,
    no_fence_in_values,
    has_prompt,
    graders_are_current,
)


def coverage(cases: Sequence[Case], skills: Sequence[str]) -> list[str]:
    counts = {skill: sum(1 for case in cases if case.skill == skill) for skill in skills}
    return [
        f"{skill}: {count} trigger cases, at least {CASES_PER_SKILL} needed"
        for skill, count in counts.items()
        if count < CASES_PER_SKILL
    ]


def problems_of(triggers: Path, skills: Sequence[str]) -> list[str]:
    cases = [read_case(folder) for folder in case_folders(triggers)]
    found = [problem for case in cases for check in CASE_CHECKS for problem in check(case, skills)]
    return found + coverage(cases, skills)


def write_graders(triggers: Path, skills: Sequence[str]) -> int:
    folders = list(case_folders(triggers))
    for folder in folders:
        target = folder / GRADERS
        target.mkdir(exist_ok=True)
        for name, text in graders_of(folder.name.split(SEPARATOR, 1)[0], skills).items():
            (target / name).write_text(text, encoding=ENCODING)
    return len(folders)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="check the skill trigger cases against the skills of the plugin")
    parser.add_argument("--triggers", default=str(TRIGGERS), help="folder of trigger cases")
    parser.add_argument("--skills", default=str(SKILLS), help="skills folder of the aqven plugin")
    parser.add_argument("--write", action="store_true", help="render the graders of every case from its skill")
    arguments = parser.parse_args(argv)
    triggers = Path(arguments.triggers)
    skills = skill_names(Path(arguments.skills))
    if arguments.write:
        print(f"graders written for {write_graders(triggers, skills)} trigger cases")
    try:
        problems = problems_of(triggers, skills)
    except TriggerError as error:
        print(error, file=sys.stderr)
        return EXIT_FAILED
    if problems:
        print("\n".join(problems), file=sys.stderr)
        return EXIT_FAILED
    print(f"trigger cases: {len(list(case_folders(triggers)))} cases cover {len(skills)} skills")
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
