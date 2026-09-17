import asyncio
import json
from collections.abc import AsyncIterator, Callable, Mapping
from pathlib import Path
from typing import Final

from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient, Transport
from pydantic import BaseModel, ConfigDict, JsonValue, TypeAdapter

from aqven.chat.claude_runtime import ClaudeClient
from aqven.ports.chat import (
    ApprovalAnswer,
    ChatApprovalRequested,
    ChatEvent,
    ChatMessageRequest,
    ChatReasoningDelta,
    ChatTextDelta,
    ChatToolCallArgsDelta,
    ChatToolCallFinished,
    ChatToolCallStarted,
    ChatTurnFinished,
    ChatUsageReported,
)
from aqven.runtime.address import ClientOpId

from .fixtures import SDK_SESSION, chat_harness, next_event, until_turn_finished

RECORDING: Final[Path] = Path(__file__).parent / "recordings" / "claude_mcp_check_turn.jsonl"
FRAME: Final[TypeAdapter[dict[str, JsonValue]]] = TypeAdapter(dict[str, JsonValue])

type Frame = dict[str, JsonValue]


class WireRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    subtype: str


class WireResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    request_id: str
    response: dict[str, JsonValue] | None = None


class WireFrame(BaseModel):
    model_config = ConfigDict(extra="allow")
    type: str
    request_id: str | None = None
    request: WireRequest | None = None
    response: WireResponse | None = None


def recorded_frames(project_root: Path) -> list[Frame]:
    text = RECORDING.read_text(encoding="utf-8").replace("{project_root}", str(project_root))
    return [FRAME.validate_json(line) for line in text.splitlines() if line.strip()]


class ReplayTransport(Transport):
    def __init__(self, frames: list[Frame]) -> None:
        self._frames = frames
        self._outbox: asyncio.Queue[Frame | None] = asyncio.Queue()
        self._answers: dict[str, asyncio.Future[WireResponse]] = {}
        self._replay: asyncio.Task[None] | None = None
        self.answers: list[WireResponse] = []
        self.prompts: list[Frame] = []
        self._handlers: Mapping[str, Callable[[WireFrame, Frame], None]] = {
            "control_request": self._control_request,
            "control_response": self._control_response,
            "user": self._user_prompt,
        }

    async def connect(self) -> None:
        return

    async def write(self, data: str) -> None:
        raw = FRAME.validate_json(data)
        frame = WireFrame.model_validate(raw)
        handler = self._handlers.get(frame.type)
        if handler is not None:
            handler(frame, raw)

    async def read_messages(self) -> AsyncIterator[Frame]:
        while (frame := await self._outbox.get()) is not None:
            yield frame

    async def close(self) -> None:
        self._outbox.put_nowait(None)

    def is_ready(self) -> bool:
        return True

    async def end_input(self) -> None:
        return

    def _control_request(self, frame: WireFrame, raw: Frame) -> None:
        if frame.request_id is None or frame.request is None:
            return
        success: Frame = {"subtype": "success", "request_id": frame.request_id, "response": {}}
        self._outbox.put_nowait({"type": "control_response", "response": success})

    def _control_response(self, frame: WireFrame, raw: Frame) -> None:
        if frame.response is None:
            return
        self.answers.append(frame.response)
        future = self._answers.pop(frame.response.request_id, None)
        if future is not None:
            future.set_result(frame.response)

    def _user_prompt(self, frame: WireFrame, raw: Frame) -> None:
        self.prompts.append(raw)
        self._replay = asyncio.create_task(self._play())

    async def _play(self) -> None:
        for raw in self._frames:
            frame = WireFrame.model_validate(raw)
            waiting = self._expect_answer(frame)
            self._outbox.put_nowait(raw)
            if waiting is not None:
                await waiting

    def _expect_answer(self, frame: WireFrame) -> asyncio.Future[WireResponse] | None:
        if frame.type != "control_request" or frame.request_id is None:
            return None
        future: asyncio.Future[WireResponse] = asyncio.get_running_loop().create_future()
        self._answers[frame.request_id] = future
        return future


def of_type[E](events: list[ChatEvent], kind: type[E]) -> list[E]:
    return [event for event in events if isinstance(event, kind)]


def test_real_sdk_client_over_recorded_cli_frames(tmp_path: Path) -> None:
    transports: list[ReplayTransport] = []

    def replay_client(options: ClaudeAgentOptions) -> ClaudeClient:
        transport = ReplayTransport(recorded_frames(tmp_path))
        transports.append(transport)
        return ClaudeSDKClient(options, transport=transport)

    harness = chat_harness(tmp_path, replay_client)

    async def scenario() -> list[ChatEvent]:
        session = await harness.backend.start_session(harness.options())
        events = harness.backend.events(session.session_id)
        request = ChatMessageRequest(text="check support_case", client_op_id=ClientOpId("op-1"))
        await harness.backend.send_message(session.session_id, request)
        approval, before = await next_event(events, ChatApprovalRequested)
        await harness.backend.answer_approval(
            session.session_id, ApprovalAnswer(approval_id=approval.approval_id, decision="allow")
        )
        _, after = await until_turn_finished(events)
        await harness.backend.close_session(session.session_id)
        return [*before, *after]

    seen = asyncio.run(scenario())
    transport = transports[0]

    started = of_type(seen, ChatToolCallStarted)
    assert [(event.tool_call_id, event.tool_name, event.mcp_server) for event in started] == [
        ("toolu_01", "aqven_check", "aqven")
    ]
    assert "".join(event.delta for event in of_type(seen, ChatToolCallArgsDelta)) == '{"flow": "support_case"}'
    assert [event.delta for event in of_type(seen, ChatReasoningDelta)] == ["Check the flow first."]
    assert "".join(event.delta for event in of_type(seen, ChatTextDelta)) == "The flow passes aqven check."
    finished = of_type(seen, ChatToolCallFinished)
    assert [(event.status, event.input, event.result_preview) for event in finished] == [
        ("ok", {"flow": "support_case"}, "aqven check: OK")
    ]
    usage = of_type(seen, ChatUsageReported)[0].usage
    assert (usage.tokens_in, usage.tokens_out, str(usage.cost_usd)) == (210, 62, "0.0031")
    assert of_type(seen, ChatTurnFinished)[0].stop_reason == "end_turn"
    assert [json.dumps(answer.response, sort_keys=True) for answer in transport.answers] == [
        json.dumps({"behavior": "allow", "updatedInput": {"flow": "support_case"}}, sort_keys=True)
    ]
    prompt = WireFrame.model_validate(transport.prompts[0])
    assert prompt.model_extra is not None and prompt.model_extra["message"] == {
        "role": "user",
        "content": "check support_case",
    }
    stored = harness.journal.get_session(seen[0].session_id)
    assert stored is not None and stored.backend_session_id == SDK_SESSION and stored.closed
