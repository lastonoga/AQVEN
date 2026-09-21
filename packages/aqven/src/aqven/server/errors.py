from collections.abc import Callable, Mapping
from typing import Final, Literal

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from pydantic import BaseModel, ConfigDict, JsonValue, TypeAdapter
from starlette.exceptions import HTTPException as StarletteHTTPException

from aqven.diagnostics import Diagnostic
from aqven.ports.engine import EngineError
from aqven.runtime.address import JsonObject, Problem, ResourceModel

type ApiErrorCode = Literal[
    "NOT_FOUND",
    "REQUEST_INVALID",
    "INPUT_INVALID",
    "CONTEXT_MISSING",
    "BLOCKING_PROBLEMS",
    "VIEW_TOO_BROAD",
    "STALE_FILE",
    "FILE_VANISHED",
    "FILE_EXISTS",
    "WAIT_ATTEMPT_STALE",
    "TREE_DIRTY",
    "INDEX_STALE",
    "NOT_RUNNABLE",
    "DIRTY_WORKTREE",
    "ALREADY_RESUMED",
    "NOT_WAITING",
    "RUN_TIMED_OUT",
    "RUN_STATE_CONFLICT",
    "CHAT_STATE_CONFLICT",
    "PROMPT_IS_CODE",
    "LOCK_BUSY",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "HOST_NOT_ALLOWED",
    "METHOD_NOT_ALLOWED",
    "INTERNAL",
]

HTTP_STATUS: Final[Mapping[ApiErrorCode, int]] = {
    "NOT_FOUND": 404,
    "REQUEST_INVALID": 422,
    "INPUT_INVALID": 422,
    "CONTEXT_MISSING": 422,
    "BLOCKING_PROBLEMS": 422,
    "VIEW_TOO_BROAD": 422,
    "STALE_FILE": 412,
    "FILE_VANISHED": 412,
    "FILE_EXISTS": 412,
    "WAIT_ATTEMPT_STALE": 412,
    "TREE_DIRTY": 409,
    "INDEX_STALE": 409,
    "NOT_RUNNABLE": 409,
    "DIRTY_WORKTREE": 409,
    "ALREADY_RESUMED": 409,
    "NOT_WAITING": 409,
    "RUN_TIMED_OUT": 409,
    "RUN_STATE_CONFLICT": 409,
    "CHAT_STATE_CONFLICT": 409,
    "PROMPT_IS_CODE": 409,
    "LOCK_BUSY": 423,
    "UNAUTHORIZED": 401,
    "FORBIDDEN": 403,
    "HOST_NOT_ALLOWED": 400,
    "METHOD_NOT_ALLOWED": 405,
    "INTERNAL": 500,
}

HTTP_STATUS_CODES: Final[Mapping[int, ApiErrorCode]] = {
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
}

UNKNOWN_OPERATION: Final = "unknown"
FALLBACK_CODE: Final[ApiErrorCode] = "INTERNAL"
INTERNAL_MESSAGE: Final = "internal server error"


class ApiError(ResourceModel):
    ok: Literal[False] = False
    op: str
    code: ApiErrorCode
    message: str
    problems: tuple[Problem, ...] = ()
    candidates: tuple[JsonValue, ...] = ()
    conflict: JsonObject | None = None
    retry_after_ms: int | None = None


class ApiFailure(Exception):
    def __init__(
        self,
        code: ApiErrorCode,
        message: str,
        *,
        problems: tuple[Problem, ...] = (),
        conflict: JsonObject | None = None,
        status: int | None = None,
    ) -> None:
        super().__init__(f"{code}: {message}")
        self.code: ApiErrorCode = code
        self.message = message
        self.problems = problems
        self.conflict = conflict
        self.status = HTTP_STATUS[code] if status is None else status

    def error(self, op: str) -> ApiError:
        return ApiError(op=op, code=self.code, message=self.message, problems=self.problems, conflict=self.conflict)


class _ValidationItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    loc: tuple[str | int, ...]
    type: str
    msg: str


VALIDATION_ITEMS: Final = TypeAdapter(list[_ValidationItem])

ERROR_RESPONSES: Final[dict[int | str, dict[str, object]]] = {
    status: {"model": ApiError} for status in (400, 401, 403, 404, 409, 412, 422, 423, 500)
}


def not_found(message: str) -> ApiFailure:
    return ApiFailure("NOT_FOUND", message)


def diagnostic_problem(item: Diagnostic) -> Problem:
    return Problem(path=(item.file, *item.path), code=item.code.value, message=item.message)


def validation_problems(errors: object, prefix: tuple[str | int, ...] = ()) -> tuple[Problem, ...]:
    items = VALIDATION_ITEMS.validate_python(errors)
    return tuple(Problem(path=(*prefix, *item.loc), code=item.type, message=item.msg) for item in items)


def operation_name(request: Request) -> str:
    route = request.scope.get("route")
    if isinstance(route, APIRoute):
        return route.operation_id or route.name
    return UNKNOWN_OPERATION


def from_api_failure(error: Exception) -> ApiFailure:
    return error if isinstance(error, ApiFailure) else from_unexpected(error)


def from_engine_error(error: Exception) -> ApiFailure:
    if not isinstance(error, EngineError):
        return from_unexpected(error)
    return ApiFailure(error.code, error.message, problems=error.problems, conflict=error.details)


def from_request_validation(error: Exception) -> ApiFailure:
    if not isinstance(error, RequestValidationError):
        return from_unexpected(error)
    return ApiFailure("REQUEST_INVALID", "request failed validation", problems=validation_problems(error.errors()))


def from_http_exception(error: Exception) -> ApiFailure:
    if not isinstance(error, StarletteHTTPException):
        return from_unexpected(error)
    code: ApiErrorCode = HTTP_STATUS_CODES.get(error.status_code, FALLBACK_CODE)
    return ApiFailure(code, str(error.detail), status=error.status_code)


def from_unexpected(error: Exception) -> ApiFailure:
    return ApiFailure("INTERNAL", INTERNAL_MESSAGE)


type Translator = Callable[[Exception], ApiFailure]

TRANSLATORS: Final[Mapping[type[Exception], Translator]] = {
    ApiFailure: from_api_failure,
    EngineError: from_engine_error,
    RequestValidationError: from_request_validation,
    StarletteHTTPException: from_http_exception,
    Exception: from_unexpected,
}


def translate(error: Exception) -> ApiFailure:
    translator = next(
        (TRANSLATORS[kind] for kind in type(error).__mro__ if kind in TRANSLATORS),
        from_unexpected,
    )
    return translator(error)


def error_response(failure: ApiFailure, op: str) -> JSONResponse:
    return JSONResponse(failure.error(op).model_dump(mode="json"), status_code=failure.status)


async def handle_error(request: Request, error: Exception) -> JSONResponse:
    return error_response(translate(error), operation_name(request))


def install_error_handlers(app: FastAPI) -> None:
    for kind in TRANSLATORS:
        app.add_exception_handler(kind, handle_error)
