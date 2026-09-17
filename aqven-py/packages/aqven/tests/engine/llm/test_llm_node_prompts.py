import asyncio

from llm_harness import (
    LlmBed,
    agent,
    answer_inference,
    answer_node,
    level_three_prompt,
    llm_bed,
    request_texts,
    tool_call,
)
from pydantic import JsonValue
from pydantic_ai.messages import ModelRequest, ModelResponse, TextPart

from aqven.engine.llm import OUTPUT_TOOL_NAME, SegmentCompleted, SegmentState
from aqven.ir import CodePrompt, CompiledInference, CompiledVariantSlot, TemplatePrompt
from aqven.ports.execution import NodeFailed, NodeSucceeded
from aqven.spec import CodeRef, ExampleSpec

PROMPT_REF = CodeRef("shop.prompts:level_three_prompt")
TEMPLATE = (
    "{% message system %}Voice: {% include 'fragments/voice' %}{% endmessage %}\n"
    "{% message user %}{{ question }}\n{{ variants.guide }}\n{{ output_format }}{% endmessage %}\n"
)
ANSWER = [[tool_call(OUTPUT_TOOL_NAME, '{"reply": "ok", "confidence": 1}', "out-1")]]
REPLY_LIMITS = (
    "Output limits (a value outside a limit is rejected and the answer is requested again):\n"
    "- reply: at most 200 characters"
)


def _variant_inference() -> CompiledInference:
    slot = CompiledVariantSlot(
        on="$in.product.kind",
        cases={"mains": "Tips for a mains lamp: {{ question }}", "smart": "Tips for a smart lamp"},
        default="General tips",
    )
    prompt = TemplatePrompt(level=2, template=TEMPLATE, partials={"fragments/voice": "polite and brief"})
    return answer_inference(prompt=prompt, variants={"guide": slot})


def _segment(bed: LlmBed) -> SegmentCompleted:
    result = asyncio.run(bed.executor.segments.run(answer_node(), bed.scope, SegmentState()))
    assert isinstance(result.outcome, SegmentCompleted)
    return result.outcome


def test_variant_is_selected_by_input_and_rendered_with_the_same_inputs() -> None:
    run_input: dict[str, JsonValue] = {"question": "lamp is blinking", "product": {"kind": "mains"}}
    bed = llm_bed(ANSWER, answer_node(), [agent(instructions="Support agent")], [_variant_inference()], run_input)

    outcome = _segment(bed)

    assert outcome.variants == {"guide": "mains"}
    messages, info = bed.scripted.seen[0]
    prompt = request_texts(messages)[-1]
    assert prompt.startswith("lamp is blinking\nTips for a mains lamp: lamp is blinking\nOutput fields:")
    assert info.instructions == "Support agent\n\nVoice: polite and brief\n\n" + REPLY_LIMITS


def test_default_variant_covers_unknown_and_null_selectors() -> None:
    products: list[JsonValue] = [{"kind": "zigbee"}, None]
    for product in products:
        run_input: dict[str, JsonValue] = {"question": "does not turn on", "product": product}
        bed = llm_bed(ANSWER, answer_node(), [agent()], [_variant_inference()], run_input)

        outcome = _segment(bed)

        assert outcome.variants == {"guide": "default"}
        assert "General tips" in request_texts(bed.scripted.seen[0][0])[-1]


def test_missing_variant_without_default_fails_the_node() -> None:
    inference = _variant_inference()
    slot = inference.variants["guide"].model_copy(update={"default": None})
    broken = inference.model_copy(update={"variants": {"guide": slot}})
    run_input: dict[str, JsonValue] = {"question": "does not turn on", "product": None}
    bed = llm_bed(ANSWER, answer_node(), [agent()], [broken], run_input)

    outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeFailed)
    assert outcome.error.code == "prompt_invalid"
    assert bed.scripted.seen == []


def test_instruction_level_prompt_gets_inputs_and_output_format_appended() -> None:
    inference = answer_inference(prompt=TemplatePrompt(level=1, template="Answer the customer."))
    run_input: dict[str, JsonValue] = {"question": "where is my order?", "product": None}
    bed = llm_bed(ANSWER, answer_node(), [agent()], [inference], run_input)

    outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeSucceeded)
    prompt = request_texts(bed.scripted.seen[0][0])[-1]
    assert prompt.startswith('Answer the customer.\n\nInputs:\n\nquestion (field question):\n"where is my order?"')
    assert prompt.endswith("Output fields:\n- reply: field reply\n- confidence: field confidence")


def test_code_prompt_function_builds_messages_from_typed_inputs() -> None:
    inference = answer_inference(prompt=CodePrompt(run=PROMPT_REF))
    run_input: dict[str, JsonValue] = {"question": "where is my order?", "product": {"kind": "smart"}}
    bed = llm_bed(ANSWER, answer_node(), [agent()], [inference], run_input, code={PROMPT_REF: level_three_prompt})

    outcome = _segment(bed)

    messages, info = bed.scripted.seen[0]
    assert request_texts(messages) == ["where is my order? [smart]"]
    assert info.instructions == "You are a support operator\n\n" + REPLY_LIMITS
    assert outcome.variants == {}


def test_examples_become_history_before_the_prompt() -> None:
    example = ExampleSpec.model_validate(
        {"name": "example", "in": {"question": "where is the parcel?"}, "out": {"reply": "in transit", "confidence": 1}}
    )
    inference = answer_inference(examples=(example,))
    run_input: dict[str, JsonValue] = {"question": "where is my order?", "product": None}
    bed = llm_bed(ANSWER, answer_node(), [agent()], [inference], run_input)

    asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    messages = bed.scripted.seen[0][0]
    assert isinstance(messages[0], ModelRequest)
    assert isinstance(messages[1], ModelResponse)
    assert request_texts(messages[:1]) == ['{\n  "question": "where is the parcel?"\n}']
    assert messages[1].parts == [TextPart(content='{\n  "reply": "in transit",\n  "confidence": 1\n}')]
    assert request_texts(messages[2:])[0].startswith("Q: where is my order?")


def test_invalid_input_fails_before_any_model_request() -> None:
    bed = llm_bed(ANSWER, answer_node(), [agent()], [answer_inference()], {"question": None, "product": None})

    outcome = asyncio.run(bed.executor.execute(answer_node(), bed.scope))

    assert isinstance(outcome, NodeFailed)
    assert outcome.error.code == "input_invalid"
    assert bed.scripted.seen == []
