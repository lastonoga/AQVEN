import threading
from dataclasses import dataclass, field

from aqven.series.feed import ResearchNotice, SeriesProgressNotice, SeriesStartedNotice, SeriesStatusNotice
from aqven.series.model import SeriesStatus


@dataclass(slots=True)
class RecordingFeed:
    notices: list[ResearchNotice] = field(default_factory=list[ResearchNotice])
    lock: threading.Lock = field(default_factory=threading.Lock)

    def publish(self, notice: ResearchNotice) -> None:
        with self.lock:
            self.notices.append(notice)

    def seen(self) -> tuple[ResearchNotice, ...]:
        with self.lock:
            return tuple(self.notices)

    def started(self) -> tuple[SeriesStartedNotice, ...]:
        return tuple(notice for notice in self.seen() if isinstance(notice, SeriesStartedNotice))

    def progress(self) -> tuple[SeriesProgressNotice, ...]:
        return tuple(notice for notice in self.seen() if isinstance(notice, SeriesProgressNotice))

    def transitions(self) -> tuple[tuple[SeriesStatus | None, SeriesStatus], ...]:
        return tuple(
            (notice.previous, notice.status) for notice in self.seen() if isinstance(notice, SeriesStatusNotice)
        )
