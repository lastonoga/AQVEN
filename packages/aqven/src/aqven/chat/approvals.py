import asyncio
from dataclasses import dataclass
from typing import Final

from aqven.ports.chat import ApprovalAnswer, ApprovalDecision, ApprovalResolver, ChatApprovalId, ChatSessionId


@dataclass(frozen=True, slots=True)
class ApprovalVerdict:
    decision: ApprovalDecision
    message: str | None
    resolved_by: ApprovalResolver


DEFAULT_APPROVAL_TIMEOUT_SECONDS: Final[float] = 600.0
TIMED_OUT_VERDICT: Final[ApprovalVerdict] = ApprovalVerdict(
    "deny", "No answer from AQVEN Studio before the approval timeout; the turn was stopped.", "interrupt"
)
DENY_MESSAGES: Final[dict[ApprovalResolver, str]] = {
    "user": "The user denied this tool call in AQVEN Studio.",
    "interrupt": "The user interrupted the turn in AQVEN Studio.",
    "session_closed": "The chat session was closed in AQVEN Studio.",
}


def forced_verdict(resolved_by: ApprovalResolver) -> ApprovalVerdict:
    return ApprovalVerdict("deny", DENY_MESSAGES[resolved_by], resolved_by)


@dataclass(frozen=True, slots=True)
class _Pending:
    session_id: ChatSessionId
    future: asyncio.Future[ApprovalVerdict]


class ApprovalRegistry:
    def __init__(self) -> None:
        self._pending: dict[ChatApprovalId, _Pending] = {}

    def open(self, session_id: ChatSessionId, approval_id: ChatApprovalId) -> asyncio.Future[ApprovalVerdict]:
        future: asyncio.Future[ApprovalVerdict] = asyncio.get_running_loop().create_future()
        self._pending[approval_id] = _Pending(session_id, future)
        return future

    def answer(self, session_id: ChatSessionId, answer: ApprovalAnswer) -> bool:
        pending = self._pending.get(answer.approval_id)
        if pending is None or pending.session_id != session_id or pending.future.done():
            return False
        pending.future.set_result(ApprovalVerdict(answer.decision, answer.message, "user"))
        return True

    def resolve_session(self, session_id: ChatSessionId, resolved_by: ApprovalResolver) -> int:
        open_futures = [
            pending.future
            for pending in self._pending.values()
            if pending.session_id == session_id and not pending.future.done()
        ]
        for future in open_futures:
            future.set_result(forced_verdict(resolved_by))
        return len(open_futures)

    def discard(self, approval_id: ChatApprovalId) -> None:
        self._pending.pop(approval_id, None)

    def pending_ids(self, session_id: ChatSessionId) -> tuple[ChatApprovalId, ...]:
        return tuple(
            approval_id
            for approval_id, pending in self._pending.items()
            if pending.session_id == session_id and not pending.future.done()
        )


async def await_verdict(future: asyncio.Future[ApprovalVerdict], timeout_seconds: float) -> ApprovalVerdict:
    try:
        return await asyncio.wait_for(asyncio.shield(future), timeout_seconds)
    except TimeoutError:
        return TIMED_OUT_VERDICT
