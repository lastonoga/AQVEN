import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Annotated, Final, Literal, Protocol

from pydantic import Field, JsonValue, TypeAdapter

from aqven.runtime.address import ClientOpId, ResourceModel
from aqven.write.model import WriteActor

SELF_WRITE_TTL_SECONDS: Final = 30.0

type ChangeKind = Literal["added", "modified", "deleted"]


class FileChange(ResourceModel):
    path: str
    change: ChangeKind
    file_hash_before: str | None
    file_hash_after: str | None


class FilesChanged(ResourceModel):
    type: Literal["files_changed"] = "files_changed"
    changes: tuple[FileChange, ...]
    actor: WriteActor
    client_op_id: ClientOpId | None
    ops: tuple[JsonValue, ...] | None
    summary: str
    tree_hash: str


class DraftStale(ResourceModel):
    type: Literal["draft_stale"] = "draft_stale"
    path: str
    base_file_hash: str | None
    file_hash: str | None


class ExclusiveBegan(ResourceModel):
    type: Literal["exclusive_began"] = "exclusive_began"
    actor: WriteActor
    flow_id: str


class ExclusiveEnded(ResourceModel):
    type: Literal["exclusive_ended"] = "exclusive_ended"
    actor: WriteActor
    flow_id: str


class TransactionRecovered(ResourceModel):
    type: Literal["transaction_recovered"] = "transaction_recovered"
    txn_id: str
    outcome: Literal["rolled_forward", "rolled_back"]
    paths: tuple[str, ...]


type SpecNotice = Annotated[
    FilesChanged | DraftStale | ExclusiveBegan | ExclusiveEnded | TransactionRecovered,
    Field(discriminator="type"),
]

SPEC_NOTICE_ADAPTER: Final = TypeAdapter[SpecNotice](SpecNotice)


class SpecNoticeSink(Protocol):
    def publish(self, notice: SpecNotice) -> None: ...


@dataclass(slots=True)
class CollectingSink:
    notices: list[SpecNotice] = field(default_factory=list[SpecNotice])

    def publish(self, notice: SpecNotice) -> None:
        self.notices.append(notice)


@dataclass(slots=True)
class SelfWrites:
    ttl_seconds: float = SELF_WRITE_TTL_SECONDS
    clock: Callable[[], float] = time.monotonic
    expected: dict[tuple[str, str | None], float] = field(default_factory=dict[tuple[str, str | None], float])
    guard: threading.Lock = field(default_factory=threading.Lock)

    def expect(self, path: str, file_hash: str | None) -> None:
        with self.guard:
            self.expected[(path, file_hash)] = self.clock() + self.ttl_seconds

    def is_echo(self, path: str, file_hash: str | None) -> bool:
        with self.guard:
            now = self.clock()
            self.expected = {key: deadline for key, deadline in self.expected.items() if deadline > now}
            return self.expected.pop((path, file_hash), None) is not None
