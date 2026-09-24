from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Final

import httpx2
from pydantic_ai.usage import UsageLimits

from aqven.engine.blobs import FileBlobStore
from aqven.engine.config import EnginePaths
from aqven.engine.errors import EngineNotLaunched
from aqven.engine.extensions import HumanLayer
from aqven.engine.forking import root_run_id
from aqven.engine.loading import CodeLoader
from aqven.engine.plans import PlanRegistry
from aqven.engine.summaries.service import RunSummaries
from aqven.models.limiter import UsageBudget
from aqven.models.usage import usd_of_micros
from aqven.ports.execution import NodeExecutors
from aqven.ports.prices import NO_PRICES, PriceCache
from aqven.ports.settings import SettingsStore
from aqven.runtime.address import RunId
from aqven.runtime.steps import BlobStore
from aqven.spec import Limits


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


def run_usage_limits(limits: Limits) -> UsageLimits:
    return UsageLimits(
        request_limit=limits.requests,
        tool_calls_limit=limits.tool_calls,
        total_tokens_limit=limits.tokens,
        cost_limit=usd_of_micros(limits.usd_micros),
    )


@dataclass(slots=True)
class RunBudgets:
    entries: dict[RunId, UsageBudget] = field(default_factory=dict[RunId, UsageBudget])

    def budget(self, run_id: RunId, limits: Limits | None) -> UsageBudget | None:
        if limits is None:
            return None
        root = root_run_id(run_id)
        if root not in self.entries:
            self.entries[root] = UsageBudget(run_usage_limits(limits))
        return self.entries[root]

    def discard(self, run_id: RunId) -> None:
        self.entries.pop(root_run_id(run_id), None)


@dataclass(frozen=True, slots=True)
class ToolServices:
    paths: EnginePaths
    loader: CodeLoader
    blobs: FileBlobStore
    overrides: OverrideBook
    settings: SettingsStore | None
    environ: Mapping[str, str] = field(repr=False)
    budgets: RunBudgets = field(default_factory=RunBudgets)
    prices: PriceCache = NO_PRICES

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
    summaries: RunSummaries


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
