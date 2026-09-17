import hashlib
from collections.abc import AsyncGenerator, AsyncIterator, Mapping
from contextlib import aclosing, asynccontextmanager, suppress
from types import TracebackType
from typing import Final, Self
from urllib.parse import quote

import httpx2
from pydantic import BaseModel, JsonValue

from aqven.client.errors import BlobIntegrityError, EventStreamLost, raise_for_failure
from aqven.client.events import EventCursor, decode_run_event
from aqven.runtime import (
    BlobUploaded,
    CancelRequest,
    CancelResult,
    ExecutionAddress,
    ExecutionDetail,
    ForkRequest,
    IncludePayloads,
    Page,
    ResumeRequest,
    ResumeResult,
    RunEvent,
    RunForked,
    RunId,
    RunSnapshot,
    RunStarted,
    RunStartRequest,
    RunStatus,
    RunSummary,
)
from aqven.spec import MediaValue

DEFAULT_BASE_URL: Final[str] = "http://127.0.0.1:5180"
DEFAULT_TIMEOUT_SECONDS: Final[float] = 30.0
BLOB_FORM_FIELD: Final[str] = "file"
DEFAULT_BLOB_NAME: Final[str] = "blob"
BLOB_HASH_PREFIX: Final[str] = "sha256-"
MEDIA_KEY: Final[str] = "$media"

type QueryValue = str | int
type Query = Mapping[str, QueryValue]


def request_body(model: BaseModel) -> JsonValue:
    return model.model_dump(mode="json", by_alias=True)


def address_query(address: ExecutionAddress) -> dict[str, QueryValue]:
    fields: dict[str, QueryValue | None] = {
        "node_id": address.node_id,
        "branch_key": address.branch_key,
        "iteration": address.iteration,
        "item_index": address.item_index,
    }
    return {name: value for name, value in fields.items() if value is not None}


class AqvenClient:
    def __init__(
        self,
        base_url: str = DEFAULT_BASE_URL,
        *,
        http: httpx2.AsyncClient | None = None,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._owns_http = http is None
        self._http = httpx2.AsyncClient(timeout=timeout_seconds) if http is None else http

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        if self._owns_http:
            await self._http.aclose()

    async def start_run(self, request: RunStartRequest) -> RunStarted:
        return await self._call(RunStarted, "POST", self._url("runs"), body=request_body(request))

    async def get_run(self, run_id: RunId) -> RunSnapshot:
        return await self._call(RunSnapshot, "GET", self._url("runs", run_id))

    async def list_runs(
        self,
        *,
        flow_id: str | None = None,
        status: RunStatus | None = None,
        assignee: str | None = None,
        cursor: str | None = None,
        limit: int = 20,
    ) -> Page[RunSummary]:
        filters: dict[str, QueryValue | None] = {
            "flow_id": flow_id,
            "status": status,
            "assignee": assignee,
            "cursor": cursor,
            "limit": limit,
        }
        query = {name: value for name, value in filters.items() if value is not None}
        return await self._call(Page[RunSummary], "GET", self._url("runs"), query=query)

    async def get_execution(
        self,
        run_id: RunId,
        address: ExecutionAddress,
        *,
        include_payloads: IncludePayloads = "truncated",
    ) -> ExecutionDetail:
        query = {**address_query(address), "include_payloads": include_payloads}
        return await self._call(ExecutionDetail, "GET", self._url("runs", run_id, "executions", "detail"), query=query)

    async def resume(self, run_id: RunId, request: ResumeRequest) -> ResumeResult:
        return await self._call(ResumeResult, "POST", self._url("runs", run_id, "resume"), body=request_body(request))

    async def fork(self, run_id: RunId, request: ForkRequest) -> RunForked:
        return await self._call(RunForked, "POST", self._url("runs", run_id, "fork"), body=request_body(request))

    async def cancel(self, run_id: RunId, reason: str) -> RunStatus:
        body = request_body(CancelRequest(reason=reason))
        result = await self._call(CancelResult, "POST", self._url("runs", run_id, "cancel"), body=body)
        return result.status

    async def upload_blob(self, data: bytes, media_type: str, name: str | None = None) -> MediaValue:
        upload = {BLOB_FORM_FIELD: (name or DEFAULT_BLOB_NAME, data, media_type)}
        response = await self._http.request("POST", self._url("blobs"), files=upload)
        await raise_for_failure(response)
        uploaded = BlobUploaded.model_validate_json(response.content)
        document: dict[str, JsonValue] = {
            MEDIA_KEY: uploaded.media_type,
            "blob_id": uploaded.blob_id,
            "size_bytes": uploaded.size_bytes,
            "name": name,
        }
        return MediaValue.model_validate(document)

    async def download_blob(self, media: MediaValue) -> bytes:
        response = await self._http.request("GET", self._url("blobs", media.blob_id))
        await raise_for_failure(response)
        actual = f"{BLOB_HASH_PREFIX}{hashlib.sha256(response.content).hexdigest()}"
        if actual != media.blob_id:
            raise BlobIntegrityError(media.blob_id, actual)
        return response.content

    async def run_events(self, run_id: RunId, *, after_seq: int = 0) -> AsyncIterator[RunEvent]:
        cursor = EventCursor(last_seq=after_seq)
        while cursor.should_connect():
            async with aclosing(self._connection(run_id, cursor)) as events:
                async for event in events:
                    yield event
        if not cursor.finished:
            raise EventStreamLost(run_id, cursor.last_seq)

    async def _connection(self, run_id: RunId, cursor: EventCursor) -> AsyncGenerator[RunEvent]:
        with suppress(httpx2.TransportError):
            async with self._event_source(run_id, cursor) as source:
                async for frame in source:
                    event = decode_run_event(frame)
                    if event is None:
                        continue
                    cursor.advance(event)
                    yield event
                    if cursor.finished:
                        return
        cursor.connection_lost()

    @asynccontextmanager
    async def _event_source(self, run_id: RunId, cursor: EventCursor) -> AsyncGenerator[httpx2.EventSource]:
        url = self._url("runs", run_id, "events")
        async with self._http.sse(url, params=cursor.query(), headers=cursor.headers()) as source:
            await raise_for_failure(source.response)
            yield source

    async def _call[M: BaseModel](
        self,
        model: type[M],
        method: str,
        url: str,
        *,
        body: JsonValue = None,
        query: Query | None = None,
    ) -> M:
        response = await self._http.request(method, url, json=body, params=query)
        await raise_for_failure(response)
        return model.model_validate_json(response.content)

    def _url(self, *segments: str) -> str:
        return "/".join((self._base_url, "api", *(quote(segment, safe="") for segment in segments)))
