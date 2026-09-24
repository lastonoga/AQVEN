import datetime as dt
from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum
from pathlib import Path
from typing import Annotated, Final

import httpx2
from pydantic import BaseModel, ConfigDict, Field

from aqven.ir.registry import AgentModel
from aqven.runtime.address import RunId
from aqven.runtime.executions import RunError
from aqven.runtime.human import ScriptedAnswer
from aqven.runtime.overrides import NodeOutputOverride
from aqven.runtime.replay import McpToolStub, ProviderFault
from aqven.runtime.steps import BlobStore
from aqven.runtime.vocabulary import RunMode, RunStatus
from aqven.spec import MODEL_PATTERN, Limits, Locale, Modality, TenantId, TimeZone


class CassetteMode(StrEnum):
    REPLAY_STRICT = "replay_strict"
    RECORD = "record"
    RECORD_NEW = "record_new"


class CassetteConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    directory: Path
    mode: CassetteMode


class ModelRoute(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    model: Annotated[str, Field(pattern=MODEL_PATTERN)]
    zdr: bool | None = None


TEXT_OUTPUT: Final = frozenset({Modality.TEXT})


@dataclass(frozen=True, slots=True)
class CallMedia:
    input: frozenset[Modality] = frozenset()
    output: frozenset[Modality] = TEXT_OUTPUT


@dataclass(frozen=True, slots=True)
class ModelCall:
    model: AgentModel
    uses_tools: bool
    media: CallMedia


class CapabilityRoute(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    models: frozenset[str] = frozenset()
    media: frozenset[Modality] = frozenset()
    output: frozenset[Modality] = frozenset()
    tools: bool | None = None
    route: ModelRoute

    def matches(self, call: ModelCall) -> bool:
        return (
            (not self.models or call.model.model in self.models)
            and (self.tools is None or self.tools == call.uses_tools)
            and self.media <= call.media.input
            and self.output <= call.media.output
        )


class ModelProfile(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    name: Annotated[str, Field(min_length=1)]
    routes: tuple[CapabilityRoute, ...]

    def route(self, call: ModelCall) -> ModelRoute | None:
        return next((item.route for item in self.routes if item.matches(call)), None)


class RunContext(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    date: dt.date | None = None
    time_zone: TimeZone | None = None
    locale: Locale | None = None
    tenant_id: TenantId | None = None


@dataclass(frozen=True, slots=True)
class RunOptions:
    mode: RunMode = "live"
    context: RunContext | None = None
    cassettes: CassetteConfig | None = None
    human_answers: tuple[ScriptedAnswer, ...] = ()
    limits: Limits | None = None
    tool_http: httpx2.AsyncBaseTransport | None = None
    mcp_stubs: tuple[McpToolStub, ...] = ()
    blobs: BlobStore | None = None
    faults: tuple[ProviderFault, ...] = ()
    models: ModelProfile | None = None
    outputs: tuple[NodeOutputOverride, ...] = ()


class RunResult[O: BaseModel](BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    run_id: RunId
    status: RunStatus
    output: O | None
    error: RunError | None
    cost_usd: Decimal
    tokens_in: Annotated[int, Field(ge=0)]
    tokens_out: Annotated[int, Field(ge=0)]
