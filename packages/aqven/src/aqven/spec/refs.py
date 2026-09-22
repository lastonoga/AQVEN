import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Final

from aqven.spec.names import NodeId, RunContextKey


class RefRoot(StrEnum):
    INPUT = "input"
    IN = "in"
    OUT = "out"
    ITEM = "item"
    INDEX = "index"
    CASE = "case"
    ACC = "acc"
    ITER = "iter"
    LOOP = "loop"
    BRANCH = "branch"
    OK = "ok"
    FAILED = "failed"
    RUN_CONTEXT = "run_context"
    NODE = "node"


@dataclass(frozen=True, slots=True)
class FieldStep:
    name: str

    def __str__(self) -> str:
        return f".{self.name}"


@dataclass(frozen=True, slots=True)
class LiftStep:
    def __str__(self) -> str:
        return "[*]"


@dataclass(frozen=True, slots=True)
class IndexStep:
    index: int

    def __str__(self) -> str:
        return f"[{self.index}]"


type RefStep = FieldStep | LiftStep | IndexStep


@dataclass(frozen=True, slots=True)
class Ref:
    root: RefRoot
    node_id: NodeId | None
    key: str | None
    steps: tuple[RefStep, ...]

    def __str__(self) -> str:
        return f"{_head_text(self)}{''.join(str(step) for step in self.steps)}"


class RefSyntaxError(ValueError):
    def __init__(self, text: str, position: int, reason: str) -> None:
        super().__init__(f"{text!r}, position {position}: {reason}")
        self.text = text
        self.position = position
        self.reason = reason


@dataclass(frozen=True, slots=True)
class _Head:
    root: RefRoot
    node_id: NodeId | None
    key: str | None
    end: int


IDENTIFIER: Final = re.compile(r"[a-z][a-z0-9_]{0,62}")
IDENTIFIER_TAIL: Final = re.compile(r"[a-z0-9_]")
STEP: Final = re.compile(r"\.(?P<field>[a-z][a-z0-9_]{0,62})|(?P<lift>\[\*\])|\[(?P<index>[0-9]{1,4})\]")
CONTEXT_PREFIX: Final = ".context."

SIMPLE_ROOTS: Final[Mapping[str, RefRoot]] = {
    "input": RefRoot.INPUT,
    "in": RefRoot.IN,
    "out": RefRoot.OUT,
    "item": RefRoot.ITEM,
    "index": RefRoot.INDEX,
    "case": RefRoot.CASE,
    "acc": RefRoot.ACC,
    "iter": RefRoot.ITER,
    "loop": RefRoot.LOOP,
    "ok": RefRoot.OK,
    "failed": RefRoot.FAILED,
}


def parse_ref(text: str) -> Ref:
    if not text.startswith("$"):
        raise RefSyntaxError(text, 0, "a reference starts with $")
    name = IDENTIFIER.match(text, 1)
    if name is None:
        raise RefSyntaxError(text, 1, "expected a reference root after $: input, in, item, …, or a node name")
    head = _parse_head(text, name.group(), name.end())
    return Ref(head.root, head.node_id, head.key, _parse_steps(text, head.end))


def _parse_head(text: str, name: str, end: int) -> _Head:
    simple = SIMPLE_ROOTS.get(name)
    if simple is not None:
        return _Head(simple, None, None, end)
    parser = HEAD_PARSERS.get(name, _node_head)
    return parser(text, name, end)


def _branch_head(text: str, name: str, end: int) -> _Head:
    key = IDENTIFIER.match(text, end + 1) if text.startswith(".", end) else None
    if key is None:
        raise RefSyntaxError(text, end, "expected .<branch key> after $branch")
    return _Head(RefRoot.BRANCH, None, key.group(), key.end())


def _run_head(text: str, name: str, end: int) -> _Head:
    if not text.startswith(CONTEXT_PREFIX, end):
        raise RefSyntaxError(text, end, "expected .context.<key> after $run")
    start = end + len(CONTEXT_PREFIX)
    key = IDENTIFIER.match(text, start)
    if key is None or key.group() not in RunContextKey:
        raise RefSyntaxError(text, start, "the context key is date, time_zone, locale or tenant_id")
    return _Head(RefRoot.RUN_CONTEXT, None, key.group(), key.end())


def _node_head(text: str, name: str, end: int) -> _Head:
    if not text.startswith(".out", end) or IDENTIFIER_TAIL.match(text, end + 4):
        raise RefSyntaxError(text, end, f"expected .out after $<node>: ${name}.out")
    return _Head(RefRoot.NODE, NodeId(name), None, end + 4)


HEAD_PARSERS: Final[Mapping[str, Callable[[str, str, int], _Head]]] = {
    "branch": _branch_head,
    "run": _run_head,
}


def _parse_steps(text: str, start: int) -> tuple[RefStep, ...]:
    steps: list[RefStep] = []
    position = start
    while position < len(text):
        match = STEP.match(text, position)
        if match is None:
            raise RefSyntaxError(text, position, "a reference step is .field, [*] or [n]")
        steps.append(_step(match))
        position = match.end()
    return tuple(steps)


def _step(match: re.Match[str]) -> RefStep:
    field = match.group("field")
    if field is not None:
        return FieldStep(field)
    index = match.group("index")
    if index is not None:
        return IndexStep(int(index))
    return LiftStep()


def _head_text(ref: Ref) -> str:
    renderer = HEAD_RENDERERS.get(ref.root)
    if renderer is None:
        return f"${ref.root.value}"
    return renderer(ref)


HEAD_RENDERERS: Final[Mapping[RefRoot, Callable[[Ref], str]]] = {
    RefRoot.NODE: lambda value: f"${value.node_id}.out",
    RefRoot.BRANCH: lambda value: f"$branch.{value.key}",
    RefRoot.RUN_CONTEXT: lambda value: f"$run.context.{value.key}",
}
