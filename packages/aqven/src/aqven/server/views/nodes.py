import posixpath
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Final

from pydantic import JsonValue

from aqven.ir import AgentModel, CompiledAgent
from aqven.ir.nodes import CompiledNode
from aqven.loader import (
    NODE_ID_SEPARATOR,
    EntityKey,
    EntityKind,
    LoadedFlow,
    LoadedProject,
    SourceSpec,
    include_candidates,
    local_node_id,
    parent_node_id,
)
from aqven.server.errors import not_found
from aqven.server.resources import (
    DynamicSlot,
    NodeAgentModel,
    NodeAgentRuntime,
    NodeBindingView,
    NodeCode,
    NodeDetail,
    NodeDisplaySource,
    NodePromptRef,
    NodeSchemas,
    NodeSummary,
    NodeValueShape,
)
from aqven.server.views.common import (
    SCHEMA_FAILURES,
    diagnostics_by_file,
    loaded_flow,
    loaded_project,
    ref_schema,
    type_models,
)
from aqven.server.views.prompts import inference_facts
from aqven.server.workspace import WorkspaceState
from aqven.spec import (
    AgentId,
    AgentSpec,
    BoundField,
    CallNodeSpec,
    CodeNodeSpec,
    FieldBinding,
    FieldDecl,
    FlowId,
    HumanNodeSpec,
    InferenceSpec,
    InputField,
    LlmNodeSpec,
    LoopNodeSpec,
    MapNodeSpec,
    NarrowNodeSpec,
    NodeId,
    NodeKind,
    NodeSpec,
    OutputField,
    ParallelNodeSpec,
    RecordType,
    SwitchNodeSpec,
    ToolId,
    ToolNodeSpec,
    TypeId,
    TypeModels,
    UnionType,
    model_family,
    normalized_schema,
)

QUALIFIER: Final = "."
IN_SUFFIX: Final = "In"
OUT_SUFFIX: Final = "Out"


@dataclass(frozen=True, slots=True)
class NodeShape:
    inputs: tuple[FieldDecl, ...] | None = None
    outputs: tuple[FieldDecl, ...] | None = None
    input_type: str | None = None
    output_type: str | None = None
    form_type: str | None = None
    bindings: tuple[FieldBinding | InputField, ...] = ()


type ShapeReader = Callable[[NodeSpec, LoadedProject], NodeShape]


def _llm_shape(spec: NodeSpec, project: LoadedProject) -> NodeShape:
    if not isinstance(spec, LlmNodeSpec):
        return NodeShape()
    loaded = project.inferences.get(spec.inference) if spec.inference is not None else None
    source = None if loaded is None else loaded.source
    if source is None:
        return NodeShape(bindings=tuple(spec.in_))
    return NodeShape(inputs=tuple(source.spec.in_), outputs=tuple(source.spec.out), bindings=tuple(spec.in_))


def _code_shape(spec: NodeSpec, project: LoadedProject) -> NodeShape:
    if not isinstance(spec, CodeNodeSpec):
        return NodeShape()
    return NodeShape(inputs=tuple(spec.in_), outputs=tuple(spec.out), bindings=tuple(spec.in_))


def _tool_shape(spec: NodeSpec, project: LoadedProject) -> NodeShape:
    if not isinstance(spec, ToolNodeSpec):
        return NodeShape()
    source = project.tools.get(ToolId(spec.tool))
    if source is None:
        return NodeShape(bindings=tuple(spec.in_))
    return NodeShape(inputs=tuple(source.spec.in_), outputs=tuple(source.spec.out), bindings=tuple(spec.in_))


def _human_shape(spec: NodeSpec, project: LoadedProject) -> NodeShape:
    if not isinstance(spec, HumanNodeSpec):
        return NodeShape()
    return NodeShape(inputs=tuple(spec.in_), output_type=spec.form, form_type=spec.form, bindings=tuple(spec.in_))


def _bound_outputs_shape(spec: NodeSpec, project: LoadedProject) -> NodeShape:
    if isinstance(spec, ParallelNodeSpec | MapNodeSpec | LoopNodeSpec | SwitchNodeSpec):
        return NodeShape(outputs=tuple(spec.out))
    return NodeShape()


def _call_shape(spec: NodeSpec, project: LoadedProject) -> NodeShape:
    if not isinstance(spec, CallNodeSpec):
        return NodeShape()
    called = project.flows.get(FlowId(spec.flow))
    source = None if called is None else called.source
    if source is None:
        return NodeShape(bindings=tuple(spec.in_))
    return NodeShape(input_type=source.spec.input, output_type=source.spec.output, bindings=tuple(spec.in_))


def _narrow_shape(spec: NodeSpec, project: LoadedProject) -> NodeShape:
    return NodeShape(output_type=spec.to) if isinstance(spec, NarrowNodeSpec) else NodeShape()


SHAPE_READERS: Final[Mapping[NodeKind, ShapeReader]] = {
    NodeKind.LLM: _llm_shape,
    NodeKind.CODE: _code_shape,
    NodeKind.TOOL: _tool_shape,
    NodeKind.HUMAN: _human_shape,
    NodeKind.PARALLEL: _bound_outputs_shape,
    NodeKind.MAP: _bound_outputs_shape,
    NodeKind.SWITCH: _bound_outputs_shape,
    NodeKind.LOOP: _bound_outputs_shape,
    NodeKind.CALL: _call_shape,
    NodeKind.NARROW: _narrow_shape,
}


def node_kind(spec: NodeSpec) -> NodeKind:
    return NodeKind(spec.node)


def node_shape(spec: NodeSpec, project: LoadedProject) -> NodeShape:
    return SHAPE_READERS[node_kind(spec)](spec, project)


def pascal(text: str) -> str:
    return "".join(part.capitalize() for part in text.replace(NODE_ID_SEPARATOR, "_").split("_"))


def record_schema(models: TypeModels, name: str, fields: Sequence[FieldDecl] | None) -> JsonValue:
    if fields is None:
        return None
    try:
        return normalized_schema(models.record(name, fields))
    except SCHEMA_FAILURES:
        return None


def side_schema(models: TypeModels, name: str, fields: Sequence[FieldDecl] | None, type_ref: str | None) -> JsonValue:
    if fields is not None:
        return record_schema(models, name, fields)
    return ref_schema(models, type_ref)


def shape_schemas(models: TypeModels, flow_id: str, node_id: str, shape: NodeShape) -> NodeSchemas:
    stem = pascal(f"{flow_id}_{node_id}")
    return NodeSchemas.model_validate(
        {
            "in": side_schema(models, f"{stem}{IN_SUFFIX}", shape.inputs, shape.input_type),
            "out": side_schema(models, f"{stem}{OUT_SUFFIX}", shape.outputs, shape.output_type),
            "form": ref_schema(models, shape.form_type),
        }
    )


def node_schemas(state: WorkspaceState, flow: LoadedFlow) -> dict[str, NodeSchemas]:
    project = loaded_project(state)
    models = type_models(project)
    return {
        node_id: shape_schemas(models, flow.flow_id, node_id, node_shape(source.spec, project))
        for node_id, source in ordered_nodes(flow)
    }


def ordered_nodes(flow: LoadedFlow) -> tuple[tuple[NodeId, SourceSpec[NodeSpec]], ...]:
    order = {} if flow.source is None else {node: index for index, node in enumerate(flow.source.spec.order)}
    fallback = len(order)

    def position(item: tuple[NodeId, SourceSpec[NodeSpec]]) -> tuple[int, int, str]:
        node_id = item[0]
        top = node_id.split(NODE_ID_SEPARATOR, 1)[0]
        return order.get(NodeId(top), fallback), node_id.count(NODE_ID_SEPARATOR), node_id

    return tuple(sorted(flow.nodes.items(), key=position))


def qualified(flow_id: str, node_id: str) -> str:
    return f"{flow_id}{QUALIFIER}{node_id}"


def flow_node(key: EntityKey, flow_id: str) -> str | None:
    prefix = f"{flow_id}{QUALIFIER}"
    if key.kind is not EntityKind.NODE or not key.id.startswith(prefix):
        return None
    return key.id.removeprefix(prefix)


def neighbours(state: WorkspaceState, flow_id: str, node_id: str) -> tuple[tuple[str, ...], tuple[str, ...]]:
    index = state.index
    if index is None:
        return (), ()
    key = EntityKey(EntityKind.NODE, qualified(flow_id, node_id))
    upstream = {found for reference in index.outgoing(key) if (found := flow_node(reference.target, flow_id))}
    downstream = {found for reference in index.incoming(key) if (found := flow_node(reference.source, flow_id))}
    return tuple(sorted(upstream - {node_id})), tuple(sorted(downstream - {node_id}))


def prompt_ref(project: LoadedProject, spec: NodeSpec) -> NodePromptRef | None:
    facts = inference_facts(project, spec.inference) if isinstance(spec, LlmNodeSpec) else None
    if facts is None:
        return None
    return NodePromptRef(
        inference_id=facts.inference_id,
        level=facts.level,
        path=facts.path,
        builder_ref=facts.builder_ref,
    )


def node_summary(state: WorkspaceState, flow_id: str, node_id: str, source: SourceSpec[NodeSpec]) -> NodeSummary:
    project = loaded_project(state)
    spec = source.spec
    upstream, downstream = neighbours(state, flow_id, node_id)
    prompt = prompt_ref(project, spec)
    return NodeSummary(
        node_id=node_id,
        local_id=local_node_id(node_id),
        parent=parent_node_id(node_id),
        kind=node_kind(spec),
        path=source.path,
        file_hash=source.file_hash,
        agent=spec.agent if isinstance(spec, LlmNodeSpec) else None,
        inference=spec.inference if isinstance(spec, LlmNodeSpec) else None,
        prompt_level=None if prompt is None else prompt.level,
        code_ref=spec.run if isinstance(spec, CodeNodeSpec) else None,
        problems_count=len(diagnostics_by_file(state).get(source.path, ())),
        upstream=upstream,
        downstream=downstream,
    )


def node_summaries(state: WorkspaceState, flow_id: str) -> tuple[NodeSummary, ...]:
    return flow_node_summaries(state, loaded_flow(state, flow_id), flow_id)


def flow_node_summaries(state: WorkspaceState, flow: LoadedFlow, scope: str) -> tuple[NodeSummary, ...]:
    return tuple(node_summary(state, scope, node_id, source) for node_id, source in ordered_nodes(flow))


def compiled_node(state: WorkspaceState, flow_id: str, node_id: str) -> CompiledNode | None:
    compiled = state.compiled
    flow = None if compiled is None else compiled.flows.get(FlowId(flow_id))
    return None if flow is None else flow.nodes.get(NodeId(node_id))


def binding_view(binding: FieldBinding | InputField) -> NodeBindingView:
    return NodeBindingView(slot=binding.name, ref=binding.from_, value=binding.value)


def dynamic_slots(shape: NodeShape) -> tuple[DynamicSlot, ...]:
    outputs = shape.outputs or ()
    return tuple(
        DynamicSlot(path=("out", decl.name), schema_from=decl.schema_from, limits=decl.limits)
        for decl in outputs
        if isinstance(decl, OutputField) and decl.schema_from is not None
    )


def output_value_shapes(project: LoadedProject, models: TypeModels, shape: NodeShape) -> dict[str, NodeValueShape]:
    shapes: dict[str, NodeValueShape] = {}
    for field in shape.outputs or ():
        if not isinstance(field, OutputField | BoundField) or field.value_type is None:
            continue
        source = project.types.get(TypeId(field.value_type))
        if source is None or not isinstance(source.spec, RecordType | UnionType):
            continue
        shapes[field.name] = NodeValueShape(
            type_id=field.value_type,
            spec=source.spec,
            json_schema=ref_schema(models, field.value_type),
        )
    return shapes


def node_code(spec: NodeSpec, schemas: NodeSchemas) -> NodeCode | None:
    if not isinstance(spec, CodeNodeSpec):
        return None
    return NodeCode(ref=spec.run, declared_in=schemas.in_, declared_out=schemas.out)


def display_sources(project: LoadedProject, source: SourceSpec[InferenceSpec] | None) -> dict[str, NodeDisplaySource]:
    if source is None or source.spec.display is None:
        return {}
    sources: dict[str, NodeDisplaySource] = {}
    for side in ("input", "output"):
        formatter = getattr(source.spec.display, side)
        if formatter is None or formatter.template is None:
            continue
        candidates = include_candidates((posixpath.dirname(source.path),), formatter.template)
        path = next((candidate for candidate in candidates if candidate in project.texts), None)
        if path is not None:
            sources[side] = NodeDisplaySource(path=path, text=project.texts[path])
    return sources


def agent_instructions(project: LoadedProject, source: SourceSpec[AgentSpec] | None) -> str | None:
    if source is None or source.spec.instructions is None:
        return None
    candidates = include_candidates((posixpath.dirname(source.path),), source.spec.instructions)
    path = next((candidate for candidate in candidates if candidate in project.texts), None)
    return None if path is None else project.texts[path]


def allowed_set_descriptions(project: LoadedProject, source: SourceSpec[InferenceSpec] | None) -> dict[str, str]:
    if source is None:
        return {}
    descriptions: dict[str, str] = {}
    for allowed_set in source.spec.allowed_sets or ():
        type_source = project.types.get(TypeId(allowed_set.type))
        if type_source is not None:
            descriptions[allowed_set.type] = type_source.spec.description
    return descriptions


def agent_models(agent: CompiledAgent) -> tuple[NodeAgentModel, ...]:
    return tuple(agent_model(item) for item in agent.models)


def agent_model(item: AgentModel) -> NodeAgentModel:
    return NodeAgentModel(model=item.model, provider=item.provider, family=model_family(item.model))


def node_detail(state: WorkspaceState, flow_id: str, node_id: str) -> NodeDetail:
    flow = loaded_flow(state, flow_id)
    source = flow.nodes.get(NodeId(node_id))
    if source is None:
        raise not_found(f"node {node_id} is not in flow {flow_id}")
    project = loaded_project(state)
    inference = (
        project.inferences.get(source.spec.inference)
        if isinstance(source.spec, LlmNodeSpec) and source.spec.inference is not None
        else None
    )
    inference_source = None if inference is None else inference.source
    agent_source = project.agents.get(AgentId(source.spec.agent)) if isinstance(source.spec, LlmNodeSpec) else None
    compiled_agent = (
        state.compiled.agents.get(AgentId(source.spec.agent))
        if state.compiled is not None and isinstance(source.spec, LlmNodeSpec)
        else None
    )
    shape = node_shape(source.spec, project)
    models = type_models(project)
    schemas = shape_schemas(models, flow_id, node_id, shape)
    summary = node_summary(state, flow_id, node_id, source)
    return NodeDetail(
        **summary.model_dump(),
        spec=source.spec,
        inference_spec=None if inference_source is None else inference_source.spec,
        inference_path=None if inference_source is None else inference_source.path,
        agent_spec=None if agent_source is None else agent_source.spec,
        agent_runtime=(
            None
            if agent_source is None
            else NodeAgentRuntime(
                models=None if compiled_agent is None else agent_models(compiled_agent),
                output=None if compiled_agent is None else compiled_agent.output,
                instructions=(
                    agent_instructions(project, agent_source) if compiled_agent is None else compiled_agent.instructions
                ),
            )
        ),
        agent_path=None if agent_source is None else agent_source.path,
        display_sources=display_sources(project, inference_source),
        allowed_set_descriptions=allowed_set_descriptions(project, inference_source),
        ir_node=compiled_node(state, flow_id, node_id),
        in_schema=schemas.in_,
        out_schema=schemas.out,
        form_schema=schemas.form,
        bindings=tuple(binding_view(binding) for binding in shape.bindings),
        prompt=prompt_ref(project, source.spec),
        code=node_code(source.spec, schemas),
        dynamic_slots=dynamic_slots(shape),
        value_shapes=output_value_shapes(project, models, shape),
        problems=diagnostics_by_file(state).get(source.path, ()),
    )
