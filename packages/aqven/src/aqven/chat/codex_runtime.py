import asyncio
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field

from openai_codex.client import ApprovalHandler, CodexClient, CodexConfig
from pydantic import SecretStr

from aqven.chat.approvals import ApprovalRegistry
from aqven.chat.env_guard import ToolRule
from aqven.chat.feed import ChatSignals
from aqven.chat.journal import Clock, IdFactory
from aqven.chat.server_guard import ServerProcessGuard
from aqven.chat.turn_settling import SettlingJournal

type CodexClientFactory = Callable[[CodexConfig, ApprovalHandler], CodexClient]


def sdk_client(config: CodexConfig, approval_handler: ApprovalHandler) -> CodexClient:
    return CodexClient(config, approval_handler=approval_handler)


def new_chat_id() -> str:
    return str(uuid.uuid7())


@dataclass(frozen=True, slots=True)
class CodexChatRuntime:
    journal: SettlingJournal
    signals: ChatSignals
    approvals: ApprovalRegistry
    mcp_token: SecretStr
    clock: Clock
    ids: IdFactory = new_chat_id
    client_factory: CodexClientFactory = sdk_client
    shutdown: asyncio.Event = field(default_factory=asyncio.Event)
    command_guard: ToolRule = field(default_factory=ServerProcessGuard)
