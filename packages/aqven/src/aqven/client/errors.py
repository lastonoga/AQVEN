from typing import Literal

import httpx2
from pydantic import JsonValue, ValidationError

from aqven.runtime import JsonObject, Problem, ResourceModel, RunId


class ApiError(ResourceModel):
    ok: Literal[False] = False
    op: str
    code: str
    message: str
    problems: tuple[Problem, ...] = ()
    candidates: tuple[JsonValue, ...] = ()
    conflict: JsonObject | None = None
    retry_after_ms: int | None = None


class ApiErrorResponse(Exception):
    def __init__(self, status_code: int, error: ApiError) -> None:
        super().__init__(f"{status_code} {error.code}: {error.message}")
        self.status_code = status_code
        self.error = error


class UnexpectedResponse(Exception):
    def __init__(self, status_code: int, body: str) -> None:
        super().__init__(f"{status_code}: response is not an ApiError")
        self.status_code = status_code
        self.body = body


class BlobIntegrityError(Exception):
    def __init__(self, blob_id: str, actual: str) -> None:
        super().__init__(f"bytes of blob {blob_id} arrived with hash {actual}")
        self.blob_id = blob_id
        self.actual = actual


class EventStreamLost(Exception):
    def __init__(self, run_id: RunId, last_seq: int) -> None:
        super().__init__(f"event stream of run {run_id} broke after seq {last_seq} without run_finished")
        self.run_id = run_id
        self.last_seq = last_seq


def response_failure(response: httpx2.Response) -> ApiErrorResponse | UnexpectedResponse:
    try:
        error = ApiError.model_validate_json(response.content)
    except ValidationError:
        return UnexpectedResponse(response.status_code, response.text)
    return ApiErrorResponse(response.status_code, error)


async def raise_for_failure(response: httpx2.Response) -> None:
    if response.is_success:
        return
    await response.aread()
    raise response_failure(response)
