from collections.abc import Mapping
from typing import Final, Literal

from pydantic import JsonValue

from aqven.diagnostics import Diagnostic
from aqven.runtime.address import ResourceModel

type WriteErrorCode = Literal[
    "NOT_FOUND",
    "REQUEST_INVALID",
    "BLOCKING_PROBLEMS",
    "STALE_FILE",
    "FILE_VANISHED",
    "FILE_EXISTS",
    "PROMPT_IS_CODE",
    "LOCK_BUSY",
    "INTERNAL",
]

type RebaseMode = Literal["auto", "manual"]

WRITE_ERROR_STATUS: Final[Mapping[WriteErrorCode, int]] = {
    "NOT_FOUND": 404,
    "REQUEST_INVALID": 422,
    "BLOCKING_PROBLEMS": 422,
    "STALE_FILE": 412,
    "FILE_VANISHED": 412,
    "FILE_EXISTS": 412,
    "PROMPT_IS_CODE": 409,
    "LOCK_BUSY": 423,
    "INTERNAL": 500,
}


class DraftTexts(ResourceModel):
    draft: str
    base: str | None
    disk: str | None


class WriteConflict(ResourceModel):
    path: str
    your_hash: str | None
    current_hash: str | None
    ops_since: tuple[JsonValue, ...] = ()
    rebase: RebaseMode = "manual"
    rebased_ops: tuple[JsonValue, ...] = ()
    texts: DraftTexts | None = None


class WriteError(Exception):
    def __init__(
        self,
        code: WriteErrorCode,
        message: str,
        *,
        problems: tuple[Diagnostic, ...] = (),
        candidates: tuple[JsonValue, ...] = (),
        conflict: WriteConflict | None = None,
        retry_after_ms: int | None = None,
    ) -> None:
        super().__init__(f"{code}: {message}")
        self.code: WriteErrorCode = code
        self.message = message
        self.problems = problems
        self.candidates = candidates
        self.conflict = conflict
        self.retry_after_ms = retry_after_ms

    @property
    def status(self) -> int:
        return WRITE_ERROR_STATUS[self.code]


def not_found(message: str) -> WriteError:
    return WriteError("NOT_FOUND", message)


def request_invalid(message: str, *, candidates: tuple[JsonValue, ...] = ()) -> WriteError:
    return WriteError("REQUEST_INVALID", message, candidates=candidates)
