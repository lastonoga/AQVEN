import asyncio
import json

from llm_harness import (
    RecordingSink,
    agent,
    answer_inference,
    answer_node,
    llm_bed,
    more_args,
    thinking,
    tool_call,
)
from pydantic import JsonValue

from aqven.engine.llm import OUTPUT_TOOL_NAME, DeltaBatcher
from aqven.ports.execution import NodeSucceeded, OutputPart

REPLY = '{"reply": "Order in transit", "confidence": 0.9}'
RUN_INPUT: dict[str, JsonValue] = {"question": "where is my order?", "product": None}


def test_strict_output_streams_reasoning_and_output_json_as_it_is_generated() -> None:
    turns = [
        [
            thinking("checking the status"),
            tool_call(OUTPUT_TOOL_NAME, REPLY[:14], "out-1", index=1),
            more_args(REPLY[14:], 1),
        ]
    ]
    bed = llm_bed(turns, answer_node(), [agent()], [answer_inference()], RUN_INPUT)

    outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeSucceeded)
    assert outcome.output == {"reply": "Order in transit", "confidence": 0.9}
    assert outcome.usage.requests == 1
    sink = bed.scope.output
    assert sink.text("reasoning") == "checking the status"
    assert json.loads(sink.text("output_json")) == outcome.output
    output_parts = [
        entry.part for entry in sink.appended() if entry.part is not None and entry.part.kind == "output_json"
    ]
    assert len(output_parts) == 1
    assert output_parts[0].tool_name == OUTPUT_TOOL_NAME
    assert output_parts[0].tool_call_id == "out-1"
    assert {entry.attempt for entry in sink.appended()} == {1}
    assert sink.discards() == []
    output_tool = bed.scripted.seen[0][1].output_tools[0]
    assert output_tool.name == OUTPUT_TOOL_NAME
    assert output_tool.strict is True


def test_zero_batch_window_forwards_every_delta() -> None:
    turns = [[tool_call(OUTPUT_TOOL_NAME, REPLY[:10], "out-1"), more_args(REPLY[10:30]), more_args(REPLY[30:])]]
    bed = llm_bed(turns, answer_node(), [agent()], [answer_inference()], RUN_INPUT, delta_batch_ms=0)

    outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeSucceeded)
    deltas = [entry.delta for entry in bed.scope.output.appended()]
    assert deltas == [REPLY[:10], REPLY[10:30], REPLY[30:]]


def test_prompted_mode_streams_text_parts_as_output_json() -> None:
    turns = [['{"reply": "Done", ', '"confidence": 0.5}']]
    bed = llm_bed(turns, answer_node("prompted"), [agent()], [answer_inference()], RUN_INPUT)

    outcome = asyncio.run(bed.executor.execute(answer_node("prompted"), bed.scope))

    assert isinstance(outcome, NodeSucceeded)
    assert outcome.output == {"reply": "Done", "confidence": 0.5}
    assert bed.scope.output.text("output_json") == '{"reply": "Done", "confidence": 0.5}'
    assert bed.scope.output.text("text") == ""
    assert bed.scripted.seen[0][1].output_tools == []


def test_delta_batcher_coalesces_by_part_and_drains_on_timer() -> None:
    async def scenario() -> list[str]:
        sink = RecordingSink()
        batcher = DeltaBatcher(sink, window_ms=20)
        first = OutputPart(kind="text", index=0)
        await batcher.append(1, first, "a")
        await batcher.append(1, first, "b")
        assert sink.appended() == []
        await asyncio.sleep(0.08)
        await batcher.append(1, OutputPart(kind="reasoning", index=1), "c")
        await batcher.append(2, first, "d")
        await batcher.discard(1, "schema_invalid")
        await batcher.flush()
        return [f"{entry.action}:{entry.attempt}:{entry.delta}" for entry in sink.entries]

    entries = asyncio.run(scenario())

    assert entries == ["append:1:ab", "append:1:c", "append:2:d", "discard:1:", "flush:0:"]
