import inspect
import logging
import re
import threading
import warnings
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from types import FrameType
from typing import Final, Protocol, TextIO

from pydantic import JsonValue

from aqven.app.console_log.events import ConsoleEvent, publish
from aqven.diagnostics import DIAGNOSTIC_TEXTS, DiagnosticCode
from aqven.ir import CompiledLlmNode, CompiledProject
from aqven.models import LimiterModel, current_call_site

PY_WARNINGS_LOGGER: Final = "py.warnings"
WARNING_KIND: Final = "python_warning"
WARNING_GLYPH: Final = "▲"
FRAME_LIMIT: Final = 120
OWN_MODULE_PREFIX: Final = "aqven."
CONSOLE_MODULE_PREFIX: Final = "aqven.app.console_log"
SAMPLING_WARNING: Final = re.compile(
    r"^Sampling parameters \[(?P<names>[^\]]*)\] are not supported when reasoning is enabled"
)
QUOTED_NAME: Final = re.compile(r"'([^']+)'")
SAMPLING_CODE: Final = DiagnosticCode.W_SAMPLING_IGNORED
SAMPLING_TEXT: Final = DIAGNOSTIC_TEXTS[SAMPLING_CODE]
UNKNOWN_MODEL: Final = "the model"
UNKNOWN_SETTING: Final = "sampling parameters"
FIND_THE_AGENT: Final = "aqven check names every agent that sets it"
SERIALIZER_PREFIX: Final = "Pydantic serializer warnings:"
SERIALIZER_ISSUE: Final = re.compile(
    r"Expected `(?P<expected>[^`]+)`[^\[]*\[field_name='(?P<field>[^']*)'.*?input_type=(?P<got>[\w.]+)\]"
)

type ShowWarning = Callable[[Warning | str, type[Warning], str, int, TextIO | None, str | None], None]
type FrameProbe[T] = Callable[[FrameType], T | None]


@dataclass(frozen=True, slots=True)
class WarningOrigin:
    node: str | None = None
    agent: str | None = None
    agent_file: str | None = None
    model: str | None = None
    caller: str | None = None


@dataclass(frozen=True, slots=True)
class WarningCall:
    message: str
    category: type[Warning]
    filename: str
    lineno: int
    origin: WarningOrigin


@dataclass(frozen=True, slots=True)
class WarningLine:
    key: tuple[str, ...]
    text: str
    details: tuple[str, ...] = ()
    fields: Mapping[str, JsonValue] = field(default_factory=dict[str, JsonValue])


class WarningRule(Protocol):
    def describe(self, call: WarningCall) -> WarningLine | None: ...


def origin_fields(call: WarningCall) -> dict[str, JsonValue]:
    origin = call.origin
    known: dict[str, JsonValue] = {
        "category": call.category.__name__,
        "source": f"{call.filename}:{call.lineno}",
        "node": origin.node,
        "agent": origin.agent,
        "agent_file": origin.agent_file,
        "model": origin.model,
        "caller": origin.caller,
    }
    return {name: value for name, value in known.items() if value is not None}


def caller_details(origin: WarningOrigin) -> tuple[str, ...]:
    return () if origin.caller is None else (f"from {origin.caller}",)


def sampling_owner(origin: WarningOrigin) -> str:
    if origin.agent is not None:
        return f"agent {origin.agent}" + ("" if origin.agent_file is None else f" ({origin.agent_file})")
    if origin.node is not None:
        return f"node {origin.node}; {FIND_THE_AGENT}"
    return FIND_THE_AGENT


@dataclass(frozen=True, slots=True)
class SamplingParametersRule:
    def describe(self, call: WarningCall) -> WarningLine | None:
        found = SAMPLING_WARNING.match(call.message)
        if found is None:
            return None
        names = tuple(QUOTED_NAME.findall(found["names"])) or (UNKNOWN_SETTING,)
        origin = call.origin
        model = origin.model or UNKNOWN_MODEL
        messages = tuple(SAMPLING_TEXT.render({"setting": name, "model": model})[0] for name in names)
        _, hint = SAMPLING_TEXT.render({"setting": " and ".join(names), "model": model})
        return WarningLine(
            key=("sampling", *names, origin.agent or origin.node or "", origin.model or ""),
            text=f"{SAMPLING_CODE}: {'; '.join(messages)}",
            details=(*(() if hint is None else (f"hint: {hint}",)), sampling_owner(origin)),
            fields={
                **origin_fields(call),
                "code": SAMPLING_CODE.value,
                "parameters": " and ".join(names),
                "hint": hint,
            },
        )


@dataclass(frozen=True, slots=True)
class PydanticSerializerRule:
    def describe(self, call: WarningCall) -> WarningLine | None:
        if not call.message.startswith(SERIALIZER_PREFIX):
            return None
        issues = tuple(SERIALIZER_ISSUE.finditer(call.message))
        if not issues:
            return None
        parts = [f"{issue['field']} is {issue['got']}, expected {issue['expected']}" for issue in issues]
        return WarningLine(
            key=("pydantic_serializer", *(f"{issue['field']}:{issue['got']}" for issue in issues)),
            text=f"pydantic serialized values that do not match their declared types: {'; '.join(parts)}",
            details=caller_details(call.origin),
            fields=origin_fields(call),
        )


def plain_line(call: WarningCall) -> WarningLine:
    first, *rest = call.message.splitlines() or [""]
    return WarningLine(
        key=(call.category.__name__, call.message),
        text=f"{call.category.__name__}: {first}",
        details=(*(line.strip() for line in rest if line.strip()), *caller_details(call.origin)),
        fields=origin_fields(call),
    )


@dataclass(frozen=True, slots=True)
class PlainWarningRule:
    def describe(self, call: WarningCall) -> WarningLine | None:
        return plain_line(call)


WARNING_RULES: Final[tuple[WarningRule, ...]] = (
    SamplingParametersRule(),
    PydanticSerializerRule(),
    PlainWarningRule(),
)


def describe(call: WarningCall, rules: Sequence[WarningRule] = WARNING_RULES) -> WarningLine:
    described = (rule.describe(call) for rule in rules)
    return next((line for line in described if line is not None), None) or plain_line(call)


def stack_frames(limit: int = FRAME_LIMIT) -> tuple[FrameType, ...]:
    frames: list[FrameType] = []
    frame = inspect.currentframe()
    while frame is not None and len(frames) < limit:
        frames.append(frame)
        frame = frame.f_back
    return tuple(frames)


def frame_model(frame: FrameType) -> str | None:
    candidate: object = frame.f_locals.get("self")
    return candidate.model_ref if isinstance(candidate, LimiterModel) else None


def frame_agent(frame: FrameType) -> str | None:
    candidate: object = frame.f_locals.get("node")
    return str(candidate.agent) if isinstance(candidate, CompiledLlmNode) else None


def frame_agent_file(frame: FrameType) -> str | None:
    node: object = frame.f_locals.get("node")
    if not isinstance(node, CompiledLlmNode):
        return None
    project: object = getattr(frame.f_locals.get("scope"), "project", None)
    if not isinstance(project, CompiledProject):
        return None
    found = project.agents.get(node.agent)
    return None if found is None else found.file


def frame_caller(frame: FrameType) -> str | None:
    module: object = frame.f_globals.get("__name__")
    if not isinstance(module, str) or not module.startswith(OWN_MODULE_PREFIX):
        return None
    if module.startswith(CONSOLE_MODULE_PREFIX):
        return None
    return f"{module}:{frame.f_lineno}"


def first_found[T](frames: Sequence[FrameType], probe: FrameProbe[T]) -> T | None:
    found = (probe(frame) for frame in frames)
    return next((value for value in found if value is not None), None)


def warning_origin() -> WarningOrigin:
    frames = stack_frames()
    site = current_call_site()
    return WarningOrigin(
        node=site.node_id,
        agent=first_found(frames, frame_agent),
        agent_file=first_found(frames, frame_agent_file),
        model=first_found(frames, frame_model),
        caller=first_found(frames, frame_caller),
    )


@dataclass(slots=True)
class WarningsBridge:
    rules: tuple[WarningRule, ...] = WARNING_RULES
    logger_name: str = PY_WARNINGS_LOGGER
    seen: set[tuple[str, ...]] = field(default_factory=set[tuple[str, ...]])
    lock: threading.Lock = field(default_factory=threading.Lock)
    previous: ShowWarning | None = None

    def install(self) -> None:
        if self.previous is not None:
            return
        self.previous = warnings.showwarning
        warnings.showwarning = self.show

    def uninstall(self) -> None:
        previous = self.previous
        if previous is None:
            return
        warnings.showwarning = previous
        self.previous = None

    def show(
        self,
        message: Warning | str,
        category: type[Warning],
        filename: str,
        lineno: int,
        file: TextIO | None = None,
        line: str | None = None,
    ) -> None:
        previous = self.previous
        if file is not None and previous is not None:
            previous(message, category, filename, lineno, file, line)
            return
        call = WarningCall(str(message), category, filename, lineno, warning_origin())
        described = describe(call, self.rules)
        if not self._first_time(described.key):
            return
        event = ConsoleEvent(
            kind=WARNING_KIND,
            glyph=WARNING_GLYPH,
            tone="notice",
            text=described.text,
            details=described.details,
            fields=described.fields,
            level=logging.WARNING,
        )
        publish(event, logging.getLogger(self.logger_name))

    def _first_time(self, key: tuple[str, ...]) -> bool:
        with self.lock:
            if key in self.seen:
                return False
            self.seen.add(key)
            return True
