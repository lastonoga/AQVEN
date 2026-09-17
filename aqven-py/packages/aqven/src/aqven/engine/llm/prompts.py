import io
import json
from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from typing import Final, assert_never

from liquid import DictLoader, Environment
from liquid.ast import Node
from liquid.context import RenderContext
from liquid.exceptions import LiquidError
from pydantic import BaseModel, JsonValue, ValidationError
from pydantic_ai.messages import ModelMessage, ModelRequest, ModelResponse, TextPart, UserContent, UserPromptPart

from aqven.check.templates import OUTPUT_FORMAT, MessageNode, MessageRole, prompt_environment
from aqven.engine.llm.allowed import AllowedSet, flatten
from aqven.engine.llm.errors import LlmFailureCode, LlmNodeError
from aqven.engine.llm.ports import CodeLoader
from aqven.engine.llm.template_values import template_values
from aqven.ir import CodePrompt, CompiledInference, CompiledPrompt, CompiledVariantSlot, FieldIr, TemplatePrompt
from aqven.policies.paths import read
from aqven.runtime.address import JsonObject
from aqven.spec import MEDIA_TYPES, MediaValue, PromptLevel, PromptMessage, RefRoot, RenderedPrompt, parse_type_ref
from aqven.spec.prompts import PromptRole

VARIANTS_VARIABLE: Final = "variants"
DEFAULT_VARIANT: Final = "default"
SECTION_SEPARATOR: Final = "\n\n"
USER_ROLE: Final[PromptRole] = "user"
ASSISTANT_ROLE: Final[PromptRole] = "assistant"
SYSTEM_ROLE: Final[PromptRole] = "system"
ROLE_NAMES: Final[Mapping[MessageRole, PromptRole]] = {
    MessageRole.SYSTEM: SYSTEM_ROLE,
    MessageRole.USER: USER_ROLE,
    MessageRole.ASSISTANT: ASSISTANT_ROLE,
}


@dataclass(frozen=True, slots=True)
class PromptSource:
    inference: CompiledInference
    values: BaseModel
    document: JsonObject
    output_format: str


@dataclass(frozen=True, slots=True)
class RenderedParts:
    messages: tuple[PromptMessage, ...]
    variants: Mapping[str, str]
    level: PromptLevel


@dataclass(frozen=True, slots=True)
class Conversation:
    instructions: str | None
    history: tuple[ModelMessage, ...]
    prompt: tuple[UserContent, ...]


@dataclass(frozen=True, slots=True)
class _RenderedNode:
    role: PromptRole | None
    text: str


type TemplateLevel = Callable[["PromptRenderer", TemplatePrompt, PromptSource], RenderedParts]


@dataclass(frozen=True, slots=True)
class PromptRenderer:
    code: CodeLoader

    def render(self, prompt: CompiledPrompt | None, source: PromptSource) -> RenderedParts:
        match prompt:
            case None:
                return self.instruction(None, source)
            case TemplatePrompt():
                return TEMPLATE_LEVELS[prompt.level](self, prompt, source)
            case CodePrompt():
                return self.function(prompt, source)
            case _:
                assert_never(prompt)

    def instruction(self, prompt: TemplatePrompt | None, source: PromptSource) -> RenderedParts:
        template = prompt.template.strip() if prompt is not None else ""
        sections = (template, _inputs_section(source), source.output_format)
        text = SECTION_SEPARATOR.join(section for section in sections if section)
        return RenderedParts((PromptMessage(role=USER_ROLE, text=text),), {}, PromptLevel.INSTRUCTION)

    def template(self, prompt: TemplatePrompt, source: PromptSource) -> RenderedParts:
        environment = prompt_environment(DictLoader(dict(prompt.partials)))
        document = source.document
        values = template_values(source.inference, document)
        chosen = {name: _variant(name, slot, document) for name, slot in source.inference.variants.items()}
        variants = {name: _render_text(environment, text, values) for name, (_, text) in chosen.items()}
        variables: dict[str, object] = {**values, OUTPUT_FORMAT: source.output_format, VARIANTS_VARIABLE: variants}
        messages = _render_messages(environment, prompt.template, variables)
        return RenderedParts(messages, {name: key for name, (key, _) in chosen.items()}, PromptLevel.TEMPLATE)

    def function(self, prompt: CodePrompt, source: PromptSource) -> RenderedParts:
        target = self.code.load(prompt.run)
        if not callable(target):
            raise LlmNodeError(LlmFailureCode.CODE_INVALID, f"prompt {prompt.run} is not a function")
        arguments = {field.name: getattr(source.values, field.name) for field in text_fields(source.inference)}
        rendered = target(**arguments)
        if not isinstance(rendered, RenderedPrompt):
            raise LlmNodeError(LlmFailureCode.CODE_INVALID, f"prompt {prompt.run} did not return a RenderedPrompt")
        return RenderedParts(rendered.messages, {}, PromptLevel.CODE)


TEMPLATE_LEVELS: Final[Mapping[int, TemplateLevel]] = {
    PromptLevel.INSTRUCTION: PromptRenderer.instruction,
    PromptLevel.TEMPLATE: PromptRenderer.template,
}


def output_format(inference: CompiledInference, sets: Sequence[AllowedSet]) -> str:
    fields = ("Output fields:", *(f"- {field.name}: {field.description}" for field in inference.output_fields))
    allowed = tuple(line for item in sets for line in _allowed_lines(item))
    return "\n".join((*fields, *allowed))


def text_fields(inference: CompiledInference) -> tuple[FieldIr, ...]:
    return tuple(field for field in inference.input_fields if not is_media_field(field))


def is_media_field(field: FieldIr) -> bool:
    return parse_type_ref(field.type).type_id in MEDIA_TYPES


def media_values(inference: CompiledInference, document: JsonObject) -> tuple[MediaValue, ...]:
    try:
        return tuple(
            MediaValue.model_validate(value)
            for field in inference.input_fields
            if is_media_field(field)
            for value in flatten(document.get(field.name))
            if value is not None
        )
    except ValidationError as error:
        raise LlmNodeError(LlmFailureCode.INPUT_INVALID, f"cannot read media in the input: {error}") from error


def example_messages(inference: CompiledInference) -> tuple[PromptMessage, ...]:
    return tuple(
        message
        for example in inference.examples
        for message in (
            PromptMessage(role=USER_ROLE, text=_json_text(example.in_)),
            PromptMessage(role=ASSISTANT_ROLE, text=_json_text(example.out)),
        )
    )


def build_conversation(
    agent_instructions: str | None,
    rendered: RenderedParts,
    examples: Sequence[PromptMessage],
    media: Sequence[UserContent],
) -> Conversation:
    system = tuple(message.text for message in rendered.messages if message.role == SYSTEM_ROLE)
    dialog = [message for message in rendered.messages if message.role != SYSTEM_ROLE]
    last_user = max((index for index, message in enumerate(dialog) if message.role == USER_ROLE), default=None)
    if last_user is None or last_user != len(dialog) - 1:
        raise LlmNodeError(LlmFailureCode.PROMPT_INVALID, "prompt must end with a user message")
    history = tuple(_model_message(message) for message in (*examples, *dialog[:last_user]))
    instructions = SECTION_SEPARATOR.join(part for part in (agent_instructions, *system) if part)
    return Conversation(instructions or None, history, (dialog[last_user].text, *media))


def _user_message(message: PromptMessage) -> ModelMessage:
    return ModelRequest(parts=[UserPromptPart(content=message.text)])


def _assistant_message(message: PromptMessage) -> ModelMessage:
    return ModelResponse(parts=[TextPart(content=message.text)])


MESSAGE_BUILDERS: Final[Mapping[PromptRole, Callable[[PromptMessage], ModelMessage]]] = {
    USER_ROLE: _user_message,
    ASSISTANT_ROLE: _assistant_message,
}


def _model_message(message: PromptMessage) -> ModelMessage:
    return MESSAGE_BUILDERS[message.role](message)


def _variant(name: str, slot: CompiledVariantSlot, document: JsonObject) -> tuple[str, str]:
    selector = read({RefRoot.IN: document}, slot.on)
    key = selector if isinstance(selector, str) and selector in slot.cases else None
    if key is not None:
        return key, slot.cases[key]
    if slot.default is None:
        message = f"variant slot {name}: no variant for value {selector!r} and no default"
        raise LlmNodeError(LlmFailureCode.PROMPT_INVALID, message)
    return DEFAULT_VARIANT, slot.default


def _render_text(environment: Environment, template: str, variables: Mapping[str, object]) -> str:
    return "".join(node.text for node in _rendered_nodes(environment, template, variables))


def _render_messages(
    environment: Environment, template: str, variables: Mapping[str, object]
) -> tuple[PromptMessage, ...]:
    nodes = _rendered_nodes(environment, template, variables)
    if all(node.role is None for node in nodes):
        return _messages((_RenderedNode(USER_ROLE, "".join(node.text for node in nodes)),))
    loose = "".join(node.text for node in nodes if node.role is None)
    if loose.strip():
        raise LlmNodeError(LlmFailureCode.PROMPT_INVALID, "template text outside {% message %} blocks")
    return _messages(nodes)


def _messages(nodes: Sequence[_RenderedNode]) -> tuple[PromptMessage, ...]:
    return tuple(
        PromptMessage(role=node.role, text=node.text.strip())
        for node in nodes
        if node.role is not None and node.text.strip()
    )


def _rendered_nodes(
    environment: Environment, template: str, variables: Mapping[str, object]
) -> tuple[_RenderedNode, ...]:
    try:
        bound = environment.from_string(template)
        context = RenderContext(bound, globals=bound.make_globals(variables))
        return tuple(_render_node(node, context) for node in bound.nodes)
    except LiquidError as error:
        raise LlmNodeError(LlmFailureCode.PROMPT_INVALID, f"prompt template does not render: {error}") from error


def _render_node(node: Node, context: RenderContext) -> _RenderedNode:
    buffer = io.StringIO()
    if isinstance(node, MessageNode):
        node.block.render(context, buffer)
        return _RenderedNode(ROLE_NAMES[node.role], buffer.getvalue())
    node.render(context, buffer)
    return _RenderedNode(None, buffer.getvalue())


def _inputs_section(source: PromptSource) -> str:
    fields = text_fields(source.inference)
    if not fields:
        return ""
    lines = (f"{field.name} ({field.description}):\n{_json_text(source.document.get(field.name))}" for field in fields)
    return SECTION_SEPARATOR.join(("Inputs:", *lines))


def _allowed_lines(item: AllowedSet) -> Iterator[str]:
    yield f"Allowed values of {item.type_id}:"
    for value, label in zip(item.values, item.labels, strict=True):
        yield f"- {value}: {label}" if label else f"- {value}"


def _json_text(value: JsonValue) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2)
