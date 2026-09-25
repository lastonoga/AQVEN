import asyncio
import itertools
import queue
from collections.abc import Callable
from pathlib import Path

from openai_codex.client import ApprovalHandler, CodexClient, CodexConfig
from openai_codex.errors import InvalidRequestError
from openai_codex.generated.v2_all import (
    AgentMessageDeltaNotification,
    ItemStartedNotification,
    TextUserInput,
    ThreadItem,
    Turn,
    TurnCompletedNotification,
    TurnInterruptResponse,
    TurnStartParams,
    TurnStartResponse,
    TurnStatus,
    UserInput,
    UserMessageThreadItem,
)
from openai_codex.models import JsonObject, Notification
from pydantic import BaseModel, SecretStr

from aqven.chat.codex_backend import CodexAgentBackend
from aqven.chat.codex_runner import STEER_METHOD
from aqven.chat.sqlite_journal import SqliteChatJournal
from aqven.ports.chat import (
    ChatEvent,
    ChatMessageDelivered,
    ChatMessageQueued,
    ChatMessageRequest,
    ChatSessionId,
    ChatSessionOptions,
    ChatStatus,
    ChatTextDelta,
    ChatTurnFinished,
    ChatTurnStarted,
)
from aqven.runtime.address import ClientOpId

from .test_codex_backend import FakeCodexClient

MCP_URL = "http://127.0.0.1:9300/mcp"
WAIT_SECONDS = 5.0

type EventCheck = Callable[[list[ChatEvent]], bool]


def completed(turn_id: str, status: TurnStatus) -> Notification:
    turn = Turn.model_construct(id=turn_id, status=status, duration_ms=9, items=[])
    return Notification("turn/completed", TurnCompletedNotification.model_construct(thread_id="t", turn=turn))


def user_message_started(client_id: str, text: str) -> Notification:
    content = [UserInput(TextUserInput(text=text, type="text"))]
    item = ThreadItem(
        UserMessageThreadItem(id=f"item-{client_id}", client_id=client_id, content=content, type="userMessage")
    )
    payload = ItemStartedNotification.model_construct(item=item, thread_id="t", turn_id="turn")
    return Notification("item/started", payload)


def answer_delta(text: str) -> Notification:
    payload = AgentMessageDeltaNotification(delta=text, item_id="answer", thread_id="t", turn_id="turn")
    return Notification("item/agentMessage/delta", payload)


class SteerableCodexClient(FakeCodexClient):
    def __init__(self, config: CodexConfig, approval_handler: ApprovalHandler) -> None:
        super().__init__(config, approval_handler)
        self.steers: list[JsonObject] = []
        self.started_turns: list[str] = []
        self.refuse_steers = False
        self.read_steers = True
        self.finish_later_turns = True
        self._turn_ids = itertools.count(1)
        self._notifications: queue.Queue[Notification] = queue.Queue()

    def turn_start(
        self,
        thread_id: str,
        input_items: list[JsonObject] | JsonObject | str,
        params: TurnStartParams | JsonObject | None = None,
    ) -> TurnStartResponse:
        turn_id = f"codex-turn-{next(self._turn_ids)}"
        self.started_turns.append(str(input_items))
        if len(self.started_turns) > 1 and self.finish_later_turns:
            self._notifications.put(completed(turn_id, TurnStatus.completed))
        turn = Turn.model_construct(id=turn_id, status=TurnStatus.in_progress)
        return TurnStartResponse.model_construct(turn=turn)

    def next_turn_notification(self, turn_id: str) -> Notification:
        return self._notifications.get(timeout=WAIT_SECONDS)

    def request[M: BaseModel](self, method: str, params: JsonObject | None, *, response_model: type[M]) -> M:
        if method != STEER_METHOD:
            return super().request(method, params, response_model=response_model)
        steer = dict(params or {})
        self.steers.append(steer)
        if self.refuse_steers:
            raise InvalidRequestError(-32600, "cannot steer a review turn")
        if self.read_steers:
            self._notifications.put(user_message_started(str(steer["clientUserMessageId"]), "steered"))
            self._notifications.put(answer_delta("Running the tests too."))
            self._notifications.put(completed(str(steer["expectedTurnId"]), TurnStatus.completed))
        return response_model.model_validate({"turnId": steer["expectedTurnId"]})

    def turn_interrupt(self, thread_id: str, turn_id: str) -> TurnInterruptResponse:
        self._notifications.put(completed(turn_id, TurnStatus.interrupted))
        return TurnInterruptResponse.model_construct()

    def finish_turn(self, turn_id: str) -> None:
        self._notifications.put(completed(turn_id, TurnStatus.completed))


class CodexScenario:
    def __init__(self, tmp_path: Path) -> None:
        self.clients: list[SteerableCodexClient] = []
        self.journal = SqliteChatJournal(tmp_path / "chat.sqlite")
        self.backend = CodexAgentBackend(self.journal, tmp_path, MCP_URL, SecretStr("token"), client_factory=self.make)
        self.project_root = tmp_path

    def make(self, config: CodexConfig, approval_handler: ApprovalHandler) -> CodexClient:
        client = SteerableCodexClient(config, approval_handler)
        self.clients.append(client)
        return client

    async def session(self) -> ChatSessionId:
        options = ChatSessionOptions(project_root=str(self.project_root), mcp_url=MCP_URL)
        return (await self.backend.start_session(options)).session_id

    async def send(self, session_id: ChatSessionId, text: str, op: str) -> str:
        return await self.backend.send_message(session_id, ChatMessageRequest(text=text, client_op_id=ClientOpId(op)))

    def events(self, session_id: ChatSessionId) -> list[ChatEvent]:
        return list(self.journal.read(session_id, 0, 500))

    async def until(self, session_id: ChatSessionId, done: EventCheck) -> None:
        async with asyncio.timeout(WAIT_SECONDS):
            while not done(self.events(session_id)):
                await asyncio.sleep(0.01)

    async def close(self) -> None:
        await self.backend.aclose()
        self.journal.close()


def of_type[E](events: list[ChatEvent], kind: type[E]) -> list[E]:
    return [event for event in events if isinstance(event, kind)]


def streaming(events: list[ChatEvent]) -> bool:
    return any(isinstance(event, ChatStatus) and event.state == "streaming" for event in events)


def finished(count: int) -> EventCheck:
    return lambda events: len(of_type(events, ChatTurnFinished)) >= count


def test_codex_steers_a_message_into_the_running_turn(tmp_path: Path) -> None:
    scenario = CodexScenario(tmp_path)

    async def run() -> tuple[str, str, list[ChatEvent]]:
        session_id = await scenario.session()
        first = await scenario.send(session_id, "one", "op-1")
        await scenario.until(session_id, streaming)
        steered = await scenario.send(session_id, "also run the tests", "op-2")
        await scenario.until(session_id, finished(1))
        events = scenario.events(session_id)
        await scenario.close()
        return first, steered, events

    first, steered, events = asyncio.run(run())
    steer = scenario.clients[0].steers[0]
    queued = of_type(events, ChatMessageQueued)
    delivered = of_type(events, ChatMessageDelivered)

    assert steered == first
    assert [(event.client_op_id, event.delivery) for event in queued] == [("op-2", "next_step")]
    assert [(event.client_op_id, event.turn_id) for event in delivered] == [("op-2", first)]
    assert steer["expectedTurnId"] == "codex-turn-1"
    assert steer["input"] == [{"type": "text", "text": "also run the tests"}]
    assert isinstance(steer["clientUserMessageId"], str)
    assert [event.client_op_id for event in of_type(events, ChatTurnStarted)] == ["op-1"]
    assert [event.stop_reason for event in of_type(events, ChatTurnFinished)] == ["end_turn"]
    assert [(event.message_id, event.delta) for event in of_type(events, ChatTextDelta)] == [
        (f"{first}-2", "Running the tests too.")
    ]


def test_codex_refused_steer_waits_for_the_next_turn(tmp_path: Path) -> None:
    scenario = CodexScenario(tmp_path)

    async def run() -> list[ChatEvent]:
        session_id = await scenario.session()
        await scenario.send(session_id, "one", "op-1")
        await scenario.until(session_id, streaming)
        scenario.clients[0].refuse_steers = True
        await scenario.send(session_id, "two", "op-2")
        scenario.clients[0].finish_turn("codex-turn-1")
        await scenario.until(session_id, finished(2))
        events = scenario.events(session_id)
        await scenario.close()
        return events

    events = asyncio.run(run())

    assert [event.delivery for event in of_type(events, ChatMessageQueued)] == ["next_step", "after_turn"]
    assert of_type(events, ChatMessageDelivered) == []
    assert [event.client_op_id for event in of_type(events, ChatTurnStarted)] == ["op-1", "op-2"]
    assert scenario.clients[0].started_turns[1] == "two"


def test_codex_message_before_the_turn_starts_waits_for_the_next_turn(tmp_path: Path) -> None:
    scenario = CodexScenario(tmp_path)

    async def run() -> list[ChatEvent]:
        session_id = await scenario.session()
        await scenario.send(session_id, "one", "op-1")
        await scenario.send(session_id, "two", "op-2")
        await scenario.until(session_id, streaming)
        scenario.clients[0].finish_turn("codex-turn-1")
        await scenario.until(session_id, finished(2))
        events = scenario.events(session_id)
        await scenario.close()
        return events

    events = asyncio.run(run())

    assert [event.delivery for event in of_type(events, ChatMessageQueued)] == ["after_turn"]
    assert scenario.clients[0].steers == []
    assert [event.client_op_id for event in of_type(events, ChatTurnStarted)] == ["op-1", "op-2"]


def test_codex_stop_requeues_a_steer_the_turn_never_read(tmp_path: Path) -> None:
    scenario = CodexScenario(tmp_path)

    async def run() -> list[ChatEvent]:
        session_id = await scenario.session()
        await scenario.send(session_id, "one", "op-1")
        await scenario.until(session_id, streaming)
        scenario.clients[0].read_steers = False
        await scenario.send(session_id, "two", "op-2")
        await scenario.backend.interrupt(session_id)
        await scenario.until(session_id, finished(2))
        events = scenario.events(session_id)
        await scenario.close()
        return events

    events = asyncio.run(run())

    assert [event.delivery for event in of_type(events, ChatMessageQueued)] == ["next_step", "after_turn"]
    assert [event.client_op_id for event in of_type(events, ChatTurnStarted)] == ["op-1", "op-2"]
    assert [event.stop_reason for event in of_type(events, ChatTurnFinished)] == ["interrupted", "end_turn"]
