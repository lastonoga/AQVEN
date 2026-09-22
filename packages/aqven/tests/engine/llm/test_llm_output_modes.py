import asyncio
import json
import logging
from collections.abc import AsyncIterator
from typing import Annotated, Final

import pytest
from llm_harness import (
    Chunk,
    ScriptedModel,
    agent,
    answer_inference,
    answer_node,
    llm_bed,
    tool_call,
)
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from pydantic import BaseModel, Field, JsonValue, StringConstraints
from pydantic_ai import ModelHTTPError, NativeOutput, PromptedOutput, ToolOutput
from pydantic_ai.exceptions import UserError
from pydantic_ai.messages import ModelMessage
from pydantic_ai.models import Model
from pydantic_ai.models.function import AgentInfo, FunctionModel

from aqven.engine.llm import OUTPUT_TOOL_NAME, output_plan
from aqven.engine.llm.failures import FailureContext, excerpt, feature_unsupported
from aqven.engine.llm.instructions import output_limits
from aqven.engine.llm.telemetry import report_node_failure
from aqven.ir import CompiledAgent, CompiledAgentOutput, OutputMode
from aqven.ports.execution import NodeFailed, NodeSucceeded
from aqven.runtime.address import node_address
from aqven.runtime.events import NodeAttemptFailed
from aqven.runtime.executions import ModelErrorDetails
from aqven.spec import NodeId

RUN_INPUT: Final[dict[str, JsonValue]] = {"question": "where is my order?", "product": None}
AGENT_FILE: Final = "agents/writer.yaml"
INFERENCE_FILE: Final = "flows/support/answer.inference.yaml"
VALID: Final = '{"reply": "Order in transit", "confidence": 0.9}'
TOO_LONG: Final = json.dumps({"reply": "x" * 250, "confidence": 0.5})


class Score(BaseModel):
    criterion: Annotated[str, Field(json_schema_extra={"enum": ["tone", "facts"]})]
    value: Annotated[float, Field(ge=0, le=1)]


class Verdict(BaseModel):
    rationale: Annotated[str, StringConstraints(min_length=10, max_length=600)]
    scores: Annotated[list[Score], Field(max_length=3)]
    best: Annotated[int, Field(ge=0, le=2)] | None


def attempt_events(events: list[object]) -> list[NodeAttemptFailed]:
    return [event for event in events if isinstance(event, NodeAttemptFailed)]


def writer(mode: OutputMode = "tool") -> CompiledAgent:
    return agent(output=CompiledAgentOutput.model_validate({"mode": mode}), file=AGENT_FILE)


def test_each_mode_maps_to_its_pydantic_ai_output_type() -> None:
    tool = output_plan("tool", Verdict, strict=True)
    native = output_plan("native", Verdict, strict=False)
    prompted = output_plan("prompted", Verdict)

    assert isinstance(tool.spec, ToolOutput) and tool.spec.strict is True
    assert tool.output_tools == frozenset({OUTPUT_TOOL_NAME})
    assert isinstance(native.spec, NativeOutput) and native.spec.strict is False
    assert (native.text_kind, native.output_tools) == ("output_json", frozenset())
    assert isinstance(prompted.spec, PromptedOutput)
    assert (tool.mode, native.mode, prompted.mode) == ("tool", "native", "prompted")


def test_output_limits_list_field_limits_from_the_schema() -> None:
    limits = output_limits(Verdict.model_json_schema())

    assert limits == (
        "Output limits (a value outside a limit is rejected and the answer is requested again):\n"
        "- rationale: from 10 to 600 characters\n"
        "- scores: at most 3 items\n"
        '- scores[].criterion: one of "tone", "facts"\n'
        "- scores[].value: from 0 to 1\n"
        "- best: from 0 to 2"
    )


@pytest.mark.parametrize("mode", ["tool", "native", "prompted"])
def test_every_mode_sends_the_same_limits_and_the_known_model_instruction(mode: OutputMode) -> None:
    turns: list[list[Chunk]] = [[tool_call(OUTPUT_TOOL_NAME, VALID, "out-1")]] if mode == "tool" else [[VALID]]
    output = CompiledAgentOutput.model_validate({"mode": mode, "instruction": "JSON only"})
    bed = llm_bed(turns, answer_node(mode), [agent(output=output)], [answer_inference()], RUN_INPUT)

    outcome = asyncio.run(bed.executor.execute(answer_node(mode), bed.scope))

    assert isinstance(outcome, NodeSucceeded)
    info = bed.scripted.seen[0][1]
    assert info.instructions is not None
    assert "- reply: at most 200 characters\n\nJSON only" in info.instructions
    assert info.model_request_parameters.output_mode == mode


def test_text_instead_of_the_output_tool_fails_with_a_mode_hint() -> None:
    turns: list[list[Chunk]] = [[VALID], [VALID]]
    bed = llm_bed(turns, answer_node(), [writer()], [answer_inference(file=INFERENCE_FILE)], RUN_INPUT)

    outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeFailed)
    error = outcome.error
    assert error.code == "MODEL_RETRIES_EXHAUSTED"
    assert error.hint == f"set output.mode: prompted in {AGENT_FILE}"
    assert error.details is not None
    assert (error.details.agent, error.details.output_mode, error.details.attempt) == ("writer", "tool", 2)
    assert error.details.raw_excerpt == VALID
    events = attempt_events(list(bed.scope.events.emitted))
    assert [(event.attempt, event.cause.code, event.action) for event in events] == [
        (1, "MODEL_NO_STRUCTURED_OUTPUT", "repair"),
        (2, "MODEL_NO_STRUCTURED_OUTPUT", "none"),
    ]
    assert events[0].cause.kind == "no_structured_output"
    assert bed.scope.output.discards() == [(1, "no_structured_output"), (2, "no_structured_output")]


def test_schema_violation_names_the_field_limit_and_the_file_then_repairs() -> None:
    turns: list[list[Chunk]] = [
        [tool_call(OUTPUT_TOOL_NAME, TOO_LONG, "out-1")],
        [tool_call(OUTPUT_TOOL_NAME, VALID, "out-2")],
    ]
    bed = llm_bed(turns, answer_node(), [writer()], [answer_inference(file=INFERENCE_FILE)], RUN_INPUT)

    outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeSucceeded)
    (event,) = attempt_events(list(bed.scope.events.emitted))
    cause = event.cause
    assert (event.attempt, event.action, cause.code, cause.kind) == (
        1,
        "repair",
        "MODEL_SCHEMA_MISMATCH",
        "schema_invalid",
    )
    assert cause.hint == (
        f"field reply is longer than 200 characters: tighten the prompt or raise maxLength in {INFERENCE_FILE}"
    )
    assert [(problem.path, problem.code) for problem in cause.schema_errors] == [(("reply",), "string_too_long")]
    assert cause.details is not None
    assert cause.details.raw_excerpt == TOO_LONG
    assert bed.scope.output.discards() == [(1, "schema_invalid")]


def test_failed_attempt_keeps_complete_redacted_model_output() -> None:
    raw = json.dumps({"reply": "mail me at anna@example.com " + "x" * 2500, "confidence": 0.5})
    bed = llm_bed(
        [[tool_call(OUTPUT_TOOL_NAME, raw, "out-1")], [tool_call(OUTPUT_TOOL_NAME, VALID, "out-2")]],
        answer_node(),
        [writer()],
        [answer_inference()],
        RUN_INPUT,
    )

    outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeSucceeded)
    (event,) = attempt_events(list(bed.scope.events.emitted))
    details = event.cause.details
    assert details is not None
    assert details.raw_excerpt == raw.replace("anna@example.com", "<EMAIL>")
    assert details.raw_excerpt is not None and len(details.raw_excerpt) > 2000


def test_prompted_text_that_is_not_json_is_classified_as_invalid_json() -> None:
    turns: list[list[Chunk]] = [["Sure! Here it is: {reply: ok}"], ["still not json"]]
    bed = llm_bed(turns, answer_node("prompted"), [writer("prompted")], [answer_inference()], RUN_INPUT)

    outcome = asyncio.run(bed.executor.execute(answer_node("prompted"), bed.scope))

    assert isinstance(outcome, NodeFailed)
    assert outcome.error.code == "MODEL_RETRIES_EXHAUSTED"
    assert outcome.error.message.endswith("not valid JSON: Invalid JSON: expected value at line 1 column 1")
    assert outcome.error.hint is not None and outcome.error.hint.startswith("the model writes text around the JSON")
    events = attempt_events(list(bed.scope.events.emitted))
    assert [event.cause.code for event in events] == ["MODEL_INVALID_JSON", "MODEL_INVALID_JSON"]
    assert bed.scope.output.discards() == [(1, "invalid_json"), (2, "invalid_json")]


def test_native_mode_parses_the_json_answer() -> None:
    bed = llm_bed([[VALID]], answer_node("native"), [writer("native")], [answer_inference()], RUN_INPUT)

    outcome = asyncio.run(bed.executor.execute(answer_node("native"), bed.scope))

    assert isinstance(outcome, NodeSucceeded)
    assert outcome.output == json.loads(VALID)
    assert bed.scripted.seen[0][1].model_request_parameters.output_mode == "native"
    assert bed.scope.output.text("output_json") == VALID


def rejecting_model(scripted: ScriptedModel) -> Model:
    async def stream(messages: list[ModelMessage], info: AgentInfo) -> AsyncIterator[str]:
        body: JsonValue = {"error": {"message": "No endpoints found that support tool use", "code": 404}}
        raise ModelHTTPError(status_code=404, model_name="scripted", body=body)
        yield ""

    return FunctionModel(stream_function=stream, model_name="scripted")


def test_provider_rejection_of_the_output_tool_is_feature_unsupported(caplog: pytest.LogCaptureFixture) -> None:
    bed = llm_bed([], answer_node(), [writer()], [answer_inference()], RUN_INPUT, models=rejecting_model)

    with caplog.at_level(logging.ERROR, logger="aqven.engine.llm"):
        outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeFailed)
    assert outcome.error.code == "MODEL_FEATURE_UNSUPPORTED"
    assert outcome.error.hint == f"set output.mode: prompted in {AGENT_FILE}"
    (record,) = [record for record in caplog.records if record.name == "aqven.engine.llm"]
    assert getattr(record, "aqven.error.code") == "MODEL_FEATURE_UNSUPPORTED"
    assert getattr(record, "aqven.output.mode") == "tool"


def test_provider_rejection_keeps_complete_redacted_response_body() -> None:
    body = "No endpoints found that support tool use; mail anna@example.com " + "x" * 2500
    context = FailureContext(
        agent_id="qwen",
        model="openrouter:qwen/x",
        mode="tool",
        output_tools=frozenset(),
        schema={},
        inference_id="judge",
    )

    final = feature_unsupported(ModelHTTPError(404, "qwen", body), context)

    assert final is not None and final.details is not None
    assert final.details.raw_excerpt == body.replace("anna@example.com", "<EMAIL>")
    assert final.details.raw_excerpt is not None and len(final.details.raw_excerpt) > 2000
    assert len(final.message) < 500


def test_node_failure_is_one_log_record_and_span_attributes(caplog: pytest.LogCaptureFixture) -> None:
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    details = ModelErrorDetails(agent="qwen", model="openrouter:qwen/x", output_mode="tool", attempt=2)

    with (
        caplog.at_level(logging.ERROR, logger="aqven.engine.llm"),
        provider.get_tracer("test").start_as_current_span("node"),
    ):
        report_node_failure(node_address(NodeId("judge")), "MODEL_RETRIES_EXHAUSTED", "no output", "set x", details)

    (record,) = caplog.records
    assert record.getMessage() == "MODEL_RETRIES_EXHAUSTED: no output; hint: set x"
    (span,) = exporter.get_finished_spans()
    assert span.attributes is not None
    assert (span.attributes["aqven.error.code"], span.attributes["aqven.agent.id"]) == (
        "MODEL_RETRIES_EXHAUSTED",
        "qwen",
    )
    assert (span.attributes["aqven.attempt"], span.attributes["aqven.error.hint"]) == (2, "set x")
    assert span.events[0].name == "aqven.model_output.node_failed"


def test_excerpt_is_redacted_and_limited_to_300_characters() -> None:
    text = excerpt("mail me at anna@example.com " + "y" * 400)

    assert text.startswith("mail me at <EMAIL> ")
    assert len(text) == 300


def test_client_side_refusal_of_a_mode_is_feature_unsupported() -> None:
    context = FailureContext(
        agent_id="qwen",
        model="openrouter:qwen/qwen3.8-max-0902",
        mode="native",
        output_tools=frozenset(),
        schema={},
        inference_id="judge",
        agent_file="agents/qwen.yaml",
    )

    final = feature_unsupported(UserError("Native structured output is not supported by this model."), context)

    assert final is not None
    assert final.code == "MODEL_FEATURE_UNSUPPORTED"
    assert final.hint == (
        "set output.mode: tool or prompted in agents/qwen.yaml; aqven models check qwen shows which modes work"
    )
