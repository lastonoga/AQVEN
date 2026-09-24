from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Final, Protocol, runtime_checkable

from pydantic import BaseModel, JsonValue, ValidationError
from pydantic_ai import Agent, DeferredToolRequests
from pydantic_ai.messages import ModelMessage, ModelResponse, UserContent
from pydantic_ai.settings import ModelSettings
from pydantic_ai.usage import RunUsage, UsageLimits

from aqven.engine.llm.allowed import AllowedSet, resolve_allowed_sets, shape_output
from aqven.engine.llm.checks import OutputGuard
from aqven.engine.llm.context import RunDeps
from aqven.engine.llm.dynamic import NO_DYNAMIC_FORMS, DynamicForms, DynamicShaper, TypeAnnotations, dynamic_forms
from aqven.engine.llm.errors import LlmFailureCode, LlmNodeError
from aqven.engine.llm.instructions import join_instructions, output_limits
from aqven.engine.llm.output import OutputPlan, agent_output_mode, agent_strict, output_plan
from aqven.engine.llm.ports import CodeLoader, InferenceModels, MediaLoader, ModelSource, SecretSource, ToolContexts
from aqven.engine.llm.prompt_trace import captured_prompt
from aqven.engine.llm.prompts import (
    Conversation,
    PromptRenderer,
    PromptSource,
    build_conversation,
    example_messages,
    media_values,
    output_format,
)
from aqven.engine.llm.segments import ModelSlot
from aqven.engine.llm.streaming import drain_events
from aqven.engine.llm.tools import McpServers, ToolsetBuilder
from aqven.ir import CompiledAgent, CompiledInference, TemplatePrompt
from aqven.ir.nodes import OutputMode
from aqven.models.usage import usd_of_micros
from aqven.policies.paths import read
from aqven.ports.execution import ExecutionScope
from aqven.runtime.address import JsonObject
from aqven.runtime.executions import PromptTrace
from aqven.spec import AgentId, InferenceId, Limits, MediaValue, Modality, ModelSettingsSpec, RefRoot, parse_ref

DEFAULT_REQUEST_LIMIT: Final = 50
FIRST_SLOT: Final = ModelSlot()
OPTIONAL_SUFFIX: Final = "?"
MEDIA_TYPE_SEPARATOR: Final = "/"
MEDIA_MODALITIES: Final[Mapping[str, Modality]] = {
    "image": Modality.IMAGE,
    "audio": Modality.AUDIO,
    "video": Modality.VIDEO,
    "application": Modality.DOCUMENT,
    "text": Modality.DOCUMENT,
}


@runtime_checkable
class LimitedScope(Protocol):
    @property
    def run_limits(self) -> Limits | None: ...


def scope_limits(scope: ExecutionScope) -> Limits | None:
    return scope.run_limits if isinstance(scope, LimitedScope) else None


@dataclass(frozen=True, slots=True)
class InferenceCall:
    agent_id: AgentId
    inference_id: InferenceId
    output_mode: OutputMode | None = None
    limits: Limits | None = None
    nested: bool = False


@dataclass(frozen=True, slots=True)
class PreparedRun:
    agent: Agent[RunDeps, object]
    deps: RunDeps
    conversation: Conversation
    prompt_trace: PromptTrace
    variants: dict[str, str]
    plan: OutputPlan
    limits: UsageLimits
    settings: ModelSettings | None
    seconds: int | None
    dynamic: DynamicForms = NO_DYNAMIC_FORMS

    @property
    def prompt(self) -> str | Sequence[UserContent]:
        parts = self.conversation.prompt
        return parts[0] if len(parts) == 1 and isinstance(parts[0], str) else list(parts)

    @property
    def history(self) -> list[ModelMessage] | None:
        return list(self.conversation.history) or None


@dataclass(frozen=True, slots=True)
class InferenceRefs:
    scope: ExecutionScope
    document: JsonObject

    def read(self, ref: str) -> JsonValue:
        if parse_ref(ref).root != RefRoot.IN:
            return self.scope.resolve(ref)
        return read({RefRoot.IN: self.document}, ref)


@dataclass(slots=True)
class InferenceAgents:
    models: ModelSource
    inference_models: InferenceModels
    code: CodeLoader
    secrets: SecretSource
    media: MediaLoader
    tool_contexts: ToolContexts
    max_enum: int
    mcp_servers: McpServers | None = None
    types: TypeAnnotations | None = None
    renderer: PromptRenderer = field(init=False)
    tools: ToolsetBuilder = field(init=False)

    @property
    def dynamic(self) -> DynamicShaper:
        return DynamicShaper(self.types)

    def __post_init__(self) -> None:
        self.renderer = PromptRenderer(self.code)
        self.tools = ToolsetBuilder(self.code, self.tool_contexts, self.secrets, self, self.mcp_servers)

    async def prepare(
        self,
        scope: ExecutionScope,
        call: InferenceCall,
        document: JsonObject,
        attempt_offset: int,
        slot: ModelSlot = FIRST_SLOT,
    ) -> PreparedRun:
        project = scope.project
        agent = project.agent(call.agent_id)
        inference = project.inference(call.inference_id)
        values = _validated_inputs(self.inference_models.input_model(inference), document, inference)
        normalized = values.model_dump(mode="json", by_alias=True)
        refs = InferenceRefs(scope, normalized)
        sets = resolve_allowed_sets(inference, refs.read)
        forms = dynamic_forms(inference, refs.read)
        base = self.dynamic.model(scope, self.inference_models.output_model(inference), forms)
        shaped = shape_output(base, sets, self.max_enum)
        rendered = self.renderer.render(inference.prompt, _source(inference, values, normalized, sets))
        media_items = media_values(inference, normalized)
        media = [await self.media.content(scope, item) for item in media_items]
        conversation = build_conversation(agent.instructions, rendered, example_messages(inference), media)
        plan = output_plan(call.output_mode or agent_output_mode(agent), shaped.model, agent_strict(agent))
        instructions = _instructions(conversation, plan, shaped.model, agent.output.instruction)
        trace = captured_prompt(
            rendered,
            conversation,
            instructions,
            media_items,
            inference.prompt.template if isinstance(inference.prompt, TemplatePrompt) else None,
            None if plan.image_field is not None else shaped.model.model_json_schema(),
        )
        tools = await self.tools.build(scope, agent, nested=call.nested)
        output_type = [plan.spec, DeferredToolRequests] if tools.deferred else [plan.spec]
        built = Agent[RunDeps, object](
            await self.models.model(scope, agent, media_modalities(media_items), slot.index),
            output_type=output_type,
            instructions=instructions,
            deps_type=RunDeps,
            name=agent.agent_id,
            retries={"output": output_retries(agent, slot)},
            toolsets=tools.toolsets,
        )
        built.output_validator(OutputGuard(self.code, self))
        deps = RunDeps(scope, inference, values, normalized, shaped, attempt_offset)
        limits = (project.limits, agent.limits, call.limits, scope_limits(scope))
        return PreparedRun(
            agent=built,
            deps=deps,
            conversation=conversation,
            prompt_trace=trace,
            variants=dict(rendered.variants),
            plan=plan,
            limits=usage_limits(limits),
            settings=model_settings(agent.settings),
            seconds=_smallest(item.seconds for item in limits if item is not None),
            dynamic=forms,
        )

    async def run(
        self,
        scope: ExecutionScope,
        agent_id: AgentId,
        inference_id: InferenceId,
        document: JsonObject,
        usage: RunUsage,
    ) -> JsonObject:
        prepared = await self.prepare(scope, InferenceCall(agent_id, inference_id, nested=True), document, 0)
        result = await prepared.agent.run(
            prepared.prompt,
            message_history=prepared.history,
            deps=prepared.deps,
            usage=usage,
            usage_limits=prepared.limits,
            model_settings=prepared.settings,
            event_stream_handler=drain_events,
        )
        output = result.output
        if not isinstance(output, BaseModel):
            message = f"nested inference {inference_id} returned no output"
            raise LlmNodeError(LlmFailureCode.OUTPUT_INVALID, message)
        return prepared.dynamic.wrap(output.model_dump(mode="json", by_alias=True))


def usage_limits(limits: Iterable[Limits | None]) -> UsageLimits:
    present = [item for item in limits if item is not None]
    return UsageLimits(
        request_limit=_smallest(item.requests for item in present) or DEFAULT_REQUEST_LIMIT,
        tool_calls_limit=_smallest(item.tool_calls for item in present),
        total_tokens_limit=_smallest(item.tokens for item in present),
        cost_limit=usd_of_micros(_smallest(item.usd_micros for item in present)),
    )


def model_settings(spec: ModelSettingsSpec | None) -> ModelSettings | None:
    if spec is None:
        return None
    settings = ModelSettings(**spec.model_dump(exclude_none=True, exclude={"provider_options"}))
    if spec.provider_options is not None:
        settings["extra_body"] = spec.provider_options
    return settings


def output_retries(agent: CompiledAgent, slot: ModelSlot) -> int:
    return max(agent.output.retries - slot.retries_spent, 0)


def response_count(messages: Iterable[ModelMessage]) -> int:
    return sum(1 for message in messages if isinstance(message, ModelResponse))


def _smallest(values: Iterable[int | None]) -> int | None:
    present = [value for value in values if value is not None]
    return min(present) if present else None


def media_modalities(items: Sequence[MediaValue]) -> frozenset[Modality]:
    kinds = (MEDIA_MODALITIES.get(item.media_type.split(MEDIA_TYPE_SEPARATOR)[0]) for item in items)
    return frozenset(kind for kind in kinds if kind is not None)


def with_unbound_optionals(inference: CompiledInference, document: JsonObject) -> JsonObject:
    unbound = {
        field.name: None
        for field in inference.input_fields
        if field.type.endswith(OPTIONAL_SUFFIX) and field.name not in document
    }
    return {**unbound, **document}


def _validated_inputs(model: type[BaseModel], document: JsonObject, inference: CompiledInference) -> BaseModel:
    try:
        return model.model_validate(with_unbound_optionals(inference, document))
    except ValidationError as error:
        message = f"input of inference {inference.inference_id} does not match its model: {error}"
        raise LlmNodeError(LlmFailureCode.INPUT_INVALID, message) from error


def _instructions(
    conversation: Conversation, plan: OutputPlan, model: type[BaseModel], mode_instruction: str | None
) -> str | None:
    if plan.image_field is not None:
        return conversation.instructions
    return join_instructions((conversation.instructions, output_limits(model.model_json_schema()), mode_instruction))


def _source(
    inference: CompiledInference, values: BaseModel, document: JsonObject, sets: Sequence[AllowedSet]
) -> PromptSource:
    return PromptSource(inference, values, document, output_format(inference, sets))
