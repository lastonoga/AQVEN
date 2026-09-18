import asyncio
from collections.abc import Awaitable, Callable
from typing import Final

from aqven.chat.approvals import ApprovalRegistry, await_verdict
from aqven.chat.builders import approval_requested, approval_resolved, status_changed
from aqven.chat.codex_normalizer import CodexNormalizer
from aqven.chat.feed import ChatEmitter
from aqven.chat.tool_names import ToolIdentity
from aqven.ports.chat import ChatApprovalId, ChatSessionId, ChatToolCallId
from aqven.runtime.address import JsonObject

COMMAND_APPROVAL: Final[str] = "item/commandExecution/requestApproval"
FILE_APPROVAL: Final[str] = "item/fileChange/requestApproval"
PRIVILEGE_KEYS: Final[tuple[str, ...]] = (
    "additionalPermissions",
    "networkApprovalContext",
    "proposedExecpolicyAmendment",
    "proposedNetworkPolicyAmendments",
    "grantRoot",
)
DECLINED: Final[JsonObject] = {"decision": "decline"}
ACCEPTED: Final[JsonObject] = {"decision": "accept"}

type FileDetails = Callable[[str], Awaitable[JsonObject | None]]
type IdFactory = Callable[[], str]


class CodexApprovalBridge:
    def __init__(
        self,
        session_id: ChatSessionId,
        emitter: ChatEmitter,
        approvals: ApprovalRegistry,
        normalizer: CodexNormalizer,
        ids: IdFactory,
        loop: asyncio.AbstractEventLoop,
        file_details: FileDetails,
        timeout_seconds: float = 600.0,
    ) -> None:
        self._session_id = session_id
        self._emitter = emitter
        self._approvals = approvals
        self._normalizer = normalizer
        self._ids = ids
        self._loop = loop
        self._file_details = file_details
        self._timeout_seconds = timeout_seconds

    @staticmethod
    def rejected(method: str, params: JsonObject | None) -> JsonObject | None:
        if method not in (COMMAND_APPROVAL, FILE_APPROVAL) or params is None:
            return DECLINED
        if any(params.get(key) is not None for key in PRIVILEGE_KEYS):
            return DECLINED
        return None

    def handler(self, method: str, params: JsonObject | None) -> JsonObject:
        rejected = self.rejected(method, params)
        if rejected is not None:
            return rejected
        if params is None:
            return DECLINED
        pending = asyncio.run_coroutine_threadsafe(self._request(method, params), self._loop)
        try:
            return pending.result(timeout=self._timeout_seconds + 5.0)
        except Exception:
            pending.cancel()
            return DECLINED

    async def _request(self, method: str, params: JsonObject) -> JsonObject:
        item_id = params.get("itemId")
        if not isinstance(item_id, str) or not item_id or self._emitter.turn_id is None:
            return DECLINED
        tool_input: JsonObject
        if method == FILE_APPROVAL:
            details = await self._file_details(item_id)
            if details is None:
                return DECLINED
            tool_input = details
            identity = ToolIdentity("Edit", None)
        else:
            command = params.get("command")
            if not isinstance(command, str) or not command:
                return DECLINED
            cwd = params.get("cwd")
            tool_input = {"command": command}
            if isinstance(cwd, str):
                tool_input["cwd"] = cwd
            identity = ToolIdentity("Bash", None)
        reason = params.get("reason")
        approval_id = ChatApprovalId(self._ids())
        tool_id = ChatToolCallId(item_id)
        future = self._approvals.open(self._session_id, approval_id)
        self._emitter.emit(
            (
                *self._normalizer.ensure_tool(item_id, identity),
                approval_requested(
                    approval_id,
                    tool_id,
                    identity,
                    tool_input,
                    reason if isinstance(reason, str) else None,
                ),
                status_changed("waiting_approval"),
            )
        )
        try:
            verdict = await await_verdict(future, self._timeout_seconds)
        finally:
            self._approvals.discard(approval_id)
        self._emitter.emit(
            (
                approval_resolved(approval_id, verdict.decision, verdict.resolved_by),
                status_changed("running_tool" if verdict.decision == "allow" else "thinking"),
            )
        )
        return ACCEPTED if verdict.decision == "allow" else DECLINED
