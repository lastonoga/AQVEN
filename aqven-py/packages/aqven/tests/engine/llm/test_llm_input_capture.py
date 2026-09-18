import asyncio

from llm_harness import AT, AnswerIn, AnswerOut, agent, answer_inference, answer_node, llm_bed, tool_call
from pydantic import field_validator

from aqven.engine.llm import OUTPUT_TOOL_NAME, MappedInferenceModels
from aqven.engine.projection import fold_events
from aqven.ir import CompiledVariantSlot, TemplatePrompt
from aqven.runtime.events import RUN_EVENT_ADAPTER, InferenceInputCaptured, InferencePromptCaptured, NodeStarted
from aqven.runtime.values import InlineValue
from aqven.spec import NodeKind

ANSWER = [[tool_call(OUTPUT_TOOL_NAME, '{"reply": "ok", "confidence": 1}', "out-1")]]


class NormalizingInput(AnswerIn):
    @field_validator("question")
    @classmethod
    def strip_question(cls, value: str) -> str:
        return value.strip()


def test_invalid_input_records_bound_document_before_validation() -> None:
    node = answer_node()
    bed = llm_bed(ANSWER, node, [agent()], [answer_inference()], {"question": None, "product": None})

    outcome = asyncio.run(bed.executor.execute(node, bed.scope))

    assert outcome.status == "failed"
    assert outcome.error.code == "input_invalid"
    [bound] = bed.scope.events.emitted
    assert isinstance(bound, InferenceInputCaptured)
    assert bound.stage == "bound"
    assert bound.agent == "writer"
    assert bound.inference == "answer"
    assert bound.input_ref == InlineValue(value={"question": None, "product": None})
    assert bound.variants == {}


def test_normalized_input_and_variants_are_projected_and_round_trip() -> None:
    node = answer_node()
    slot = CompiledVariantSlot(on="$in.product.kind", cases={"mains": "Mains"}, default="General")
    prompt = TemplatePrompt(level=2, template="{{ question }} {{ variants.guide }} {{ output_format }}")
    inference = answer_inference(prompt=prompt, variants={"guide": slot})
    bed = llm_bed(ANSWER, node, [agent()], [inference], {"question": " hello ", "product": {"kind": "other"}})
    bed.executor.segments.agents.inference_models = MappedInferenceModels(
        inputs={"answer": NormalizingInput}, outputs={"answer": AnswerOut}
    )

    outcome = asyncio.run(bed.executor.execute(node, bed.scope))

    assert outcome.status == "ok"
    bound, normalized, captured_prompt = bed.scope.events.emitted
    assert isinstance(bound, InferenceInputCaptured)
    assert isinstance(normalized, InferenceInputCaptured)
    assert (bound.stage, normalized.stage) == ("bound", "normalized")
    assert bound.input_ref == InlineValue(value={"question": " hello ", "product": {"kind": "other"}})
    assert normalized.input_ref == InlineValue(value={"question": "hello", "product": {"kind": "other"}})
    assert normalized.variants == {"guide": "default"}
    assert RUN_EVENT_ADAPTER.validate_json(normalized.model_dump_json()) == normalized
    assert isinstance(captured_prompt, InferencePromptCaptured)
    assert captured_prompt.prompt.output_schema_sent is not None
    assert RUN_EVENT_ADAPTER.validate_json(captured_prompt.model_dump_json()) == captured_prompt
    assert any(
        part.text is not None and "hello General" in part.text
        for message in captured_prompt.prompt.messages
        for part in message.parts
    )

    started = NodeStarted(
        seq=1,
        at=normalized.at,
        run_id=normalized.run_id,
        address=normalized.address,
        kind=NodeKind.LLM,
        attempt=1,
        queued_ms=0,
    )
    fold = fold_events((started, normalized, captured_prompt, bound)).execution(normalized.address)
    assert fold is not None
    assert fold.variants == {"guide": "default"}
    view = fold.view()
    assert (view.agent, view.inference) == ("writer", "answer")
    assert view.input_ref == normalized.input_ref
    assert fold.prompt == captured_prompt.prompt


def test_existing_node_event_projection_has_no_inference_input() -> None:
    node = answer_node()
    bed = llm_bed(ANSWER, node, [agent()], [answer_inference()], {"question": "hello", "product": None})
    started = NodeStarted(
        seq=1,
        at=AT,
        run_id=bed.scope.run_id,
        address=bed.scope.address,
        kind=NodeKind.LLM,
        attempt=1,
        queued_ms=0,
    )

    fold = fold_events((started,)).execution(bed.scope.address)

    assert fold is not None
    assert fold.variants == {}
    assert fold.view().agent is None
    assert fold.view().inference is None
    assert fold.view().input_ref is None
