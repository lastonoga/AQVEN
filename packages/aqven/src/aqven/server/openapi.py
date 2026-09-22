import json
from collections.abc import AsyncIterator, Sequence
from pathlib import Path
from typing import Final, NoReturn

from fastapi import APIRouter, FastAPI
from pydantic import JsonValue, SecretStr

from aqven.ports.engine import EngineError, EventLogQuery, ExecutionQuery, RunListQuery
from aqven.ports.settings import SettingKey, SettingScope, SettingView
from aqven.runtime.address import ExecutionAddress, RunId
from aqven.runtime.events import RunEvent
from aqven.runtime.executions import ExecutionDetail, NodeExecution
from aqven.runtime.human import HumanWait, HumanWaitDetail, ResumeRequest, ResumeResult
from aqven.runtime.presentation import PresentationRequest, PresentationResponse
from aqven.runtime.runs import (
    CancelRequest,
    CancelResult,
    ForkRequest,
    Page,
    RunForked,
    RunSnapshot,
    RunStarted,
    RunStartRequest,
    RunSummary,
)
from aqven.runtime.vocabulary import IncludePayloads
from aqven.server.app import ServerOptions, create_app

CONTRACT_ONLY: Final = "app built only to export the contract"
CONTRACT_TOKEN: Final = "contract-only"
JSON_INDENT: Final = 2


def unavailable() -> NoReturn:
    raise EngineError("INTERNAL", CONTRACT_ONLY)


class ContractEngine:
    async def start_run(self, request: RunStartRequest, *, dataset_item_id: str | None = None) -> RunStarted:
        unavailable()

    async def get_run(self, run_id: RunId) -> RunSnapshot:
        unavailable()

    async def list_runs(self, query: RunListQuery) -> Page[RunSummary]:
        unavailable()

    def run_events(self, run_id: RunId, after_seq: int = 0) -> AsyncIterator[RunEvent]:
        unavailable()

    async def event_log(self, run_id: RunId, query: EventLogQuery) -> Page[RunEvent]:
        unavailable()

    async def list_executions(self, run_id: RunId, query: ExecutionQuery) -> tuple[NodeExecution, ...]:
        unavailable()

    async def get_execution(
        self,
        run_id: RunId,
        address: ExecutionAddress,
        include_payloads: IncludePayloads = "truncated",
    ) -> ExecutionDetail:
        unavailable()

    async def present_run(self, run_id: RunId, request: PresentationRequest) -> PresentationResponse:
        unavailable()

    async def resume(self, run_id: RunId, request: ResumeRequest) -> ResumeResult:
        unavailable()

    async def fork(self, run_id: RunId, request: ForkRequest) -> RunForked:
        unavailable()

    async def cancel(self, run_id: RunId, request: CancelRequest) -> CancelResult:
        unavailable()

    async def waits(self, run_id: RunId) -> tuple[HumanWait, ...]:
        unavailable()

    async def wait_detail(self, run_id: RunId, address: ExecutionAddress) -> HumanWaitDetail:
        unavailable()


class ContractSettings:
    async def list_settings(self, scope: SettingScope) -> tuple[SettingView, ...]:
        unavailable()

    async def get_setting(self, scope: SettingScope, key: SettingKey) -> SettingView | None:
        unavailable()

    async def set_value(self, scope: SettingScope, key: SettingKey, value: JsonValue) -> SettingView:
        unavailable()

    async def set_secret(self, scope: SettingScope, key: SettingKey, secret: SecretStr) -> SettingView:
        unavailable()

    async def delete_setting(self, scope: SettingScope, key: SettingKey) -> bool:
        unavailable()

    async def read_secret(self, scope: SettingScope, key: SettingKey) -> SecretStr | None:
        unavailable()


def contract_app(extra_routers: Sequence[APIRouter] = ()) -> FastAPI:
    options = ServerOptions(access_token=CONTRACT_TOKEN, watch=False, serve_studio=False, environ={})
    return create_app(Path.cwd(), ContractEngine(), ContractSettings(), extra_routers, options=options)


def openapi_text(app: FastAPI) -> str:
    return json.dumps(app.openapi(), ensure_ascii=False, indent=JSON_INDENT, sort_keys=True) + "\n"


def export_openapi(target: Path, app: FastAPI | None = None) -> Path:
    document = openapi_text(app or contract_app())
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(document, encoding="utf-8")
    return target
