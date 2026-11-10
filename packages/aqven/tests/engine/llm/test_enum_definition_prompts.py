import pytest
from llm_harness import AnswerIn, MappedCode, answer_inference, field_ir, level_three_prompt
from pydantic import BaseModel

from aqven.engine.llm.allowed import AllowedSet
from aqven.engine.llm.prompts import PromptRenderer, PromptSource, build_conversation, output_format
from aqven.ir import CodePrompt, CompiledInference, CompiledOutputEnum, TemplatePrompt
from aqven.runtime.address import JsonObject
from aqven.spec import CodeRef, EnumValue, TypeId

PROMPT_REF = CodeRef("shop.prompts:level_three_prompt")
MOOD = CompiledOutputEnum(
    type_id=TypeId("Mood"),
    description="Reply tone",
    values=(EnumValue(value="calm", description="Calm"), EnumValue(value="warm", description="Warm")),
    paths=("mood",),
)
PRIORITY = CompiledOutputEnum(
    type_id=TypeId("Priority"),
    description="Urgency",
    values=(EnumValue(value="high", description="Handle today"), EnumValue(value="low", description="Handle later")),
    paths=("assessment.priority", "assessment.score.priorities[*]", "scores[*].priorities[*]"),
)
MOOD_BLOCK = "Enum values of Mood (mood):\n- calm: Calm\n- warm: Warm"
TRAILING_MOOD = CompiledOutputEnum(
    type_id=TypeId("Mood"),
    description="Reply tone",
    values=(EnumValue(value="calm", description="Calm"), EnumValue(value="warm", description="Warm  ")),
    paths=("mood",),
)
TRAILING_MOOD_BLOCK = "Enum values of Mood (mood):\n- calm: Calm\n- warm: Warm  "
PRIORITY_BLOCK = (
    "Enum values of Priority (assessment.priority, assessment.score.priorities[*], scores[*].priorities[*]):\n"
    "- high: Handle today\n"
    "- low: Handle later"
)


def enum_inference(**update: object) -> CompiledInference:
    changes: dict[str, object] = {
        "output_fields": (field_ir("mood", "Mood"),),
        "output_enums": (MOOD,),
        **update,
    }
    return answer_inference(**changes)


def source(inference: CompiledInference) -> PromptSource:
    values: BaseModel = AnswerIn(question="where is my order?", product=None)
    document: JsonObject = {"question": "where is my order?", "product": None}
    return PromptSource(inference, values, document, output_format(inference, ()))


@pytest.mark.parametrize("mode", [None, "auto"])
def test_output_format_injects_definitions_for_default_and_explicit_auto(mode: str | None) -> None:
    update = {} if mode is None else {"enum_definitions": mode}
    inference = enum_inference(**update)

    assert output_format(inference, ()) == f"Output fields:\n- mood: field mood\n\n{MOOD_BLOCK}"


def test_output_format_places_multiple_enums_before_allowed_sets() -> None:
    inference = enum_inference(output_enums=(MOOD, PRIORITY))
    sets = (AllowedSet(type_id=TypeId("NoteId"), values=("n1", "n2"), labels=("First note", None)),)

    assert output_format(inference, sets) == (
        "Output fields:\n- mood: field mood\n\n"
        f"{MOOD_BLOCK}\n\n{PRIORITY_BLOCK}\n\n"
        "Allowed values of NoteId:\n- n1: First note\n- n2"
    )


def test_manual_output_format_has_no_enum_block() -> None:
    inference = enum_inference(enum_definitions="manual")
    sets = (AllowedSet(type_id=TypeId("NoteId"), values=("n1", "n2"), labels=("First note", None)),)

    assert output_format(inference, sets) == (
        "Output fields:\n- mood: field mood\nAllowed values of NoteId:\n- n1: First note\n- n2"
    )


@pytest.mark.parametrize(
    ("prompt", "expected"),
    [
        (
            TemplatePrompt(level=1, template="Answer the customer."),
            'Answer the customer.\n\nInputs:\n\nquestion (field question):\n"where is my order?"\n\n'
            "product (field product):\nnull\n\n"
            f"Output fields:\n- mood: field mood\n\n{MOOD_BLOCK}",
        ),
        (
            TemplatePrompt(level=2, template="{{ question }}\n{{ output_format }}"),
            f"where is my order?\nOutput fields:\n- mood: field mood\n\n{MOOD_BLOCK}",
        ),
    ],
    ids=["plain", "liquid"],
)
def test_plain_and_liquid_prompts_render_the_same_enum_block(prompt: TemplatePrompt, expected: str) -> None:
    inference = enum_inference(prompt=prompt)

    rendered = PromptRenderer(MappedCode({})).render(prompt, source(inference))

    assert len(rendered.messages) == 1
    assert rendered.messages[0].role == "user"
    assert rendered.messages[0].text == expected


@pytest.mark.parametrize(
    "prompt",
    [
        TemplatePrompt(level=1, template="Answer the customer."),
        TemplatePrompt(level=2, template="{{ output_format }}"),
        CodePrompt(run=PROMPT_REF),
    ],
    ids=["plain", "liquid", "code"],
)
def test_all_prompt_levels_preserve_terminal_enum_description_whitespace(prompt: TemplatePrompt | CodePrompt) -> None:
    inference = enum_inference(prompt=prompt, output_enums=(TRAILING_MOOD,))
    renderer = PromptRenderer(MappedCode({PROMPT_REF: level_three_prompt}))

    rendered = renderer.render(prompt, source(inference))

    assert rendered.messages[-1].text.endswith(TRAILING_MOOD_BLOCK)


@pytest.mark.parametrize(
    "update",
    [{"enum_definitions": "manual"}, {"output_enums": ()}],
    ids=["manual", "no-enums"],
)
def test_liquid_manual_or_no_enum_keeps_legacy_boundary_stripping(update: dict[str, object]) -> None:
    prompt = TemplatePrompt(level=2, template="  {{ output_format }}  ")
    inference = enum_inference(prompt=prompt, **update)

    rendered = PromptRenderer(MappedCode({})).render(prompt, source(inference))

    assert [message.text for message in rendered.messages] == ["Output fields:\n- mood: field mood"]


def test_liquid_enum_followed_by_allowed_set_has_no_boundary_suffix() -> None:
    prompt = TemplatePrompt(level=2, template="{{ output_format }}")
    inference = enum_inference(prompt=prompt, output_enums=(TRAILING_MOOD,))
    sets = (AllowedSet(type_id=TypeId("NoteId"), values=("n1", "n2"), labels=("First note", None)),)
    base = source(inference)
    prompt_source = PromptSource(base.inference, base.values, base.document, output_format(inference, sets))

    rendered = PromptRenderer(MappedCode({})).render(prompt, prompt_source)

    assert [message.text for message in rendered.messages] == [
        "Output fields:\n- mood: field mood\n\n"
        f"{TRAILING_MOOD_BLOCK}\n\n"
        "Allowed values of NoteId:\n- n1: First note\n- n2"
    ]


def test_code_prompt_gets_enum_only_system_message() -> None:
    prompt = CodePrompt(run=PROMPT_REF)
    inference = enum_inference(prompt=prompt)

    rendered = PromptRenderer(MappedCode({PROMPT_REF: level_three_prompt})).render(prompt, source(inference))

    assert [(message.role, message.text) for message in rendered.messages] == [
        ("system", "You are a support operator"),
        ("user", "where is my order? [none]"),
        ("system", MOOD_BLOCK),
    ]
    conversation = build_conversation(None, rendered, (), ())
    assert conversation.instructions == f"You are a support operator\n\n{MOOD_BLOCK}"
    assert conversation.history == ()
    assert conversation.prompt == ("where is my order? [none]",)
    assert "Output fields:" not in (conversation.instructions or "")


@pytest.mark.parametrize("update", [{"enum_definitions": "manual"}, {"output_enums": ()}], ids=["manual", "no-enums"])
def test_code_prompt_manual_or_without_output_enums_has_no_engine_block(update: dict[str, object]) -> None:
    prompt = CodePrompt(run=PROMPT_REF)
    inference = enum_inference(prompt=prompt, **update)

    rendered = PromptRenderer(MappedCode({PROMPT_REF: level_three_prompt})).render(prompt, source(inference))

    assert [(message.role, message.text) for message in rendered.messages] == [
        ("system", "You are a support operator"),
        ("user", "where is my order? [none]"),
    ]
