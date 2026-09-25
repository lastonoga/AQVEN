import asyncio
import uuid
from collections.abc import AsyncIterable, AsyncIterator, Callable, Mapping
from dataclasses import dataclass, field
from typing import Protocol

from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient, Message

from aqven.chat.approvals import ApprovalRegistry
from aqven.chat.claude_cli import LoginProbe
from aqven.chat.claude_options import ClaudeOptionsFactory
from aqven.chat.feed import ChatSignals
from aqven.chat.journal import Clock, IdFactory
from aqven.chat.turn_settling import SettlingJournal
from aqven.runtime.address import JsonObject


class ClaudeClient(Protocol):
    async def connect(self) -> None: ...

    async def query(self, prompt: str | AsyncIterable[JsonObject]) -> None: ...

    def receive_messages(self) -> AsyncIterator[Message]: ...

    async def interrupt(self) -> None: ...

    async def disconnect(self) -> None: ...

    async def get_context_usage(self) -> Mapping[str, object]: ...


type ClaudeClientFactory = Callable[[ClaudeAgentOptions], ClaudeClient]


def sdk_client(options: ClaudeAgentOptions) -> ClaudeClient:
    return ClaudeSDKClient(options)


def new_chat_id() -> str:
    return str(uuid.uuid7())


@dataclass(frozen=True, slots=True)
class ClaudeChatRuntime:
    journal: SettlingJournal
    signals: ChatSignals
    approvals: ApprovalRegistry
    options: ClaudeOptionsFactory
    login: LoginProbe
    clock: Clock
    client_factory: ClaudeClientFactory = sdk_client
    ids: IdFactory = new_chat_id
    shutdown: asyncio.Event = field(default_factory=asyncio.Event)
