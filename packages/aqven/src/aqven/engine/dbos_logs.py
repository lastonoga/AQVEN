import logging
import re
from dataclasses import dataclass
from typing import Final

from dbos import error as dbos_errors
from pydantic import ValidationError

from aqven.engine.addressing import CHILD_WORKFLOW_SEPARATOR
from aqven.log_support import RuleChain, address_label, exception_of, rewritten, short_id
from aqven.runtime.address import ExecutionAddress

DBOS_LOGGER_NAME: Final = "dbos"
CANCELLATION_ERRORS: Final = (
    dbos_errors.DBOSAwaitedWorkflowCancelledError,
    dbos_errors.DBOSWorkflowCancelledError,
)


@dataclass(frozen=True, slots=True)
class CancellationNotice:
    pattern: re.Pattern[str]
    outcome: str


CANCELLATION_NOTICES: Final[tuple[CancellationNotice, ...]] = (
    CancellationNotice(re.compile(r"^Workflow (?P<workflow_id>\S+) was cancelled during execution"), "cancelled"),
    CancellationNotice(
        re.compile(r"^Workflow (?P<workflow_id>\S+) outcome was not recorded: the workflow is no longer owned"),
        "finished after it was cancelled; its result was dropped",
    ),
)


def matched_notice(message: str, notices: tuple[CancellationNotice, ...]) -> tuple[str, str] | None:
    for notice in notices:
        found = notice.pattern.match(message)
        if found is not None:
            return found["workflow_id"], notice.outcome
    return None


@dataclass(frozen=True, slots=True)
class CancelledBranchNotice:
    notices: tuple[CancellationNotice, ...] = CANCELLATION_NOTICES

    def apply(self, record: logging.LogRecord) -> logging.LogRecord | None:
        matched = matched_notice(record.getMessage(), self.notices)
        if matched is None:
            return record
        workflow_id, outcome = matched
        run_id = workflow_id.split(CHILD_WORKFLOW_SEPARATOR, 1)[0]
        extras = {"run_id": run_id, "workflow_id": workflow_id}
        return rewritten(record, logging.DEBUG, f"{workflow_label(workflow_id)} {outcome}", extras)


@dataclass(frozen=True, slots=True)
class CancelledBranchError:
    def apply(self, record: logging.LogRecord) -> logging.LogRecord | None:
        return None if isinstance(exception_of(record), CANCELLATION_ERRORS) else record


class CancelledBranchFilter(RuleChain):
    def __init__(self) -> None:
        super().__init__((CancelledBranchError(), CancelledBranchNotice()))


def workflow_label(workflow_id: str) -> str:
    run_id, _, rest = workflow_id.partition(CHILD_WORKFLOW_SEPARATOR)
    if not rest:
        return f"run {short_id(run_id)}"
    address = branch_address(rest.rsplit(CHILD_WORKFLOW_SEPARATOR, 1)[-1])
    if address is None:
        return f"workflow {workflow_id}"
    return f"branch {address_label(address)} of run {short_id(run_id)}"


def branch_address(text: str) -> ExecutionAddress | None:
    try:
        return ExecutionAddress.model_validate_json(text)
    except ValidationError:
        return None


def route_dbos_logs() -> None:
    logger = logging.getLogger(DBOS_LOGGER_NAME)
    if not any(isinstance(item, CancelledBranchFilter) for item in logger.filters):
        logger.addFilter(CancelledBranchFilter())
    if not logging.getLogger().handlers or logger.handlers:
        return
    logger.addHandler(logging.NullHandler())
    logger.propagate = True
