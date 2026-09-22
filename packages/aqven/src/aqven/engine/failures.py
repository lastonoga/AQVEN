from typing import Final

from pydantic import ValidationError

from aqven.engine.blobs import BlobMissing
from aqven.engine.errors import CodeLoadError, CodeSignatureError, SecretUnavailable, ToolJobFailed, ToolJobTimedOut
from aqven.engine.plans import PlanMissing
from aqven.engine.values import RefUnresolved
from aqven.ir import IrLookupError
from aqven.ports.execution import NodeFailed
from aqven.runtime.address import ExecutionAddress
from aqven.runtime.executions import RunError
from aqven.runtime.replay import ToolReplayMiss

NODE_ERROR: Final = "NODE_ERROR"
MESSAGE_LIMIT: Final = 2000

FAILURE_CODES: Final[tuple[tuple[type[Exception], str], ...]] = (
    (RefUnresolved, "REF_UNRESOLVED"),
    (CodeLoadError, "CODE_NOT_FOUND"),
    (CodeSignatureError, "CODE_SIGNATURE"),
    (ValidationError, "IO_INVALID"),
    (ToolReplayMiss, "TOOL_REPLAY_MISS"),
    (SecretUnavailable, "SECRET_MISSING"),
    (ToolJobFailed, "TOOL_JOB_FAILED"),
    (ToolJobTimedOut, "TOOL_JOB_TIMEOUT"),
    (BlobMissing, "BLOB_MISSING"),
    (PlanMissing, "PLAN_MISSING"),
    (IrLookupError, "PLAN_LOOKUP"),
)


def failure_code(error: Exception) -> str:
    return next((code for kind, code in FAILURE_CODES if isinstance(error, kind)), NODE_ERROR)


def run_error(code: str, message: str, address: ExecutionAddress | None) -> RunError:
    return RunError(code=code, message=message[:MESSAGE_LIMIT], address=address)


def failure_of(error: Exception, address: ExecutionAddress | None) -> NodeFailed:
    message = f"{type(error).__name__}: {error}"
    return NodeFailed(error=run_error(failure_code(error), message, address))
