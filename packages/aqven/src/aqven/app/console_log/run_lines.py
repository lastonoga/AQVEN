import logging
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import datetime
from typing import Final

from pydantic import JsonValue

from aqven.app.console_log.events import ConsoleEvent, Tone
from aqven.app.console_log.text import cost_text, duration_text, joined, model_short, one_line, plural, tokens_text
from aqven.log_support import address_label, short_id
from aqven.runtime.address import ExecutionAddress, RunId
from aqven.runtime.events import (
    InferenceInputCaptured,
    NodeAttemptFailed,
    NodeFinished,
    NodeSuspended,
    RunEvent,
    RunFinished,
    RunStartedEvent,
)
from aqven.runtime.executions import ModelErrorDetails

type AddressKey = tuple[str, str | None, int | None, int | None]
type RunLine = Callable[[RunEvent, RunTranscript], ConsoleEvent | None]

MILLISECONDS: Final = 1000


@dataclass(frozen=True, slots=True)
class StepLook:
    glyph: str
    tone: Tone
    level: int


STEP_LOOKS: Final[Mapping[str, StepLook]] = {
    "ok": StepLook("✓", "good", logging.INFO),
    "failed": StepLook("✗", "bad", logging.WARNING),
    "skipped": StepLook("–", "muted", logging.INFO),
    "cancelled": StepLook("⊘", "muted", logging.INFO),
}
RUN_LOOKS: Final[Mapping[str, StepLook]] = {
    "completed": StepLook("■", "good", logging.INFO),
    "failed": StepLook("■", "bad", logging.WARNING),
    "cancelled": StepLook("■", "muted", logging.INFO),
}


def address_key(address: ExecutionAddress) -> AddressKey:
    return (address.node_id, address.branch_key, address.iteration, address.item_index)


@dataclass(slots=True)
class RunTranscript:
    run_id: RunId
    studio_url: str | None = None
    quiet_until: datetime | None = None
    flow_id: str | None = None
    started_at: datetime | None = None
    agents: dict[AddressKey, str] = field(default_factory=dict[AddressKey, str])
    agent_files: dict[str, str] = field(default_factory=dict[str, str])
    failed_steps: int = 0

    @property
    def short(self) -> str:
        return short_id(self.run_id)

    def agent_at(self, address: ExecutionAddress, details: ModelErrorDetails | None = None) -> str | None:
        known = self.agents.get(address_key(address))
        if known is not None:
            return known
        return None if details is None else details.agent

    def agent_file(self, agent: str | None) -> str | None:
        return None if agent is None else self.agent_files.get(agent)

    def silent(self, event: RunEvent) -> bool:
        return self.quiet_until is not None and event.at < self.quiet_until


def base_fields(event: RunEvent, transcript: RunTranscript) -> dict[str, JsonValue]:
    known: dict[str, JsonValue] = {"run_id": event.run_id, "flow": transcript.flow_id, "seq": event.seq}
    return {name: value for name, value in known.items() if value is not None}


def step_fields(
    event: RunEvent, transcript: RunTranscript, address: ExecutionAddress, extra: Mapping[str, JsonValue]
) -> dict[str, JsonValue]:
    known: dict[str, JsonValue] = {
        **base_fields(event, transcript),
        "node": address.node_id,
        "branch": address.branch_key,
        "iteration": address.iteration,
        "item": address.item_index,
        **extra,
    }
    return {name: value for name, value in known.items() if value is not None}


def run_started(event: RunEvent, transcript: RunTranscript) -> ConsoleEvent | None:
    if not isinstance(event, RunStartedEvent):
        return None
    transcript.flow_id = event.flow_id
    transcript.started_at = event.at
    return ConsoleEvent(
        kind="run_started",
        glyph="▶",
        tone="accent",
        text=joined(f"run {transcript.short} started", f"flow {event.flow_id}", event.mode, transcript.studio_url),
        fields={**base_fields(event, transcript), "mode": event.mode, "url": transcript.studio_url},
    )


def inference_captured(event: RunEvent, transcript: RunTranscript) -> ConsoleEvent | None:
    if not isinstance(event, InferenceInputCaptured):
        return None
    transcript.agents[address_key(event.address)] = event.agent
    return None


def attempt_failed(event: RunEvent, transcript: RunTranscript) -> ConsoleEvent | None:
    if not isinstance(event, NodeAttemptFailed):
        return None
    cause = event.cause
    agent = transcript.agent_at(event.address, cause.details)
    agent_file = transcript.agent_file(agent)
    code = cause.code or cause.kind
    head = joined(f"{address_label(event.address)} attempt {event.attempt} → {event.action}", code)
    details = tuple(
        line
        for line in (
            one_line(cause.message),
            None if cause.hint is None else f"hint: {one_line(cause.hint)}",
            None if agent is None else f"agent {agent}" + ("" if agent_file is None else f" ({agent_file})"),
        )
        if line
    )
    fields: dict[str, JsonValue] = {
        "attempt": event.attempt,
        "action": event.action,
        "code": code,
        "hint": cause.hint,
        "agent": agent,
        "agent_file": agent_file,
        "model": None if cause.details is None else cause.details.model,
    }
    return ConsoleEvent(
        kind="step_retry",
        glyph="↻",
        tone="notice",
        text=head,
        details=details,
        fields=step_fields(event, transcript, event.address, fields),
    )


def node_finished(event: RunEvent, transcript: RunTranscript) -> ConsoleEvent | None:
    if not isinstance(event, NodeFinished):
        return None
    look = STEP_LOOKS[event.status]
    error = event.error
    agent = transcript.agent_at(event.address, None if error is None else error.details)
    transcript.failed_steps += int(event.status == "failed")
    measures = (
        agent,
        model_short(event.model),
        duration_text(event.latency_ms) if event.latency_ms else None,
        tokens_text(event.tokens_in, event.tokens_out),
        cost_text(event.cost_usd),
        "cached" if event.cache_hit else None,
        "degraded" if event.degraded else None,
        plural(event.checks_failed, "check") + " failed" if event.checks_failed else None,
    )
    failure = None if error is None else f"{error.code}: {one_line(error.message)}"
    status = None if event.status == "ok" else event.status
    details = () if error is None or error.hint is None else (f"hint: {one_line(error.hint)}",)
    fields: dict[str, JsonValue] = {
        "status": event.status,
        "agent": agent,
        "model": event.model,
        "duration_ms": event.latency_ms,
        "tokens_in": event.tokens_in,
        "tokens_out": event.tokens_out,
        "cost_usd": str(event.cost_usd),
        "code": None if error is None else error.code,
        "hint": None if error is None else error.hint,
    }
    return ConsoleEvent(
        kind="step_failed" if event.status == "failed" else "step_finished",
        glyph=look.glyph,
        tone=look.tone,
        text=joined(address_label(event.address), status, *measures, failure),
        details=details,
        fields=step_fields(event, transcript, event.address, fields),
        level=look.level,
    )


def node_suspended(event: RunEvent, transcript: RunTranscript) -> ConsoleEvent | None:
    if not isinstance(event, NodeSuspended):
        return None
    return ConsoleEvent(
        kind="step_waiting",
        glyph="⏸",
        tone="notice",
        text=joined(
            f"{address_label(event.address)} waits for {event.wait_kind.replace('_', ' ')}",
            event.form_type_id,
            event.assignee,
        ),
        fields=step_fields(event, transcript, event.address, {"wait_kind": event.wait_kind}),
    )


def run_finished(event: RunEvent, transcript: RunTranscript) -> ConsoleEvent | None:
    if not isinstance(event, RunFinished):
        return None
    look = RUN_LOOKS[event.status]
    elapsed = None if transcript.started_at is None else event.at - transcript.started_at
    duration_ms = None if elapsed is None else round(elapsed.total_seconds() * MILLISECONDS)
    failed_steps = transcript.failed_steps if event.status == "completed" else 0
    error = event.error
    text = joined(
        f"run {transcript.short} {event.status}",
        None if failed_steps == 0 else f"{plural(failed_steps, 'step')} failed",
        None if duration_ms is None else duration_text(duration_ms),
        tokens_text(event.tokens_in, event.tokens_out),
        cost_text(event.cost_usd),
        None if error is None else f"{error.code}: {one_line(error.message)}",
    )
    details = () if error is None or error.hint is None else (f"hint: {one_line(error.hint)}",)
    fields: dict[str, JsonValue] = {
        **base_fields(event, transcript),
        "status": event.status,
        "failed_steps": failed_steps,
        "duration_ms": duration_ms,
        "tokens_in": event.tokens_in,
        "tokens_out": event.tokens_out,
        "cost_usd": str(event.cost_usd),
        "code": None if error is None else error.code,
        "hint": None if error is None else error.hint,
    }
    return ConsoleEvent(
        kind="run_finished",
        glyph=look.glyph,
        tone="notice" if failed_steps and look.tone == "good" else look.tone,
        text=text,
        details=details,
        fields={name: value for name, value in fields.items() if value is not None},
        level=look.level,
    )


RUN_LINES: Final[Mapping[str, RunLine]] = {
    "run_started": run_started,
    "inference_input_captured": inference_captured,
    "node_attempt_failed": attempt_failed,
    "node_finished": node_finished,
    "node_suspended": node_suspended,
    "run_finished": run_finished,
}


def run_line(event: RunEvent, transcript: RunTranscript) -> ConsoleEvent | None:
    render = RUN_LINES.get(event.type)
    if render is None:
        return None
    line = render(event, transcript)
    return None if transcript.silent(event) else line
