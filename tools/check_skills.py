import argparse
import ast
import importlib.util
import os
import re
import subprocess
import sys
from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from front_matter import Document, FrontMatterError, split_document

REPO_ROOT: Final = Path(__file__).resolve().parents[1]
PLUGIN_ROOT: Final = REPO_ROOT / "packages" / "aqven" / "src" / "aqven" / "agent_plugin"
SKILLS_FOLDER: Final = "skills"
SKILL_FILE: Final = "SKILL.md"
MANIFEST: Final = "references.txt"
REFERENCE_CITATION: Final = re.compile(r"\breferences/(?P<page>[a-z0-9-]+(?:/[a-z0-9-]+)*\.md)")
NAMES_MODULE: Final = REPO_ROOT / "packages" / "aqven" / "src" / "aqven" / "chat" / "agent_plugin.py"
NAMES_CONSTANT: Final = "SKILL_NAMES"
PLUGIN_NAME: Final = "aqven"
ALLOWED_KEYS: Final = frozenset({"name", "description"})
SKILL_NAME: Final = re.compile(r"^[a-z0-9-]{1,64}$")
MAX_DESCRIPTION: Final = 400
MAX_DESCRIPTIONS: Final = 4800
MAX_BODY_LINES: Final = 250
MAX_MUST_LINES: Final = 15
MUST_HEADING: Final = "## MUST"
SECTION_HEADING: Final = re.compile(r"^#{1,2} ")
TEXT_SUFFIXES: Final = frozenset({".md", ".txt", ".py", ".yaml", ".yml", ".json", ".toml", ".sh"})
FORBIDDEN: Final = (
    re.compile(r"\barms?\b", re.IGNORECASE),
    re.compile(r"arms/"),
    re.compile(r"subject\.arm"),
    re.compile(r"series_estimate"),
    re.compile(r"usd_source"),
    re.compile(r"E_ARM_UNKNOWN"),
    re.compile(r"E_STRICT_UNSUPPORTED"),
    re.compile(r"W_MODEL_UNPROFILED"),
    re.compile(r"^\s*capabilities:"),
)
OWNER_DOMAIN: Final = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"\bmy_flows?\b",
        r"\bzone_groups?\b",
        r"\bzones?\b",
        r"\blookers?\b",
        r"`gather`",
        r"[\"']gather[\"']",
        r"^\s*(?:-\s*)?gather\s*:",
        r"\bnodes/gather\b",
        r"\bgather\.(?:ya?ml|prompt\.md)\b",
        r"[\[,]\s*gather\s*[\],]",
        r"\bfaces?\b",
        r"\bskins?\b",
        r"\bcosmetics?\b",
        r"\bcosmetology\b",
        r"\bdermatolog\w*",
        r"\bredness\b",
        r"\bwrinkl\w*",
        r"\bdose[ _-]ladders?\b",
        r"\bSCIN\b",
    )
)
ALWAYS_ON_BUDGET: Final = 1300
ALWAYS_ON: Final = re.compile(r"Always-on:\s+~(?P<tokens>[\d,]+) tok")
SESSION_VARIABLE_PREFIXES: Final = ("CLAUDECODE", "CLAUDE_CODE_", "CLAUDE_PID", "CLAUDE_EFFORT", "CLAUDE_AGENT_SDK_")
CLI_TIMEOUT_SECONDS: Final = 120
PASSED: Final = "skills: every check passed"
EXIT_OK: Final = 0
EXIT_FAILED: Final = 1


@dataclass(frozen=True, slots=True)
class Skill:
    folder: Path
    document: Document | None
    problem: str | None

    @property
    def name(self) -> str:
        return self.folder.name


@dataclass(frozen=True, slots=True)
class SkillTree:
    root: Path
    skills: tuple[Skill, ...]
    declared_names: tuple[str, ...] | None


type Check = Callable[[SkillTree], list[str]]


def read_skill(folder: Path) -> Skill:
    path = folder / SKILL_FILE
    if not path.is_file():
        return Skill(folder, None, f"{folder.name}: no {SKILL_FILE}")
    try:
        return Skill(folder, split_document(path.read_text(encoding="utf-8")), None)
    except FrontMatterError as error:
        return Skill(folder, None, f"{folder.name}/{SKILL_FILE}: {error}")


def string_items(node: ast.expr) -> tuple[str, ...] | None:
    if not isinstance(node, ast.Tuple | ast.List):
        return None
    items = tuple(item.value for item in node.elts if isinstance(item, ast.Constant) and isinstance(item.value, str))
    return items if len(items) == len(node.elts) else None


def assigned_value(statement: ast.stmt, name: str) -> ast.expr | None:
    if isinstance(statement, ast.AnnAssign) and isinstance(statement.target, ast.Name) and statement.target.id == name:
        return statement.value
    if isinstance(statement, ast.Assign) and any(isinstance(t, ast.Name) and t.id == name for t in statement.targets):
        return statement.value
    return None


def declared_skill_names(module: Path) -> tuple[str, ...] | None:
    if not module.is_file():
        return None
    tree = ast.parse(module.read_text(encoding="utf-8"))
    values = (assigned_value(statement, NAMES_CONSTANT) for statement in tree.body)
    found = next((value for value in values if value is not None), None)
    return None if found is None else string_items(found)


def load_tree(plugin_root: Path, names_module: Path) -> SkillTree:
    root = plugin_root / SKILLS_FOLDER
    folders = sorted(path for path in root.iterdir() if path.is_dir() and not path.name.startswith((".", "_")))
    return SkillTree(root, tuple(read_skill(folder) for folder in folders), declared_skill_names(names_module))


def parsed(tree: SkillTree) -> Iterator[tuple[Skill, Document]]:
    return ((skill, skill.document) for skill in tree.skills if skill.document is not None)


def unreadable_skills(tree: SkillTree) -> list[str]:
    return [skill.problem for skill in tree.skills if skill.problem is not None]


def front_matter_problems(skill: Skill, document: Document) -> Iterator[str]:
    keys = frozenset(document.front_matter)
    if keys != ALLOWED_KEYS:
        yield f"{skill.name}: front matter keys must be exactly name and description, found {sorted(keys)}"
    name = document.front_matter.get("name")
    if name != skill.name:
        yield f"{skill.name}: name {name!r} differs from the folder name"
    if not SKILL_NAME.match(skill.name):
        yield f"{skill.name}: name must be 1 to 64 characters of a-z, 0-9 and -"
    description = document.front_matter.get("description")
    if not isinstance(description, str) or not description.strip():
        yield f"{skill.name}: description must be a non-empty string"
    if isinstance(description, str) and len(description) > MAX_DESCRIPTION:
        yield f"{skill.name}: description has {len(description)} characters, the limit is {MAX_DESCRIPTION}"


def front_matter(tree: SkillTree) -> list[str]:
    return [problem for skill, document in parsed(tree) for problem in front_matter_problems(skill, document)]


def description_length(document: Document) -> int:
    description = document.front_matter.get("description")
    return len(description) if isinstance(description, str) else 0


def description_budget(tree: SkillTree) -> list[str]:
    total = sum(description_length(document) for _, document in parsed(tree))
    if total <= MAX_DESCRIPTIONS:
        return []
    return [f"descriptions add up to {total} characters, the limit is {MAX_DESCRIPTIONS}"]


def declared_names(tree: SkillTree) -> list[str]:
    if tree.declared_names is None:
        return []
    folders = {skill.name for skill in tree.skills}
    declared = set(tree.declared_names)
    missing = [f"{NAMES_CONSTANT} lacks the skill folder {name}" for name in sorted(folders - declared)]
    extra = [f"{NAMES_CONSTANT} names {name}, which has no skill folder" for name in sorted(declared - folders)]
    return missing + extra


def must_block_lines(lines: Sequence[str]) -> int:
    following = lines[1:]
    end = next((index for index, line in enumerate(following) if SECTION_HEADING.match(line)), len(following))
    return sum(1 for line in following[:end] if line.strip())


def body_problems(skill: Skill, document: Document) -> Iterator[str]:
    lines = document.body.strip("\n").split("\n")
    if len(lines) > MAX_BODY_LINES:
        yield f"{skill.name}: body has {len(lines)} lines, the limit is {MAX_BODY_LINES}"
    if lines[0] != MUST_HEADING:
        yield f"{skill.name}: the body must open with {MUST_HEADING}, found {lines[0]!r}"
        return
    must = must_block_lines(lines)
    if must > MAX_MUST_LINES:
        yield f"{skill.name}: the MUST block has {must} lines, the limit is {MAX_MUST_LINES}"


def body_shape(tree: SkillTree) -> list[str]:
    return [problem for skill, document in parsed(tree) for problem in body_problems(skill, document)]


def text_files(root: Path) -> Iterator[Path]:
    return (path for path in sorted(root.rglob("*")) if path.is_file() and path.suffix in TEXT_SUFFIXES)


def matches_in(path: Path, root: Path, patterns: Sequence[re.Pattern[str]], label: str) -> Iterator[str]:
    relative = path.relative_to(root).as_posix()
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        found = [match.group(0).strip() for pattern in patterns if (match := pattern.search(line)) is not None]
        if found:
            yield f"{relative}:{number}: {label} {', '.join(repr(word) for word in found)}"


def word_guard(patterns: Sequence[re.Pattern[str]], label: str) -> Check:
    def guard(tree: SkillTree) -> list[str]:
        return [problem for path in text_files(tree.root) for problem in matches_in(path, tree.root, patterns, label)]

    return guard


forbidden_words: Final = word_guard(FORBIDDEN, "forbidden")
owner_domain_words: Final = word_guard(OWNER_DOMAIN, "owner-project word")


def manifest_pages(folder: Path) -> set[str]:
    manifest = folder / MANIFEST
    if not manifest.is_file():
        return set()
    return {line.strip() for line in manifest.read_text(encoding="utf-8").splitlines() if line.strip()}


def citation_problems(skill: Skill, document: Document) -> Iterator[str]:
    cited = {match.group("page") for match in REFERENCE_CITATION.finditer(document.body)}
    listed = manifest_pages(skill.folder)
    for page in sorted(cited - listed):
        yield f"{skill.name}: {SKILL_FILE} cites references/{page}, which {MANIFEST} does not list"
    for page in sorted(listed - cited):
        yield f"{skill.name}: {MANIFEST} lists {page}, which {SKILL_FILE} never cites"


def reference_citations(tree: SkillTree) -> list[str]:
    return [problem for skill, document in parsed(tree) for problem in citation_problems(skill, document)]


FILE_CHECKS: Final[tuple[Check, ...]] = (
    unreadable_skills,
    front_matter,
    description_budget,
    declared_names,
    body_shape,
    forbidden_words,
    owner_domain_words,
    reference_citations,
)


def bundled_cli() -> Path | None:
    spec = importlib.util.find_spec("claude_agent_sdk")
    if spec is None or spec.origin is None:
        return None
    candidate = Path(spec.origin).parent / "_bundled" / "claude"
    return candidate if candidate.is_file() else None


def isolated_environment() -> Mapping[str, str]:
    return {key: value for key, value in os.environ.items() if not key.startswith(SESSION_VARIABLE_PREFIXES)}


def run_cli(cli: Path, arguments: Sequence[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(cli), *arguments],
        capture_output=True,
        text=True,
        check=False,
        timeout=CLI_TIMEOUT_SECONDS,
        env=dict(isolated_environment()),
    )


def strict_validation(cli: Path, plugin_root: Path) -> list[str]:
    result = run_cli(cli, ["plugin", "validate", "--strict", str(plugin_root)])
    if result.returncode == EXIT_OK:
        return []
    return [f"claude plugin validate --strict failed:\n{result.stdout}{result.stderr}".rstrip()]


def always_on_tokens(details: str) -> int | None:
    match = ALWAYS_ON.search(details)
    return None if match is None else int(match.group("tokens").replace(",", ""))


def always_on_cost(cli: Path, plugin_root: Path, budget: int) -> list[str]:
    result = run_cli(cli, ["--plugin-dir", str(plugin_root), "plugin", "details", PLUGIN_NAME])
    tokens = always_on_tokens(result.stdout)
    if tokens is None:
        return [f"claude plugin details printed no Always-on line:\n{result.stdout}{result.stderr}".rstrip()]
    if tokens <= budget:
        return []
    return [f"the skill list costs ~{tokens} tokens in every session, the budget is {budget}"]


def cli_problems(plugin_root: Path, budget: int) -> list[str]:
    cli = bundled_cli()
    if cli is None:
        return ["the Claude CLI bundled with claude-agent-sdk is not installed"]
    return [*strict_validation(cli, plugin_root), *always_on_cost(cli, plugin_root, budget)]


def problems(tree: SkillTree) -> list[str]:
    return [problem for check in FILE_CHECKS for problem in check(tree)]


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="check the aqven skills: front matter, size, words, references")
    parser.add_argument("--cli", action="store_true", help="also run plugin validate --strict and plugin details")
    parser.add_argument("--budget", type=int, default=ALWAYS_ON_BUDGET, help="Always-on token budget with --cli")
    arguments = parser.parse_args(argv)
    found = problems(load_tree(PLUGIN_ROOT, NAMES_MODULE))
    if arguments.cli:
        found.extend(cli_problems(PLUGIN_ROOT, arguments.budget))
    if found:
        print("\n".join(found), file=sys.stderr)
        return EXIT_FAILED
    print(PASSED)
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
