import logging
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Final

from pydantic import JsonValue

from aqven.app.console_log.events import ConsoleEvent
from aqven.app.console_log.text import cost_text, joined, one_line, plural
from aqven.log_support import short_id
from aqven.series.model import SeriesId, SeriesStatus
from aqven.series.views import (
    AttemptFinishedEvent,
    SeriesEvent,
    SeriesFinishedEvent,
    SeriesStarted,
    SeriesStatusEvent,
)

type SeriesLine = Callable[[SeriesEvent, SeriesTranscript], ConsoleEvent | None]

SERIES_GLYPH: Final = "◆"
DECILES: Final = 10
PERCENT_PER_DECILE: Final = 10
VERDICT_LIMIT: Final = 400
FINISHED_LEVELS: Final[Mapping[SeriesStatus, int]] = {SeriesStatus.FAILED: logging.WARNING}
STATUS_TEXT: Final[Mapping[SeriesStatus, str]] = {
    SeriesStatus.AWAITING_APPROVAL: "waits for approval in Studio",
    SeriesStatus.WAITING_HUMAN: "waits for a human answer",
    SeriesStatus.RUNNING: "running",
}


@dataclass(slots=True)
class SeriesTranscript:
    series_id: SeriesId
    studio_url: str | None = None
    decile: int = 0
    verdict_text: str | None = None

    @property
    def short(self) -> str:
        return short_id(self.series_id)


def series_fields(series_id: SeriesId, extra: Mapping[str, JsonValue]) -> dict[str, JsonValue]:
    known: dict[str, JsonValue] = {"series_id": series_id, **extra}
    return {name: value for name, value in known.items() if value is not None}


def series_started_line(started: SeriesStarted, transcript: SeriesTranscript) -> ConsoleEvent:
    total = started.progress.total
    return ConsoleEvent(
        kind="series_started",
        glyph=SERIES_GLYPH,
        tone="accent",
        text=joined(
            f"series {transcript.short} started",
            None if started.flow_id is None else f"flow {started.flow_id}",
            plural(total, "attempt"),
            plural(len(started.variants), "variant"),
            None if started.status is SeriesStatus.RUNNING else STATUS_TEXT.get(started.status, started.status.value),
            transcript.studio_url,
        ),
        fields=series_fields(
            started.series_id,
            {
                "flow": started.flow_id,
                "attempts": total,
                "variants": len(started.variants),
                "status": started.status.value,
                "url": transcript.studio_url,
            },
        ),
    )


def status_line(event: SeriesEvent, transcript: SeriesTranscript) -> ConsoleEvent | None:
    if not isinstance(event, SeriesStatusEvent):
        return None
    return ConsoleEvent(
        kind="series_status",
        glyph=SERIES_GLYPH,
        tone="muted",
        text=f"series {transcript.short} {STATUS_TEXT.get(event.status, event.status.value)}",
        fields=series_fields(event.series_id, {"status": event.status.value}),
    )


def progress_line(event: SeriesEvent, transcript: SeriesTranscript) -> ConsoleEvent | None:
    if not isinstance(event, AttemptFinishedEvent) or event.total <= 0:
        return None
    decile = event.done * DECILES // event.total
    if decile <= transcript.decile or event.done >= event.total:
        return None
    transcript.decile = decile
    return ConsoleEvent(
        kind="series_progress",
        glyph=SERIES_GLYPH,
        tone="plain",
        text=joined(
            f"series {transcript.short} {decile * PERCENT_PER_DECILE}%",
            f"{event.done}/{event.total} attempts",
            None if not event.spend_usd else f"{cost_text(event.spend_usd)} spent",
        ),
        fields=series_fields(
            event.series_id, {"done": event.done, "total": event.total, "spend_usd": str(event.spend_usd)}
        ),
    )


def finished_line(event: SeriesEvent, transcript: SeriesTranscript) -> ConsoleEvent | None:
    if not isinstance(event, SeriesFinishedEvent):
        return None
    state = None if event.verdict is None else f"verdict {event.verdict.value}"
    text = transcript.verdict_text
    return ConsoleEvent(
        kind="series_finished",
        glyph=SERIES_GLYPH,
        tone="bad" if event.status is SeriesStatus.FAILED else "good",
        text=joined(f"series {transcript.short} {event.status.value}", state),
        details=() if not text else (one_line(text, VERDICT_LIMIT),),
        fields=series_fields(
            event.series_id,
            {
                "status": event.status.value,
                "verdict": None if event.verdict is None else event.verdict.value,
                "verdict_text": transcript.verdict_text,
            },
        ),
        level=FINISHED_LEVELS.get(event.status, logging.INFO),
    )


SERIES_LINES: Final[Mapping[str, SeriesLine]] = {
    "series_status": status_line,
    "attempt_finished": progress_line,
    "series_finished": finished_line,
}


def series_line(event: SeriesEvent, transcript: SeriesTranscript) -> ConsoleEvent | None:
    render = SERIES_LINES.get(event.type)
    return None if render is None else render(event, transcript)
