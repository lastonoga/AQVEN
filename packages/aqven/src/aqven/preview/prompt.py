import json
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Annotated, Final, Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue, ValidationError
from pydantic_ai.profiles import DEFAULT_PROMPTED_OUTPUT_TEMPLATE

from aqven.engine.llm.adapters import GeneratedInferenceModels, ImportCodeLoader
from aqven.engine.llm.agents import with_unbound_optionals
from aqven.engine.llm.allowed import AllowedSet, flatten, resolve_allowed_sets
from aqven.engine.llm.errors import LlmNodeError
from aqven.engine.llm.instructions import join_instructions, output_limits
from aqven.engine.llm.output import OUTPUT_TOOL_NAME
from aqven.engine.llm.prompts import (
    DEFAULT_VARIANT,
    SYSTEM_ROLE,
    PromptRenderer,
    PromptSource,
    RenderedParts,
    build_conversation,
    example_messages,
    is_media_field,
    output_format,
)
from aqven.ir import (
    CompiledAgent,
    CompiledInference,
    CompiledLlmNode,
    CompiledProject,
    CompiledVariantSlot,
    FieldIr,
    FieldName,
    JsonSchema,
)
from aqven.policies.paths import read
from aqven.preview.samples import sample_document
from aqven.runtime.address import JsonObject, RequestModel, ResourceModel
from aqven.spec import (
    AUDIO,
    DOCUMENT,
    IMAGE,
    VIDEO,
    AgentId,
    BlobId,
    FieldStep,
    FlowId,
    InferenceId,
    MediaValue,
    NodeId,
    OutputModeSetting,
    OutputModeSource,
    PromptMessage,
    PromptRole,
    RefRoot,
    StructuredMode,
    TypeId,
    TypeRef,
    parse_ref,
    parse_type_ref,
)

SCHEMA_PLACEHOLDER: Final = "{schema}"
DEFAULT_MARKER: Final = "__aqven_default__"
SECTION_SEPARATOR: Final = "\n\n"
GENERATED_MODELS_NOTE: Final = (
    "the prompt function of {inference} receives values of a permissive model: "
    "the generated models of {package} are not importable here ({error})"
)
IMAGE_OUTPUT_NOTE: Final = (
    "the output is a single Image: the model answers with an image, so no output mode and no limits are sent"
)
DYNAMIC_OUTPUT_NOTE: Final = (
    "output field {name} is shaped at run time from {source}: the preview shows the declared schema and its limits"
)
MEDIA_TYPE_KEY: Final = "$media"
SAMPLE_BLOB: Final[BlobId] = BlobId(f"sha256-{'0' * 64}")
SAMPLE_MEDIA: Final[Mapping[TypeId, MediaValue]] = {
    IMAGE: MediaValue(media_type="image/png", blob_id=SAMPLE_BLOB, size_bytes=1024, name="sample.png"),
    AUDIO: MediaValue(media_type="audio/mpeg", blob_id=SAMPLE_BLOB, size_bytes=1024, name="sample.mp3"),
    VIDEO: MediaValue(media_type="video/mp4", blob_id=SAMPLE_BLOB, size_bytes=1024, name="sample.mp4"),
    DOCUMENT: MediaValue(media_type="application/pdf", blob_id=SAMPLE_BLOB, size_bytes=1024, name="sample.pdf"),
}

type InputSource = Literal["request", "sample"]
type MessageOrigin = Literal["example", "prompt"]
type PromptDelivery = Literal["tool", "native", "prompted", "image"]
type ToolKind = Literal["tool", "mcp_tool", "subagent"]


class PreviewError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class PreviewNotFound(PreviewError):
    pass


class PreviewInputInvalid(PreviewError):
    pass


class PreviewRenderFailed(PreviewError):
    def __init__(self, message: str, code: str) -> None:
        super().__init__(message)
        self.code = code


class PreviewValues(BaseModel):
    model_config = ConfigDict(extra="allow", frozen=True)


class PromptPreviewRequest(RequestModel):
    flow_id: FlowId
    node_id: NodeId
    input: JsonObject | None = None
    variants: Mapping[str, str] | None = None

    @property
    def chosen_variants(self) -> Mapping[str, str]:
        return self.variants or {}


class PreviewMessage(ResourceModel):
    role: PromptRole
    origin: MessageOrigin
    text: str


class PreviewAttachment(ResourceModel):
    name: FieldName
    type: TypeId
    media_type: str | None
    url: str | None
    blob_id: str | None


class PreviewVariant(ResourceModel):
    slot: str
    case: str
    selector: str
    forced: bool
    text: str


class PreviewTool(ResourceModel):
    name: str
    kind: ToolKind
    description: str


class PreviewOutput(ResourceModel):
    delivery: PromptDelivery
    mode: StructuredMode
    declared_mode: OutputModeSetting
    mode_source: OutputModeSource
    mode_reason: str
    strict: bool
    retries: Annotated[int, Field(ge=0)]
    tool_name: str | None
    limits: str | None
    mode_instruction: str | None
    schema_instructions: str | None
    json_schema: JsonSchema


class PromptPreview(ResourceModel):
    flow_id: FlowId
    node_id: NodeId
    agent_id: AgentId
    inference_id: InferenceId
    agent_file: str | None
    inference_file: str | None
    model: str
    fallback_models: tuple[str, ...]
    prompt_level: Annotated[int, Field(ge=1, le=3)]
    input_source: InputSource
    input: JsonObject
    instructions: str | None
    messages: tuple[PreviewMessage, ...]
    attachments: tuple[PreviewAttachment, ...]
    variants: tuple[PreviewVariant, ...]
    tools: tuple[PreviewTool, ...]
    output: PreviewOutput
    notes: tuple[str, ...]


@dataclass(slots=True)
class PreviewNotes:
    lines: list[str] = field(default_factory=list[str])

    def add(self, line: str) -> None:
        if line not in self.lines:
            self.lines.append(line)

    def frozen(self) -> tuple[str, ...]:
        return tuple(self.lines)


@dataclass(frozen=True, slots=True)
class OutputPreview:
    view: PreviewOutput
    instructions: str | None


def preview_prompt(project: CompiledProject, request: PromptPreviewRequest) -> PromptPreview:
    node = llm_node(project, request)
    inference = project.inference(node.inference)
    agent = project.agent(node.agent)
    notes = PreviewNotes()
    forced = forced_cases(inference, request.chosen_variants)
    document = preview_document(inference, request, forced, notes)
    sets = allowed_sets(inference, document, notes)
    values = prompt_values(project, inference, document, notes)
    source = PromptSource(inference, values, document, output_format(inference, sets))
    rendered = render_parts(inference, source)
    conversation = build_conversation(agent.instructions, rendered, example_messages(inference), ())
    output = preview_output(inference, node.output_mode, agent, conversation.instructions, notes)
    return PromptPreview(
        flow_id=request.flow_id,
        node_id=node.node_id,
        agent_id=agent.agent_id,
        inference_id=inference.inference_id,
        agent_file=agent.file,
        inference_file=inference.file,
        model=agent.primary.model,
        fallback_models=tuple(choice.model for choice in agent.fallbacks),
        prompt_level=int(rendered.level),
        input_source="request" if request.input is not None else "sample",
        input=document,
        instructions=output.instructions,
        messages=preview_messages(inference, rendered.messages),
        attachments=attachments(inference, document),
        variants=variant_views(inference, rendered.variants, forced),
        tools=agent_tools(project, agent),
        output=output.view,
        notes=notes.frozen(),
    )


def llm_node(project: CompiledProject, request: PromptPreviewRequest) -> CompiledLlmNode:
    flow = project.flows.get(request.flow_id)
    if flow is None:
        known = ", ".join(sorted(project.flows)) or "none"
        raise PreviewNotFound(f"flow {request.flow_id} is not in the project: flows are {known}")
    node = flow.nodes.get(request.node_id)
    if node is None:
        known = ", ".join(sorted(flow.nodes))
        raise PreviewNotFound(f"node {request.flow_id}.{request.node_id} is not in the flow: nodes are {known}")
    if not isinstance(node, CompiledLlmNode):
        message = f"node {request.flow_id}.{request.node_id} is a {node.kind} node: only llm nodes have a prompt"
        raise PreviewNotFound(message)
    return node


def forced_cases(inference: CompiledInference, wanted: Mapping[str, str]) -> Mapping[str, str]:
    for slot, case in wanted.items():
        declared = inference.variants.get(slot)
        if declared is None:
            known = ", ".join(sorted(inference.variants)) or "none"
            message = f"inference {inference.inference_id} has no variant slot {slot}: slots are {known}"
            raise PreviewInputInvalid(message)
        if case not in declared.cases and not (case == DEFAULT_VARIANT and declared.default is not None):
            known = ", ".join(sorted(declared.cases))
            raise PreviewInputInvalid(f"variant slot {slot} has no case {case}: cases are {known}")
    return dict(wanted)


def preview_document(
    inference: CompiledInference,
    request: PromptPreviewRequest,
    forced: Mapping[str, str],
    notes: PreviewNotes,
) -> JsonObject:
    document = dict(request.input) if request.input is not None else sample_media(inference, sampled(inference))
    for slot, case in forced.items():
        declared = inference.variants[slot]
        value = case if case in declared.cases else DEFAULT_MARKER
        if not place(document, declared.on, value):
            notes.add(f"variant slot {slot} reads {declared.on}, which the preview cannot set: the case is not forced")
    return with_unbound_optionals(inference, document)


def sampled(inference: CompiledInference) -> JsonObject:
    return sample_document(inference.input_schema)


def sample_media(inference: CompiledInference, document: JsonObject) -> JsonObject:
    media = {item.name: parse_type_ref(item.type) for item in inference.input_fields if is_media_field(item)}
    replaced = {
        name: _media_sample(reference, document.get(name))
        for name, reference in media.items()
        if document.get(name) is not None
    }
    return {**document, **replaced}


def _media_sample(reference: TypeRef, sampled_value: JsonValue) -> JsonValue:
    value = SAMPLE_MEDIA[reference.type_id].model_dump(mode="json", by_alias=True)
    return [value] if reference.is_list or isinstance(sampled_value, list) else value


def place(document: JsonObject, ref: str, value: JsonValue) -> bool:
    parsed = parse_ref(ref)
    names = [step.name for step in parsed.steps if isinstance(step, FieldStep)]
    if parsed.root is not RefRoot.IN or not names or len(names) != len(parsed.steps):
        return False
    target = document
    for name in names[:-1]:
        nested = target.get(name)
        child: JsonObject = nested if isinstance(nested, dict) else {}
        target[name] = child
        target = child
    target[names[-1]] = value
    return True


def allowed_sets(inference: CompiledInference, document: JsonObject, notes: PreviewNotes) -> tuple[AllowedSet, ...]:
    for item in inference.allowed_sets:
        if parse_ref(item.source).root is not RefRoot.IN:
            notes.add(f"allowed set {item.type_id} comes from {item.source}: the preview leaves it empty")
    try:
        return resolve_allowed_sets(inference, lambda ref: input_value(document, ref))
    except LlmNodeError as error:
        notes.add(f"allowed sets are not resolved: {error.message}")
        return ()


def input_value(document: JsonObject, ref: str) -> JsonValue:
    if parse_ref(ref).root is not RefRoot.IN:
        return None
    return read({RefRoot.IN: document}, ref)


def prompt_values(
    project: CompiledProject, inference: CompiledInference, document: JsonObject, notes: PreviewNotes
) -> BaseModel:
    prompt = inference.prompt
    if prompt is None or prompt.kind != "code":
        return PreviewValues.model_validate(document)
    try:
        return GeneratedInferenceModels(project.package).input_model(inference).model_validate(document)
    except (LlmNodeError, ValidationError, ImportError, AttributeError, ValueError) as error:
        notes.add(GENERATED_MODELS_NOTE.format(inference=inference.inference_id, package=project.package, error=error))
        return PreviewValues.model_validate(document)


def render_parts(inference: CompiledInference, source: PromptSource) -> RenderedParts:
    try:
        return PromptRenderer(ImportCodeLoader()).render(inference.prompt, source)
    except LlmNodeError as error:
        raise PreviewRenderFailed(error.message, error.code.value) from error


def preview_messages(inference: CompiledInference, rendered: Sequence[PromptMessage]) -> tuple[PreviewMessage, ...]:
    examples = tuple(_message(item, "example") for item in example_messages(inference))
    dialog = tuple(_message(item, "prompt") for item in rendered if item.role != SYSTEM_ROLE)
    return (*examples, *dialog)


def attachments(inference: CompiledInference, document: JsonObject) -> tuple[PreviewAttachment, ...]:
    return tuple(
        _attachment(item, value)
        for item in inference.input_fields
        if is_media_field(item)
        for value in flatten(document.get(item.name))
        if value is not None
    )


def variant_views(
    inference: CompiledInference, chosen: Mapping[str, str], forced: Mapping[str, str]
) -> tuple[PreviewVariant, ...]:
    return tuple(
        PreviewVariant(
            slot=slot,
            case=case,
            selector=inference.variants[slot].on,
            forced=slot in forced,
            text=_variant_text(inference.variants[slot], case),
        )
        for slot, case in sorted(chosen.items())
    )


def agent_tools(project: CompiledProject, agent: CompiledAgent) -> tuple[PreviewTool, ...]:
    return tuple(_tools_of(project, agent))


def preview_output(
    inference: CompiledInference,
    mode: StructuredMode,
    agent: CompiledAgent,
    instructions: str | None,
    notes: PreviewNotes,
) -> OutputPreview:
    schema = dict(inference.output_schema)
    for dynamic in inference.dynamic_outputs:
        notes.add(DYNAMIC_OUTPUT_NOTE.format(name=dynamic.name, source=dynamic.schema_from))
    if image_output(inference):
        notes.add(IMAGE_OUTPUT_NOTE)
        return OutputPreview(view=_output_view("image", agent, schema, None, None), instructions=instructions)
    limits = output_limits(schema)
    prompted = prompted_instructions(schema) if mode == "prompted" else None
    view = _output_view(mode, agent, schema, limits, prompted)
    sections = (instructions, limits, agent.output.instruction)
    return OutputPreview(view=view, instructions=join_instructions(sections))


def prompted_instructions(schema: JsonSchema) -> str:
    titled: JsonSchema = {**schema, "title": OUTPUT_TOOL_NAME}
    template = DEFAULT_PROMPTED_OUTPUT_TEMPLATE
    if SCHEMA_PLACEHOLDER not in template:
        template = SECTION_SEPARATOR.join((template, SCHEMA_PLACEHOLDER))
    return template.format(schema=json.dumps(titled, ensure_ascii=False))


def image_output(inference: CompiledInference) -> bool:
    fields = inference.output_fields
    return len(fields) == 1 and parse_type_ref(fields[0].type).type_id == IMAGE


def _output_view(
    delivery: PromptDelivery,
    agent: CompiledAgent,
    schema: JsonSchema,
    limits: str | None,
    prompted: str | None,
) -> PreviewOutput:
    output = agent.output
    return PreviewOutput(
        delivery=delivery,
        mode=output.mode if delivery == "image" else delivery,
        declared_mode=output.declared_mode,
        mode_source=output.mode_source,
        mode_reason=output.mode_reason,
        strict=output.strict and agent.primary.capabilities.strict,
        retries=output.retries,
        tool_name=OUTPUT_TOOL_NAME if delivery == "tool" else None,
        limits=limits,
        mode_instruction=None if delivery == "image" else output.instruction,
        schema_instructions=prompted,
        json_schema=schema,
    )


def _tools_of(project: CompiledProject, agent: CompiledAgent) -> Iterator[PreviewTool]:
    for tool_id in agent.tools:
        tool = project.tools.get(tool_id)
        kind: ToolKind = "mcp_tool" if tool is not None and tool.source.kind == "mcp" else "tool"
        yield PreviewTool(name=tool_id, kind=kind, description="" if tool is None else tool.description)
    for spec in agent.subagents:
        yield PreviewTool(name=spec.name, kind="subagent", description=spec.description)


def _message(message: PromptMessage, origin: MessageOrigin) -> PreviewMessage:
    return PreviewMessage(role=message.role, origin=origin, text=message.text)


def _variant_text(slot: CompiledVariantSlot, case: str) -> str:
    return slot.cases.get(case) or slot.default or ""


def _attachment(item: FieldIr, value: JsonValue) -> PreviewAttachment:
    fields = value if isinstance(value, dict) else {}
    return PreviewAttachment(
        name=item.name,
        type=parse_type_ref(item.type).type_id,
        media_type=_text_value(fields.get(MEDIA_TYPE_KEY) or fields.get("media_type")),
        url=_text_value(fields.get("url")),
        blob_id=_text_value(fields.get("blob_id")),
    )


def _text_value(value: JsonValue) -> str | None:
    return value if isinstance(value, str) else None
