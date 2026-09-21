from typing import Annotated, Literal, Protocol

import httpx2
from pydantic import BaseModel, ConfigDict, Field

from aqven.runtime.address import ExecutionAddress, RunId
from aqven.spec import MediaValue

JOB_CONFIG = ConfigDict(extra="forbid", frozen=True)


class BlobStore(Protocol):
    async def put(self, data: bytes, media_type: str, name: str | None) -> MediaValue: ...

    async def get(self, media: MediaValue) -> bytes: ...


class ToolContext(Protocol):
    @property
    def run_id(self) -> RunId: ...

    @property
    def address(self) -> ExecutionAddress: ...

    @property
    def http(self) -> httpx2.AsyncClient: ...

    @property
    def idempotency_key(self) -> str | None: ...

    @property
    def blobs(self) -> BlobStore: ...

    def secret(self, name: str) -> str: ...


class JobHandle(BaseModel):
    model_config = JOB_CONFIG
    job_id: str
    provider: str


class JobPending(BaseModel):
    model_config = JOB_CONFIG
    state: Literal["pending"] = "pending"
    progress: Annotated[float, Field(ge=0, le=1)] | None = None


class JobDone[T: BaseModel](BaseModel):
    model_config = JOB_CONFIG
    state: Literal["done"] = "done"
    value: T


class JobFailed(BaseModel):
    model_config = JOB_CONFIG
    state: Literal["failed"] = "failed"
    message: str


type JobPoll[T: BaseModel] = JobPending | JobDone[T] | JobFailed
