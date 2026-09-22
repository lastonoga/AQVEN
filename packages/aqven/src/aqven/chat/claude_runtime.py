import uuid
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from typing import Protocol

from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient, Message

from aqven.chat.approvals import ApprovalRegistry
from aqven.chat.claude_cli import LoginProbe
from aqven.chat.claude_options import ClaudeOptionsFactory
from aqven.chat.feed import ChatSignals
from aqven.chat.journal import ChatJournal, Clock, IdFactory


class ClaudeClient(Protocol):
    async def connect(self) -> None: ...

    async def query(self, prompt: str) -> None: ...

    def receive_messages(self) -> AsyncIterator[Message]: ...

    async def interrupt(self) -> None: ...

    async def disconnect(self) -> None: ...


type ClaudeClientFactory = Callable[[ClaudeAgentOptions], ClaudeClient]


def sdk_client(options: ClaudeAgentOptions) -> ClaudeClient:
    return ClaudeSDKClient(options)


def new_chat_id() -> str:
    return str(uuid.uuid7())


@dataclass(frozen=True, slots=True)
class ClaudeChatRuntime:
    journal: ChatJournal
    signals: ChatSignals
    approvals: ApprovalRegistry
    options: ClaudeOptionsFactory
    login: LoginProbe
    clock: Clock
    client_factory: ClaudeClientFactory = sdk_client
    ids: IdFactory = new_chat_id
