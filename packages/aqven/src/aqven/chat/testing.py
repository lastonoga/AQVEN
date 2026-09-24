import asyncio
from collections import deque
from collections.abc import AsyncIterable, AsyncIterator, Sequence
from dataclasses import dataclass, field
from typing import Final

from claude_agent_sdk import (
    ClaudeAgentOptions,
    Message,
    PermissionResult,
    PermissionResultDeny,
    ResultMessage,
    ToolPermissionContext,
    ToolResultBlock,
    UserMessage,
)
from pydantic import BaseModel, ConfigDict, JsonValue, ValidationError

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


class _FrameContent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    content: str


class _UserFrame(BaseModel):
    model_config = ConfigDict(extra="ignore")
    uuid: str
    message: _FrameContent


@dataclass(frozen=True, slots=True)
class QueuedPrompt:
    wire_id: str
    text: str

    def replayed(self) -> UserMessage:
        return UserMessage(content=self.text, uuid=self.wire_id)


def queued_prompt(frame: JsonObject) -> QueuedPrompt | None:
    try:
        parsed = _UserFrame.model_validate(frame)
    except ValidationError:
        return None
    return QueuedPrompt(parsed.uuid, parsed.message.content)


def ends_tool_step(step: Message) -> bool:
    if not isinstance(step, UserMessage) or isinstance(step.content, str):
        return False
    return any(isinstance(block, ToolResultBlock) for block in step.content)


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
        self.queued: list[QueuedPrompt] = []
        self.permissions: list[PermissionResult] = []
        self.interrupts = 0
        self.connects = 0
        self.disconnects = 0
        self._turns: deque[ScriptTurn] = deque(turns)
        self._queue: asyncio.Queue[Message | None] = asyncio.Queue()
        self._waiting: deque[QueuedPrompt] = deque()
        self._running: asyncio.Task[None] | None = None

    async def connect(self) -> None:
        self.connects += 1

    async def query(self, prompt: str | AsyncIterable[JsonObject]) -> None:
        if isinstance(prompt, str):
            self.prompts.append(prompt)
            self._start(self._next_script())
            return
        async for frame in prompt:
            self._receive(frame)

    def receive_messages(self) -> AsyncIterator[Message]:
        return self._drain()

    async def interrupt(self) -> None:
        self.interrupts += 1
        if not await self._stop_script():
            return
        self._queue.put_nowait(interrupted_result())
        self._start_waiting()

    async def disconnect(self) -> None:
        self.disconnects += 1
        await self._stop_script()
        self._queue.put_nowait(None)

    def push(self, message: Message | None) -> None:
        self._queue.put_nowait(message)

    async def _drain(self) -> AsyncIterator[Message]:
        while (message := await self._queue.get()) is not None:
            yield message

    def _next_script(self) -> ScriptTurn:
        return self._turns.popleft() if self._turns else ()

    def _start(self, script: ScriptTurn | None) -> None:
        self._running = asyncio.create_task(self._play(script))

    def _start_waiting(self) -> None:
        if self._waiting:
            self._start(None)

    def _receive(self, frame: JsonObject) -> None:
        prompt = queued_prompt(frame)
        if prompt is None:
            return
        self.queued.append(prompt)
        self._waiting.append(prompt)
        if self._running is None or self._running.done():
            self._start(None)

    def _next_waiting_turn(self) -> ScriptTurn | None:
        if not self._waiting:
            return None
        self._queue.put_nowait(self._waiting.popleft().replayed())
        return self._next_script()

    async def _play(self, script: ScriptTurn | None) -> None:
        current = self._next_waiting_turn() if script is None else script
        while current is not None:
            await self._play_turn(current)
            current = self._next_waiting_turn()

    async def _play_turn(self, script: ScriptTurn) -> None:
        for step in script:
            if not await self._step(step):
                return

    async def _step(self, step: ScriptStep) -> bool:
        if isinstance(step, ApprovalStep):
            return await self._ask(step)
        self._queue.put_nowait(step)
        self._absorb_after(step)
        await asyncio.sleep(0)
        return True

    def _absorb_after(self, step: Message) -> None:
        if not ends_tool_step(step):
            return
        while self._waiting:
            self._queue.put_nowait(self._waiting.popleft().replayed())

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
