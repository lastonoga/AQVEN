from collections.abc import Awaitable, Callable, Mapping
from contextlib import AbstractAsyncContextManager
from typing import Annotated, Protocol

from pydantic import BaseModel, Field, JsonValue, SecretStr
from pydantic_ai.messages import UserContent
from pydantic_ai.models import Model

from aqven.engine.llm.segments import PendingToolCall, SegmentResult, SegmentState, ToolCallResult
from aqven.ir import CompiledAgent, CompiledInference, CompiledTool
from aqven.ports.execution import ExecutionScope
from aqven.runtime.address import ExecutionAddress, ResourceModel
from aqven.runtime.human import ToolApprovalDecision
from aqven.runtime.steps import ToolContext
from aqven.spec import MediaValue, Modality, SecretRef, ToolApprovalSpec


class InferenceModels(Protocol):
    def input_model(self, inference: CompiledInference) -> type[BaseModel]: ...

    def output_model(self, inference: CompiledInference) -> type[BaseModel]: ...


class CodeLoader(Protocol):
    def load(self, ref: str) -> object: ...


class ModelSource(Protocol):
    async def model(self, scope: ExecutionScope, agent: CompiledAgent, media: frozenset[Modality]) -> Model: ...


class SecretSource(Protocol):
    async def secret(self, ref: SecretRef) -> SecretStr: ...


class ToolContexts(Protocol):
    def open(
        self, scope: ExecutionScope, tool: CompiledTool, tool_call_id: str, arguments: Mapping[str, JsonValue]
    ) -> AbstractAsyncContextManager[ToolContext]: ...


class MediaLoader(Protocol):
    async def content(self, scope: ExecutionScope, media: MediaValue) -> UserContent: ...


class MediaStore(Protocol):
    async def put(self, scope: ExecutionScope, data: bytes, media_type: str, name: str | None) -> MediaValue: ...


class ApprovalRequest(ResourceModel):
    address: ExecutionAddress
    attempt: Annotated[int, Field(ge=1)]
    spec: ToolApprovalSpec
    calls: tuple[PendingToolCall, ...]


class ApprovalGate(Protocol):
    async def decide(self, scope: ExecutionScope, request: ApprovalRequest) -> Mapping[str, ToolApprovalDecision]: ...


type SegmentWork = Callable[[], Awaitable[SegmentResult]]
type ToolCallWork = Callable[[], Awaitable[ToolCallResult]]


class SegmentSteps(Protocol):
    async def segment(self, scope: ExecutionScope, state: SegmentState, work: SegmentWork) -> SegmentResult: ...

    async def tool_call(self, scope: ExecutionScope, call: PendingToolCall, work: ToolCallWork) -> ToolCallResult: ...
