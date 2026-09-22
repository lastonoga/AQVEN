import asyncio
from datetime import UTC, datetime
from pathlib import Path

from aqven.chat.approvals import ApprovalRegistry
from aqven.chat.codex_approvals import CodexApprovalBridge
from aqven.chat.codex_normalizer import CodexNormalizer
from aqven.chat.feed import ChatEmitter, ChatSignals
from aqven.chat.sqlite_journal import SqliteChatJournal
from aqven.ports.chat import (
    ApprovalAnswer,
    ChatApprovalId,
    ChatApprovalRequested,
    ChatApprovalResolved,
    ChatMessageId,
    ChatSession,
    ChatSessionId,
    ChatTurnId,
)
from aqven.runtime.address import JsonObject


def test_codex_command_approval_waits_for_studio_allow(tmp_path: Path) -> None:
    journal = SqliteChatJournal(tmp_path / "chat.sqlite")
    session = ChatSession(
        session_id=ChatSessionId("session-1"),
        backend="codex",
        project_root=str(tmp_path),
        flow_id=None,
        model=None,
        permission_mode="default",
        created_at=datetime.now(UTC),
        last_seq=0,
    )
    journal.create_session(session, "http://127.0.0.1:9300/mcp")
    emitter = ChatEmitter(journal, ChatSignals(), session.session_id)
    emitter.turn_id = ChatTurnId("turn-1")
    approvals = ApprovalRegistry()

    async def file_details(item_id: str) -> JsonObject | None:
        return {"changes": [{"path": "file.txt", "change": "modified", "diff": "+after"}]}

    async def scenario() -> tuple[tuple[JsonObject, ...], tuple[object, ...]]:
        ids = iter(("approval-1", "approval-2", "approval-3", "approval-4", "approval-5"))
        bridge = CodexApprovalBridge(
            session.session_id,
            emitter,
            approvals,
            CodexNormalizer(ChatMessageId("turn-1"), None),
            lambda: next(ids),
            asyncio.get_running_loop(),
            file_details,
            timeout_seconds=1.0,
        )
        task = asyncio.create_task(
            asyncio.to_thread(
                bridge.handler,
                "item/commandExecution/requestApproval",
                {"itemId": "command-1", "command": "pwd", "cwd": str(tmp_path), "reason": "Run pwd"},
            )
        )
        for _ in range(100):
            if approvals.pending_ids(session.session_id):
                break
            await asyncio.sleep(0.01)
        answer = ApprovalAnswer(approval_id=ChatApprovalId("approval-1"), decision="allow")
        assert approvals.answer(session.session_id, answer)
        allowed = await task
        file_task = asyncio.create_task(
            asyncio.to_thread(bridge.handler, "item/fileChange/requestApproval", {"itemId": "file-1"})
        )
        for _ in range(100):
            if approvals.pending_ids(session.session_id):
                break
            await asyncio.sleep(0.01)
        assert approvals.answer(
            session.session_id, ApprovalAnswer(approval_id=ChatApprovalId("approval-2"), decision="deny")
        )
        denied = await file_task
        timed_out = await asyncio.to_thread(
            bridge.handler, "item/commandExecution/requestApproval", {"itemId": "command-2", "command": "pwd"}
        )
        interrupted_task = asyncio.create_task(
            asyncio.to_thread(
                bridge.handler, "item/commandExecution/requestApproval", {"itemId": "command-3", "command": "pwd"}
            )
        )
        for _ in range(100):
            if approvals.pending_ids(session.session_id):
                break
            await asyncio.sleep(0.01)
        approvals.resolve_session(session.session_id, "interrupt")
        interrupted = await interrupted_task
        closed_task = asyncio.create_task(
            asyncio.to_thread(
                bridge.handler, "item/commandExecution/requestApproval", {"itemId": "command-4", "command": "pwd"}
            )
        )
        for _ in range(100):
            if approvals.pending_ids(session.session_id):
                break
            await asyncio.sleep(0.01)
        approvals.resolve_session(session.session_id, "session_closed")
        closed = await closed_task
        return (allowed, denied, timed_out, interrupted, closed), tuple(journal.read(session.session_id, 0, 100))

    results, events = asyncio.run(scenario())
    journal.close()

    assert results == (
        {"decision": "accept"},
        {"decision": "decline"},
        {"decision": "decline"},
        {"decision": "decline"},
        {"decision": "decline"},
    )
    assert any(isinstance(event, ChatApprovalRequested) and event.tool_call_id == "command-1" for event in events)
    assert any(isinstance(event, ChatApprovalResolved) and event.decision == "allow" for event in events)
    assert any(isinstance(event, ChatApprovalRequested) and event.tool_call_id == "file-1" for event in events)
    assert len([event for event in events if isinstance(event, ChatApprovalResolved) and event.decision == "deny"]) == 4


def test_codex_unknown_and_privilege_expanding_requests_decline() -> None:
    assert CodexApprovalBridge.rejected("item/permissions/requestApproval", {}) == {"decision": "decline"}
    assert CodexApprovalBridge.rejected(
        "item/commandExecution/requestApproval", {"itemId": "tool-1", "additionalPermissions": {"network": True}}
    ) == {"decision": "decline"}
