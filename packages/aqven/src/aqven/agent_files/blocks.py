import re
from dataclasses import dataclass
from typing import Final

from aqven.agent_files.place import Action, AgentPlace, Change, Drift, read_text, write_text

BLOCK_PATTERN: Final = re.compile(r"^<!-- aqven:begin (?P<version>\S*) -->\n.*?^<!-- aqven:end -->\n?", re.M | re.S)
HEADING_PATTERN: Final = re.compile(r"^## .+$", re.M)
BLOCK_ADDED: Final = (
    "the aqven block is now on top and your earlier text is kept below it: delete what the block replaces"
)
OWNER_NOTE: Final = "; keep your own rules under ## Owner's rules"


@dataclass(frozen=True, slots=True)
class BlockTemplate:
    block: str
    tail: str

    @classmethod
    def of(cls, text: str) -> BlockTemplate:
        found = BLOCK_PATTERN.search(text)
        if found is None:
            raise ValueError("an agent rules template has no aqven block")
        return cls(found.group(0), text[found.end() :])

    @property
    def text(self) -> str:
        return f"{self.block}{self.tail}"

    def missing_tail(self, text: str) -> str:
        heading = HEADING_PATTERN.search(self.tail)
        if heading is None or heading.group(0) in text.splitlines():
            return ""
        return self.tail


def with_tail(text: str, tail: str) -> str:
    if not tail:
        return text
    separator = "" if text.endswith("\n") else "\n"
    return f"{text}{separator}{tail}"


@dataclass(frozen=True, slots=True)
class ManagedBlock:
    name: str

    def expected(self, place: AgentPlace) -> BlockTemplate:
        return BlockTemplate.of(place.template(self.name))

    def present(self, place: AgentPlace) -> bool:
        text = read_text(place.path(self.name))
        return text is not None and BLOCK_PATTERN.search(text) is not None

    def drift(self, place: AgentPlace) -> tuple[Drift, ...]:
        problem = self.problem(place)
        return () if problem is None else (Drift(self.name, problem),)

    def problem(self, place: AgentPlace) -> str | None:
        text = read_text(place.path(self.name))
        if text is None:
            return "is missing"
        found = BLOCK_PATTERN.search(text)
        if found is None:
            return "has no aqven block"
        if found.group("version") != place.version:
            return f"has the aqven block of aqven {found.group('version')}"
        return (
            None
            if found.group(0) == self.expected(place).block
            else "has an aqven block that differs from the installed engine"
        )

    def sync(self, place: AgentPlace) -> tuple[Change, ...]:
        if self.problem(place) is None:
            return ()
        path = place.path(self.name)
        template = self.expected(place)
        text = read_text(path)
        if text is None:
            write_text(path, template.text)
            return (Change(Action.WROTE, self.name, "new file"),)
        found = BLOCK_PATTERN.search(text)
        if found is None:
            write_text(path, with_tail(f"{template.block}\n{text}", template.missing_tail(text)))
            return (Change(Action.WROTE, self.name, f"{BLOCK_ADDED}{OWNER_NOTE if template.tail else ''}"),)
        write_text(path, f"{text[: found.start()]}{template.block}{text[found.end() :]}")
        return (Change(Action.WROTE, self.name, f"aqven block of aqven {place.version}"),)
