import logging
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from importlib.resources import files
from pathlib import Path
from typing import Final, Protocol

from claude_agent_sdk.types import SdkPluginConfig
from pydantic import Field

from aqven.chat.claude_wire import WireModel, parse_wire
from aqven.chat.env_guard import rule_path

PLUGIN_PACKAGE: Final = "aqven"
PLUGIN_FOLDER: Final = "agent_plugin"
SKILLS_FOLDER: Final = "skills"
PLUGIN_NAME: Final = "aqven"
SKILL_SEPARATOR: Final = ":"
SKILL_NAMES: Final[tuple[str, ...]] = (
    "analyzing-failures",
    "building-datasets",
    "building-flows",
    "choosing-models",
    "debugging-runs",
    "designing-experiments",
    "designing-output-contracts",
    "hardening-flows",
    "preparing-media-inputs",
    "reporting-results",
    "running-series",
    "running-the-engineering-loop",
)
SKILLS_LOGGER: Final = logging.getLogger("aqven.chat.skills")


def agent_plugin_root() -> Path:
    return Path(str(files(PLUGIN_PACKAGE) / PLUGIN_FOLDER))


def agent_skills_root() -> Path:
    return agent_plugin_root() / SKILLS_FOLDER


def plugin_skill(name: str) -> str:
    return f"{PLUGIN_NAME}{SKILL_SEPARATOR}{name}"


def bare_skill(name: str) -> str:
    return name.removeprefix(f"{PLUGIN_NAME}{SKILL_SEPARATOR}")


PLUGIN_SKILLS: Final[tuple[str, ...]] = tuple(plugin_skill(name) for name in SKILL_NAMES)


def claude_plugins() -> list[SdkPluginConfig]:
    return [SdkPluginConfig(type="local", path=str(agent_plugin_root()))]


def claude_skills() -> list[str]:
    return list(PLUGIN_SKILLS)


def plugin_read_rules() -> tuple[str, ...]:
    return (f"Read({rule_path(agent_plugin_root())}/**)",)


class SkillFrontmatterWire(WireModel):
    name: str


class SkillUsageWire(WireModel):
    frontmatter: tuple[SkillFrontmatterWire, ...] = Field(default=(), alias="skillFrontmatter")


class ContextUsageWire(WireModel):
    skills: SkillUsageWire | None = None


def context_skill_names(usage: Mapping[str, object]) -> tuple[str, ...]:
    wire = parse_wire(ContextUsageWire, usage)
    if wire is None or wire.skills is None:
        return ()
    return tuple(entry.name for entry in wire.skills.frontmatter)


@dataclass(frozen=True, slots=True)
class SkillLoadReport:
    host: str
    loaded: frozenset[str]

    @classmethod
    def of(cls, host: str, names: Iterable[str]) -> SkillLoadReport:
        return cls(host, frozenset(names) & frozenset(PLUGIN_SKILLS))

    @property
    def missing(self) -> tuple[str, ...]:
        return tuple(name for name in PLUGIN_SKILLS if name not in self.loaded)

    def log(self, logger: logging.Logger = SKILLS_LOGGER) -> None:
        names = ", ".join(sorted(bare_skill(name) for name in self.loaded)) or "none"
        counted = f"{self.host} chat loaded {len(self.loaded)} of {len(PLUGIN_SKILLS)} {PLUGIN_NAME} skills: {names}"
        if not self.missing:
            logger.info(counted)
            return
        missing = ", ".join(bare_skill(name) for name in self.missing)
        logger.error("%s; missing: %s (plugin %s)", counted, missing, agent_plugin_root())


class ContextUsageSource(Protocol):
    async def get_context_usage(self) -> Mapping[str, object]: ...


async def report_claude_skills(client: ContextUsageSource, logger: logging.Logger = SKILLS_LOGGER) -> None:
    try:
        usage = await client.get_context_usage()
    except Exception as error:
        logger.warning("Claude chat could not list its loaded skills: %s", error)
        return
    SkillLoadReport.of("Claude", context_skill_names(usage)).log(logger)
