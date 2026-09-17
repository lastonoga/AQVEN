from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Final

import httpx2

from aqven.engine.blobs import FileBlobStore
from aqven.engine.config import EnginePaths
from aqven.engine.errors import EngineNotLaunched
from aqven.engine.extensions import HumanLayer
from aqven.engine.loading import CodeLoader
from aqven.engine.plans import PlanRegistry
from aqven.ports.execution import NodeExecutors
from aqven.ports.settings import SettingsStore
from aqven.runtime.address import RunId
from aqven.runtime.steps import BlobStore


@dataclass(frozen=True, slots=True)
class RunOverrides:
    tool_http: httpx2.AsyncBaseTransport | None = None
    blobs: BlobStore | None = None


NO_OVERRIDES: Final = RunOverrides()


@dataclass(slots=True)
class OverrideBook:
    entries: dict[RunId, RunOverrides] = field(default_factory=dict[RunId, RunOverrides])

    def register(self, run_id: RunId, overrides: RunOverrides) -> None:
        self.entries[run_id] = overrides

    def of(self, run_id: RunId) -> RunOverrides:
        return self.entries.get(run_id, NO_OVERRIDES)

    def discard(self, run_id: RunId) -> None:
        self.entries.pop(run_id, None)


@dataclass(frozen=True, slots=True)
class ToolServices:
    paths: EnginePaths
    loader: CodeLoader
    blobs: FileBlobStore
    overrides: OverrideBook
    settings: SettingsStore | None
    environ: Mapping[str, str] = field(repr=False)

    @property
    def package(self) -> str:
        return self.paths.root.name

    def blob_store(self, run_id: RunId) -> BlobStore:
        override = self.overrides.of(run_id).blobs
        return self.blobs if override is None else override

    def transport(self, run_id: RunId) -> httpx2.AsyncBaseTransport | None:
        return self.overrides.of(run_id).tool_http


@dataclass(frozen=True, slots=True)
class EngineRuntime:
    paths: EnginePaths
    plans: PlanRegistry
    executors: NodeExecutors
    human_layer: HumanLayer
    services: ToolServices


@dataclass(slots=True)
class RuntimeSlot:
    current: EngineRuntime | None = None

    def install(self, runtime: EngineRuntime) -> None:
        self.current = runtime

    def clear(self) -> None:
        self.current = None

    def require(self) -> EngineRuntime:
        if self.current is None:
            raise EngineNotLaunched()
        return self.current


RUNTIME_SLOT: Final = RuntimeSlot()


def active_runtime() -> EngineRuntime:
    return RUNTIME_SLOT.require()
