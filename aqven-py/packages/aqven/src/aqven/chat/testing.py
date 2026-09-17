import asyncio
from collections import deque
from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass, field
from typing import Final

from claude_agent_sdk import (
    ClaudeAgentOptions,
    Message,
    PermissionResult,
    PermissionResultDeny,
    ResultMessage,
    ToolPermissionContext,
)
from pydantic import JsonValue

from aqven.runtime.address import JsonObject

SCRIPTED_SESSION_ID: Final[str] = "scripted-session"


@dataclass(frozen=True, slots=True)
class ApprovalStep:
    tool_name: str
    tool_use_id: str
    tool_input: JsonObject = field(default_factory=dict[str, JsonValue])
    reason: str | None = None


type ScriptStep = Message | ApprovalStep
type ScriptTurn = Sequence[ScriptStep]


def interrupted_result(session_id: str = SCRIPTED_SESSION_ID) -> ResultMessage:
    return ResultMessage(
        subtype="error_during_execution",
        duration_ms=5,
        duration_api_ms=0,
        is_error=False,
        num_turns=1,
        session_id=session_id,
        terminal_reason="aborted_streaming",
    )


class ScriptedClaudeClient:
    def __init__(self, options: ClaudeAgentOptions, turns: Sequence[ScriptTurn]) -> None:
        self.options = options
        self.prompts: list[str] = []
        self.permissions: list[PermissionResult] = []
        self.interrupts = 0
        self.connects = 0
        self.disconnects = 0
        self._turns: deque[ScriptTurn] = deque(turns)
        self._queue: asyncio.Queue[Message | None] = asyncio.Queue()
        self._running: asyncio.Task[None] | None = None

    async def connect(self) -> None:
        self.connects += 1

    async def query(self, prompt: str) -> None:
        self.prompts.append(prompt)
        script = self._turns.popleft() if self._turns else ()
        self._running = asyncio.create_task(self._play(script))

    def receive_messages(self) -> AsyncIterator[Message]:
        return self._drain()

    async def interrupt(self) -> None:
        self.interrupts += 1
        if await self._stop_script():
            self._queue.put_nowait(interrupted_result())

    async def disconnect(self) -> None:
        self.disconnects += 1
        await self._stop_script()
        self._queue.put_nowait(None)

    def push(self, message: Message | None) -> None:
        self._queue.put_nowait(message)

    async def _drain(self) -> AsyncIterator[Message]:
        while (message := await self._queue.get()) is not None:
            yield message

    async def _play(self, script: ScriptTurn) -> None:
        for step in script:
            if not await self._step(step):
                return

    async def _step(self, step: ScriptStep) -> bool:
        if not isinstance(step, ApprovalStep):
            self._queue.put_nowait(step)
            await asyncio.sleep(0)
            return True
        return await self._ask(step)

    async def _ask(self, step: ApprovalStep) -> bool:
        callback = self.options.can_use_tool
        if callback is None:
            return True
        context = ToolPermissionContext(tool_use_id=step.tool_use_id, decision_reason=step.reason)
        result = await callback(step.tool_name, dict(step.tool_input), context)
        self.permissions.append(result)
        if isinstance(result, PermissionResultDeny) and result.interrupt:
            self._queue.put_nowait(interrupted_result())
            return False
        return True

    async def _stop_script(self) -> bool:
        running = self._running
        self._running = None
        if running is None or running.done() or running is asyncio.current_task():
            return False
        running.cancel()
        await asyncio.wait((running,))
        return True


class ScriptedClientFactory:
    def __init__(self, *scripts: Sequence[ScriptTurn]) -> None:
        self._scripts: deque[Sequence[ScriptTurn]] = deque(scripts)
        self.clients: list[ScriptedClaudeClient] = []

    def __call__(self, options: ClaudeAgentOptions) -> ScriptedClaudeClient:
        script = self._scripts.popleft() if self._scripts else ()
        client = ScriptedClaudeClient(options, script)
        self.clients.append(client)
        return client
