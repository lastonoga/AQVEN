import asyncio
import json
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Final

import httpx2
import pytest
from llm_harness import (
    Chunk,
    OrderId,
    OrderInfo,
    ScriptedModel,
    agent,
    answer_inference,
    answer_node,
    llm_bed,
    tool_call,
)
from pydantic import JsonValue, TypeAdapter
from pydantic_ai import ModelAPIError, ModelHTTPError
from pydantic_ai.exceptions import FallbackExceptionGroup
from pydantic_ai.messages import ModelMessage
from pydantic_ai.models import Model
from pydantic_ai.models.function import AgentInfo, FunctionModel

from aqven.engine.llm import OUTPUT_TOOL_NAME
from aqven.engine.llm.errors import LlmFailureCode, failure_code
from aqven.engine.llm.failures import FailureAnalysis, FailureContext
from aqven.engine.llm.output_shape import output_shape, shape_summary
from aqven.engine.llm.provider_faults import provider_failure
from aqven.engine.llm.rejections import schema_rejection
from aqven.ir import CodeToolSource, CompiledTool
from aqven.ir.nodes import OutputMode
from aqven.models.backoff import is_transient
from aqven.ports.execution import NodeFailed, NodeSucceeded
from aqven.runtime.executions import OutputShape
from aqven.runtime.steps import ToolContext
from aqven.spec import CodeRef, Effect, Limits, ToolId

FIXTURES: Final = Path(__file__).parent / "fixtures"
RUN_INPUT_ANSWER: Final[dict[str, JsonValue]] = {"question": "where is my order?", "product": None}
JSON_OBJECT: Final[TypeAdapter[dict[str, JsonValue]]] = TypeAdapter(dict[str, JsonValue])
RECORDED: Final = JSON_OBJECT.validate_json((FIXTURES / "openrouter_gemini_schema_rejection.json").read_bytes())
LOOK_SCHEMA: Final = {
    **JSON_OBJECT.validate_json((FIXTURES / "look_output_schema.json").read_bytes()),
    "title": "LookOut",
}
LOOKER_FILE: Final = "agents/looker.yaml"
LOOK_FILE: Final = "flows/face_review/nodes/assess/look.inference.yaml"
GEMINI: Final = "openrouter:google/gemini-2.5-flash-lite"
QWEN: Final = "openrouter:qwen/qwen3.8-max-0902"
GOOGLE_REASON: Final = "The specified schema produces a constraint that has too many states for serving."
LOOKUP_REF: Final = CodeRef("shop.tools:lookup_order")
ORDER_SCHEMA: Final[dict[str, JsonValue]] = {
    "type": "object",
    "properties": {"order_id": {"type": "string"}},
    "required": ["order_id"],
}
FINAL_ANSWER: Final = '{"reply": "done", "confidence": 1}'


def recorded_error() -> ModelHTTPError:
    status = RECORDED["status_code"]
    model = RECORDED["model_name"]
    assert isinstance(status, int) and isinstance(model, str)
    return ModelHTTPError(status, model, RECORDED["body"])


def looker(mode: OutputMode = "tool") -> FailureContext:
    return FailureContext(
        agent_id="looker",
        model=GEMINI,
        mode=mode,
        output_tools=frozenset({OUTPUT_TOOL_NAME}),
        schema=LOOK_SCHEMA,
        inference_id="look",
        agent_file=LOOKER_FILE,
        inference_file=LOOK_FILE,
        node_id="assess__look",
        models=(GEMINI, QWEN),
    )


def http_error(status: int, body: object, model: str = "some/model") -> ModelHTTPError:
    return ModelHTTPError(status, model, body)


def test_the_fixture_is_the_recorded_error_verbatim() -> None:
    assert str(recorded_error()) == RECORDED["message"]


def test_openrouter_body_unwraps_to_the_upstream_google_message() -> None:
    failure = provider_failure(recorded_error())

    assert failure is not None
    assert failure.headline == GOOGLE_REASON
    assert failure.message.startswith(GOOGLE_REASON + " Typical causes")
    assert (failure.status, failure.code, failure.provider) == (400, "INVALID_ARGUMENT", "Google AI Studio")
    assert '"previous_errors"' in failure.raw


def test_the_recorded_gemini_rejection_becomes_output_schema_rejected() -> None:
    error = recorded_error()

    final = FailureAnalysis(looker()).final_error(error, "provider_error", str(error))

    assert final.code == "OUTPUT_SCHEMA_REJECTED"
    assert final.message == f"{GEMINI} rejected the output type LookOut of step assess__look: {GOOGLE_REASON}"
    assert final.hint == (
        "LookOut is too complex for the structured output of this model: deepest nesting findings[].zone "
        "(3 levels), largest maxItems findings (12), largest enum findings[].kind (16 values). "
        f"Lower those limits or flatten the type in {LOOK_FILE} and the types it uses; "
        f"or set output.mode: native or prompted in {LOOKER_FILE} (aqven models check looker shows which work); "
        f"or add fallback_models from another model family in {LOOKER_FILE} "
        "(a retry to the same model gets the same answer); "
        "measure the real limits with aqven models shapes looker --live"
    )
    details = final.details
    assert details is not None
    assert (details.agent, details.model, details.output_mode) == ("looker", GEMINI, "tool")
    assert (details.status_code, details.provider) == (400, "Google AI Studio")
    assert details.provider_code == "INVALID_ARGUMENT"
    assert details.provider_response is not None and "too many states for serving" in details.provider_response
    assert details.raw_excerpt is None
    assert details.output_shape == OutputShape(
        depth=3,
        deepest_path="findings[].zone",
        max_items=12,
        max_items_path="findings",
        enum_size=16,
        enum_path="findings[].kind",
    )


def test_the_same_model_is_not_retried_on_a_schema_rejection() -> None:
    assert not is_transient(recorded_error())


REJECTIONS: Final[tuple[tuple[str, int, JsonValue, OutputMode], ...]] = (
    (
        "google",
        400,
        {
            "error": {
                "code": 400,
                "message": "* GenerateContentRequest.generation_config.response_schema.properties[findings].items: "
                "exceeds the maximum nesting depth",
                "status": "INVALID_ARGUMENT",
            }
        },
        "native",
    ),
    (
        "openai",
        400,
        {
            "message": "Invalid schema for response_format 'LookOut': In context=('properties', 'findings'), "
            "array schema has too many items.",
            "type": "invalid_request_error",
            "param": "response_format",
            "code": None,
        },
        "native",
    ),
    (
        "anthropic",
        400,
        {
            "type": "error",
            "error": {
                "type": "invalid_request_error",
                "message": "tools.0.custom.input_schema: JSON schema is invalid. "
                "It must match JSON Schema draft 2020-12",
            },
        },
        "tool",
    ),
    (
        "openrouter",
        404,
        {"message": "No endpoints found that can handle the requested parameters.", "code": 404},
        "tool",
    ),
)


@pytest.mark.parametrize(("family", "status", "body", "mode"), REJECTIONS, ids=[item[0] for item in REJECTIONS])
def test_each_provider_family_schema_rejection_is_classified(
    family: str, status: int, body: JsonValue, mode: OutputMode
) -> None:
    error = http_error(status, body)
    failure = provider_failure(error)

    assert failure is not None
    rule = schema_rejection(failure, mode)
    assert rule is not None and rule.family == family
    final = FailureAnalysis(looker(mode)).final_error(error, "provider_error", str(error))
    assert final.code == "OUTPUT_SCHEMA_REJECTED"
    assert final.message.startswith("some/model rejected the output type LookOut of step assess__look: ")
    assert final.hint is not None and "aqven models shapes looker --live" in final.hint


def test_no_endpoints_in_prompted_mode_stays_a_provider_error() -> None:
    body = {"message": "No endpoints found that can handle the requested parameters.", "code": 404}

    final = FailureAnalysis(looker("prompted")).final_error(http_error(404, body), "provider_error", "raw")

    assert final.code == "provider_error"
    assert final.message == (
        "model some/model failed: the provider answered HTTP 404: "
        "No endpoints found that can handle the requested parameters."
    )


def test_a_feature_refusal_is_not_mistaken_for_a_schema_rejection() -> None:
    body = {"error": {"message": "No endpoints found that support tool use", "code": 404}}

    final = FailureAnalysis(looker()).final_error(http_error(404, body), "provider_error", "raw")

    assert final.code == "MODEL_FEATURE_UNSUPPORTED"


OPENROUTER_IMAGE_REFUSAL: Final[JsonValue] = {
    "error": {"message": "No endpoints found that support image input", "code": 404}
}
OPENAI_IMAGE_REFUSAL: Final[JsonValue] = {
    "message": "Invalid content type. image_url is only supported by certain models.",
    "type": "invalid_request_error",
    "param": "messages.[0].content.[1].type",
    "code": None,
}
VLLM_IMAGE_REFUSAL: Final[JsonValue] = {
    "object": "error",
    "message": "At most 0 image(s) may be provided in one request.",
    "code": 400,
}
OPENROUTER_AUDIO_REFUSAL: Final[JsonValue] = {
    "error": {"message": "No endpoints found that support input audio", "code": 404}
}


@pytest.mark.parametrize(
    ("status", "body", "medium"),
    [
        pytest.param(404, OPENROUTER_IMAGE_REFUSAL, "images", id="openrouter_image"),
        pytest.param(400, OPENAI_IMAGE_REFUSAL, "images", id="openai_image"),
        pytest.param(400, VLLM_IMAGE_REFUSAL, "images", id="vllm_image"),
        pytest.param(404, OPENROUTER_AUDIO_REFUSAL, "audio", id="openrouter_audio"),
    ],
)
def test_a_provider_refusing_input_media_names_the_media_and_the_way_out(
    status: int, body: JsonValue, medium: str
) -> None:
    final = FailureAnalysis(looker()).final_error(http_error(status, body), "provider_error", "raw")

    assert final.code == "MODEL_FEATURE_UNSUPPORTED"
    assert final.message.startswith(f"model some/model refused a request with {medium}: the provider answered HTTP")
    assert final.hint == f"this model may not accept {medium}; choose a model that does in {LOOKER_FILE}"
    assert final.details is not None and final.details.status_code == status


def test_the_openrouter_image_refusal_reads_as_one_sentence() -> None:
    error = http_error(404, OPENROUTER_IMAGE_REFUSAL, "amazon/nova-lite-v1")

    final = FailureAnalysis(looker()).final_error(error, "provider_error", "raw")

    assert final.message == (
        "model amazon/nova-lite-v1 refused a request with images: "
        "the provider answered HTTP 404: No endpoints found that support image input"
    )


def test_other_provider_errors_keep_the_upstream_message_and_move_the_body_to_details() -> None:
    body = {
        "message": "Provider returned error",
        "code": 429,
        "metadata": {
            "raw": "google/gemini-2.5-flash-lite is temporarily rate-limited upstream. Please retry shortly.",
            "provider_name": "Google",
        },
    }

    final = FailureAnalysis(looker()).final_error(
        http_error(429, body, "google/gemini-2.5-flash-lite"), "provider_error", "raw"
    )

    assert final.code == "provider_error"
    assert final.message == (
        f"model {GEMINI} failed: provider Google answered HTTP 429: "
        "google/gemini-2.5-flash-lite is temporarily rate-limited upstream. Please retry shortly."
    )
    assert final.hint is not None and final.hint.startswith("the provider kept rate-limiting after the retries")
    assert final.details is not None and final.details.provider_response == json.dumps(body, ensure_ascii=False)
    assert "metadata" not in final.message


def test_a_connection_failure_names_the_model_without_an_http_status() -> None:
    error = ModelAPIError("google/gemini-2.5-flash-lite", "Connection error.")

    final = FailureAnalysis(looker()).final_error(error, "provider_error", str(error))

    assert final.code == "provider_error"
    assert final.message == f"model {GEMINI} failed: the call to the provider failed: Connection error."
    assert final.details is not None and final.details.status_code is None


def test_transport_errors_that_escape_the_model_have_failure_codes() -> None:
    assert failure_code(httpx2.ReadTimeout("read timed out")) == LlmFailureCode.TIMEOUT
    assert failure_code(httpx2.ConnectError("connection refused")) == LlmFailureCode.PROVIDER_ERROR


def test_all_fallback_models_failing_reports_each_model_and_keeps_the_specific_code() -> None:
    qwen = http_error(429, {"message": "rate limited", "code": 429}, "qwen/qwen3.8-max-0902")
    group = FallbackExceptionGroup("All models from FallbackModel failed", [recorded_error(), qwen])

    final = FailureAnalysis(looker()).final_error(group, "provider_error", str(group))

    assert failure_code(group) == LlmFailureCode.PROVIDER_ERROR
    assert final.code == "OUTPUT_SCHEMA_REJECTED"
    assert final.message == (
        "all 2 models of agent looker failed: "
        f"{GEMINI} rejected the output type LookOut of step assess__look: {GOOGLE_REASON} | "
        f"model {QWEN} failed: the provider answered HTTP 429: rate limited"
    )
    assert final.details is not None and final.details.model == GEMINI


def test_output_shape_measures_nesting_limits_and_enums_and_survives_recursion() -> None:
    recursive: dict[str, JsonValue] = {
        "$defs": {"Node": {"type": "object", "properties": {"next": {"$ref": "#/$defs/Node"}}}},
        "$ref": "#/$defs/Node",
    }

    shape = output_shape(LOOK_SCHEMA)

    assert shape_summary(shape) == (
        "deepest nesting findings[].zone (3 levels), largest maxItems findings (12), "
        "largest enum findings[].kind (16 values)"
    )
    assert output_shape(recursive).deepest_path == "next"
    assert shape_summary(output_shape({"type": "object", "properties": {"a": {"type": "string"}}})) == ""


MIS_SHAPED: Final = '{"reply": {"text": "Order in transit"}}'


def test_mis_shaped_output_names_the_fields_and_the_actions_after_the_retries() -> None:
    turns: list[list[Chunk]] = [
        [tool_call(OUTPUT_TOOL_NAME, MIS_SHAPED, "out-1")],
        [tool_call(OUTPUT_TOOL_NAME, MIS_SHAPED, "out-2")],
    ]
    writer = agent(file="agents/writer.yaml")
    bed = llm_bed(turns, answer_node(), [writer], [answer_inference(file="answer.inference.yaml")], RUN_INPUT_ANSWER)

    outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeFailed)
    error = outcome.error
    assert error.code == "MODEL_RETRIES_EXHAUSTED"
    assert error.hint == (
        "The model returned an incomplete or mis-shaped answer at reply (wrong value type), confidence (missing). "
        "Tighten the prompt, make the missing fields optional, lower the limits or flatten the type in "
        "answer.inference.yaml; or set output.mode: native or prompted in agents/writer.yaml "
        "(aqven models check writer shows which work); or add fallback_models from another model family in "
        "agents/writer.yaml; measure the real limits with aqven models shapes writer --live"
    )
    assert error.hint not in error.message
    assert error.details is not None
    assert [problem.path for problem in error.details.violations] == [("reply",), ("confidence",)]


def hanging_model(scripted: ScriptedModel) -> Model:
    async def stream(messages: list[ModelMessage], info: AgentInfo) -> AsyncIterator[str]:
        yield '{"reply": '
        await asyncio.Event().wait()

    return FunctionModel(stream_function=stream, model_name="scripted")


def test_a_stream_that_goes_silent_fails_the_step_with_a_clear_code() -> None:
    bed = llm_bed(
        [],
        answer_node("prompted"),
        [agent(file="agents/writer.yaml")],
        [answer_inference()],
        RUN_INPUT_ANSWER,
        models=hanging_model,
        stream_idle_seconds=0.05,
    )

    outcome = asyncio.run(asyncio.wait_for(bed.executor.execute(answer_node("prompted"), bed.scope), 5))

    assert isinstance(outcome, NodeFailed)
    error = outcome.error
    assert error.code == "MODEL_STREAM_STALLED"
    assert error.message == (
        "model openrouter:openai/gpt-oss-20b sent nothing for 0.05 s in step answer; the call was stopped"
    )
    assert error.hint is not None and "add fallback_models from another provider in agents/writer.yaml" in error.hint


def test_the_step_time_limit_names_limits_seconds() -> None:
    limited = agent(file="agents/writer.yaml", limits=Limits(seconds=1))
    bed = llm_bed(
        [],
        answer_node("prompted"),
        [limited],
        [answer_inference()],
        RUN_INPUT_ANSWER,
        models=hanging_model,
        stream_idle_seconds=None,
    )

    outcome = asyncio.run(asyncio.wait_for(bed.executor.execute(answer_node("prompted"), bed.scope), 5))

    assert isinstance(outcome, NodeFailed)
    assert outcome.error.code == "timeout"
    assert outcome.error.message == (
        "step answer ran longer than its limit of 1 s (limits.seconds) with model openrouter:openai/gpt-oss-20b"
    )
    assert outcome.error.hint is not None and outcome.error.hint.startswith("raise limits.seconds")


def test_a_slow_tool_call_does_not_count_as_a_silent_stream() -> None:
    calls: list[str] = []

    async def slow_lookup(ctx: ToolContext, order_id: OrderId) -> OrderInfo:
        await asyncio.sleep(0.3)
        calls.append(order_id)
        return OrderInfo(order_id=order_id, status="shipped")

    tool = CompiledTool(
        tool_id=ToolId("lookup_order"),
        description="tool lookup_order",
        source=CodeToolSource(run=LOOKUP_REF),
        effect=Effect.READ,
        input_schema=ORDER_SCHEMA,
    )
    turns: list[list[Chunk]] = [
        [tool_call("lookup_order", '{"order_id": "LUM-1"}', "call-1")],
        [tool_call(OUTPUT_TOOL_NAME, FINAL_ANSWER, "out-1")],
    ]
    bed = llm_bed(
        turns,
        answer_node(),
        [agent(tools=(ToolId("lookup_order"),))],
        [answer_inference()],
        RUN_INPUT_ANSWER,
        tools=[tool],
        code={LOOKUP_REF: slow_lookup},
        stream_idle_seconds=0.1,
    )

    outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeSucceeded)
    assert calls == ["LUM-1"]
