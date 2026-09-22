from dataclasses import dataclass
from typing import Final

from dbos import DBOS

from aqven.engine.extensions import RunAwareScope
from aqven.engine.llm.ports import SegmentWork, ToolCallWork
from aqven.engine.llm.segments import PendingToolCall, SegmentResult, SegmentState, ToolCallResult
from aqven.models import call_site
from aqven.ports.execution import ExecutionScope
from aqven.runtime.address import JsonObject, ResourceModel

LLM_SEGMENT_STEP: Final = "aqven.llm_segment"
LLM_TOOL_CALL_STEP: Final = "aqven.llm_tool_call"
FIRST_ATTEMPT: Final = 1


class ToolCallEnvelope(ResourceModel):
    result: ToolCallResult


def scope_attempt(scope: ExecutionScope) -> int:
    return scope.attempt if isinstance(scope, RunAwareScope) else FIRST_ATTEMPT


@DBOS.step(name=LLM_SEGMENT_STEP)
async def llm_segment_step(work: SegmentWork) -> JsonObject:
    result = await work()
    return result.model_dump(mode="json")


@DBOS.step(name=LLM_TOOL_CALL_STEP)
async def llm_tool_call_step(work: ToolCallWork) -> JsonObject:
    result = await work()
    return {"result": result.model_dump(mode="json")}


@dataclass(frozen=True, slots=True)
class DbosSegmentSteps:
    async def segment(self, scope: ExecutionScope, state: SegmentState, work: SegmentWork) -> SegmentResult:
        async def located() -> SegmentResult:
            with call_site(scope.address, scope_attempt(scope)):
                return await work()

        return SegmentResult.model_validate(await llm_segment_step(located))

    async def tool_call(self, scope: ExecutionScope, call: PendingToolCall, work: ToolCallWork) -> ToolCallResult:
        recorded = await llm_tool_call_step(work)
        return ToolCallEnvelope.model_validate(recorded).result
