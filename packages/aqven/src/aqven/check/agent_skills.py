from collections.abc import Iterable, Iterator
from typing import Final

from aqven.agent_files import MANIFEST_FILE, AgentPlace, Drift, ManagedBlock, rule_targets, skill_targets
from aqven.check.context import CheckContext
from aqven.diagnostics import Diagnostic, DiagnosticCode, templated_diagnostic

COPIES_TARGET: Final = "the skill copies of .agents/skills and .claude/skills"
LISTED_DRIFTS: Final = 3


def listed(drifts: tuple[Drift, ...]) -> str:
    shown = "; ".join(drift.line() for drift in drifts[:LISTED_DRIFTS])
    more = len(drifts) - LISTED_DRIFTS
    return shown if more <= 0 else f"{shown}; and {more} more"


def stale(place: AgentPlace, file: str, target: str, drifts: tuple[Drift, ...]) -> Iterator[Diagnostic]:
    if not drifts:
        return
    values = {"target": target, "version": place.version, "problem": listed(drifts), "package": place.package}
    yield templated_diagnostic(DiagnosticCode.W_AGENT_SKILLS_STALE, place.from_root(file), (), values)


def copies_drift(place: AgentPlace) -> Iterator[Diagnostic]:
    if not place.path(MANIFEST_FILE).is_file():
        return
    drifts = tuple(drift for target in skill_targets(place) for drift in target.drift(place))
    yield from stale(place, MANIFEST_FILE.as_posix(), COPIES_TARGET, drifts)


def block_drift(place: AgentPlace, block: ManagedBlock) -> Iterator[Diagnostic]:
    if not block.present(place):
        return
    yield from stale(place, block.name, f"the aqven block of {block.name}", block.drift(place))


def check_agent_skills(context: CheckContext) -> Iterable[Diagnostic]:
    place = AgentPlace.of(context.project.root)
    blocks = (item for block in rule_targets() for item in block_drift(place, block))
    return (*copies_drift(place), *blocks)
