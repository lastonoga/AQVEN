from typing import Annotated, Literal

from pydantic import Field, JsonValue

from aqven.runtime.address import ExecutionAddress, JsonObject, RequestModel
from aqven.spec import McpServerId

type ProviderFaultKind = Literal["provider_error"]


class McpToolStub(RequestModel):
    server: McpServerId
    tool: Annotated[str, Field(min_length=1)]
    arguments: JsonObject | None = None
    result: JsonValue


class ProviderFault(RequestModel):
    address: ExecutionAddress
    model: str
    kind: ProviderFaultKind = "provider_error"
    attempt: Annotated[int, Field(ge=1)] = 1


class ToolReplayMiss(Exception):
    def __init__(self, address: ExecutionAddress, reason: str) -> None:
        super().__init__(f"offline replay: tool at {address.model_dump_json()} cannot run live: {reason}")
        self.address = address
        self.reason = reason
