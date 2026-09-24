from dataclasses import dataclass

from aqven.runtime.address import ClientOpId


@dataclass(frozen=True, slots=True)
class PendingMessage:
    client_op_id: ClientOpId
    text: str
    wire_id: str


class PendingMessages:
    def __init__(self) -> None:
        self._waiting: dict[str, PendingMessage] = {}

    def __bool__(self) -> bool:
        return bool(self._waiting)

    def add(self, message: PendingMessage) -> None:
        self._waiting[message.wire_id] = message

    def take(self, wire_id: str | None) -> PendingMessage | None:
        if wire_id is None:
            return None
        return self._waiting.pop(wire_id, None)

    def take_first(self) -> PendingMessage | None:
        first = next(iter(self._waiting), None)
        return self.take(first)

    def waiting(self) -> tuple[PendingMessage, ...]:
        return tuple(self._waiting.values())

    def clear(self) -> None:
        self._waiting.clear()
