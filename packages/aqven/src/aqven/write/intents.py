import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

from pydantic import ValidationError

from aqven.runtime.address import ClientOpId
from aqven.write.model import WriteResult
from aqven.write.paths import INTENTS_FOLDER, replace_durable

INTENT_SUFFIX = ".json"


class IntentJournal(Protocol):
    def find(self, client_op_id: ClientOpId) -> WriteResult | None: ...

    def record(self, client_op_id: ClientOpId, result: WriteResult) -> None: ...


@dataclass(slots=True)
class MemoryIntentJournal:
    results: dict[ClientOpId, WriteResult] = field(default_factory=dict[ClientOpId, WriteResult])
    guard: threading.Lock = field(default_factory=threading.Lock)

    def find(self, client_op_id: ClientOpId) -> WriteResult | None:
        with self.guard:
            return self.results.get(client_op_id)

    def record(self, client_op_id: ClientOpId, result: WriteResult) -> None:
        with self.guard:
            self.results.setdefault(client_op_id, result)


@dataclass(frozen=True, slots=True)
class FileIntentJournal:
    root: Path

    def find(self, client_op_id: ClientOpId) -> WriteResult | None:
        try:
            return WriteResult.model_validate_json(self._path(client_op_id).read_bytes())
        except FileNotFoundError, ValidationError:
            return None

    def record(self, client_op_id: ClientOpId, result: WriteResult) -> None:
        target = self._path(client_op_id)
        if target.is_file():
            return
        target.parent.mkdir(parents=True, exist_ok=True)
        replace_durable(target, result.model_dump_json(by_alias=True).encode("utf-8"))

    def _path(self, client_op_id: ClientOpId) -> Path:
        return self.root / INTENTS_FOLDER / f"{client_op_id}{INTENT_SUFFIX}"
