from dataclasses import dataclass
from typing import Final

import httpx2

from aqven.runtime import RUN_EVENT_ADAPTER, RUN_EVENT_TYPES, RunEvent

RECONNECT_LIMIT: Final[int] = 5
LAST_EVENT_ID_HEADER: Final[str] = "Last-Event-ID"


def decode_run_event(frame: httpx2.ServerSentEvent) -> RunEvent | None:
    if frame.event not in RUN_EVENT_TYPES:
        return None
    return RUN_EVENT_ADAPTER.validate_json(frame.data)


@dataclass(slots=True)
class EventCursor:
    last_seq: int
    finished: bool = False
    resumed: bool = False
    lost_connections: int = 0

    def should_connect(self) -> bool:
        return not self.finished and self.lost_connections < RECONNECT_LIMIT

    def advance(self, event: RunEvent) -> None:
        self.last_seq = event.seq
        self.finished = event.type == "run_finished"
        self.lost_connections = 0

    def connection_lost(self) -> None:
        self.resumed = True
        self.lost_connections += 1

    def query(self) -> dict[str, int]:
        return {"after_seq": self.last_seq}

    def headers(self) -> dict[str, str]:
        return {LAST_EVENT_ID_HEADER: str(self.last_seq)} if self.resumed else {}
