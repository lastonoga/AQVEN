from typing import Final, assert_never

from aqven.check.graph import NodeEntry
from aqven.check.output_modes import resolved_agent_modes
from aqven.compiler.bindings import bindings, dynamic_outputs, fields_ir, outputs, policy
from aqven.compiler.context import CompileContext
from aqven.compiler.errors import compile_failure
from aqven.compiler.registry import Side, tool_schema
from aqven.compiler.schemas import open_object
from aqven.diagnostics import DiagnosticCode
from aqven.ir import (
    CompiledCallNode,
    CompiledCodeNode,
    CompiledHumanNode,
    CompiledLlmNode,
    CompiledLoopNode,
    CompiledMapNode,
    CompiledNarrowNode,
    CompiledNode,
    CompiledParallelNode,
    CompiledSwitchCase,
    CompiledSwitchNode,
    CompiledToolNode,
    JsonSchema,
    OutputMode,
)
from aqven.loader import inner_node_id
from aqven.spec import (
    CallNodeSpec,
    CodeNodeSpec,
    HumanNodeSpec,
    InferenceId,
    InputField,
    LlmNodeSpec,
    LoopNodeSpec,
    MapNodeSpec,
    NarrowNodeSpec,
    ParallelNodeSpec,
    SwitchCase,
    SwitchNodeSpec,
    ToolNodeSpec,
)

INPUT_RECORD: Final = "in"


def compile_node(context: CompileContext, entry: NodeEntry) -> CompiledNode:
    spec = entry.spec
    match spec:
        case LlmNodeSpec():
            return _llm(context, entry, spec)
        case CodeNodeSpec():
            return _code(context, entry, spec)
        case ToolNodeSpec():
            return _tool(context, entry, spec)
        case HumanNodeSpec():
            return _human(context, entry, spec)
        case ParallelNodeSpec():
            return _parallel(context, entry, spec)
        case MapNodeSpec():
            return _map(context, entry, spec)
        case SwitchNodeSpec():
            return _switch(context, entry, spec)
        case LoopNodeSpec():
            return _loop(context, entry, spec)
        case CallNodeSpec():
            return _call(context, entry, spec)
        case NarrowNodeSpec():
            return _narrow(context, entry, spec)
        case _:
            assert_never(spec)


def _llm(context: CompileContext, entry: NodeEntry, spec: LlmNodeSpec) -> CompiledLlmNode:
    inference = _inference(entry, spec)
    return CompiledLlmNode(
        node_id=entry.node_id,
        parent=entry.parent,
        description=spec.description,
        limits=spec.limits,
        agent=spec.agent,
        inference=inference,
        output_mode=_output_mode(context, entry, spec),
        inputs=bindings(spec.in_),
        input_schema=context.schema(context.refs.inference_record(inference, "in"), entry.file, ("inference",)),
        output_schema=_output_schema(context, entry),
    )


def _code(context: CompileContext, entry: NodeEntry, spec: CodeNodeSpec) -> CompiledCodeNode:
    return CompiledCodeNode(
        node_id=entry.node_id,
        parent=entry.parent,
        description=spec.description,
        limits=spec.limits,
        run=context.code(spec.run, entry.file, ("run",)),
        inputs=bindings(spec.in_),
        input_schema=_input_schema(context, entry, spec.in_),
        input_fields=fields_ir(spec.in_),
        output_fields=fields_ir(spec.out),
        dynamic_outputs=dynamic_outputs(spec.out),
        output_schema=_output_schema(context, entry),
    )


def _tool(context: CompileContext, entry: NodeEntry, spec: ToolNodeSpec) -> CompiledToolNode:
    return CompiledToolNode(
        node_id=entry.node_id,
        parent=entry.parent,
        description=spec.description,
        limits=spec.limits,
        tool=spec.tool,
        inputs=bindings(spec.in_),
        input_schema=_tool_side(context, entry, spec, "in"),
        output_schema=_tool_side(context, entry, spec, "out"),
    )


def _human(context: CompileContext, entry: NodeEntry, spec: HumanNodeSpec) -> CompiledHumanNode:
    return CompiledHumanNode(
        node_id=entry.node_id,
        parent=entry.parent,
        description=spec.description,
        limits=spec.limits,
        form=spec.form,
        assignee=spec.assignee,
        timeout_seconds=spec.timeout_seconds,
        on_timeout=spec.on_timeout,
        inputs=bindings(spec.in_),
        input_schema=_input_schema(context, entry, spec.in_),
        output_schema=_output_schema(context, entry),
    )


def _parallel(context: CompileContext, entry: NodeEntry, spec: ParallelNodeSpec) -> CompiledParallelNode:
    return CompiledParallelNode(
        node_id=entry.node_id,
        parent=entry.parent,
        description=spec.description,
        limits=spec.limits,
        branches={key: inner_node_id(entry.node_id, local) for key, local in spec.body.items()},
        join=policy(context, spec.join, entry.file, ("join",)),
        outputs=outputs(spec.out),
        output_schema=_output_schema(context, entry),
    )


def _map(context: CompileContext, entry: NodeEntry, spec: MapNodeSpec) -> CompiledMapNode:
    return CompiledMapNode(
        node_id=entry.node_id,
        parent=entry.parent,
        description=spec.description,
        limits=spec.limits,
        over=spec.over,
        body=inner_node_id(entry.node_id, spec.body),
        concurrency=spec.concurrency,
        on_item_error=policy(context, spec.on_item_error, entry.file, ("on_item_error",)),
        outputs=outputs(spec.out),
        output_schema=_output_schema(context, entry),
    )


def _switch(context: CompileContext, entry: NodeEntry, spec: SwitchNodeSpec) -> CompiledSwitchNode:
    return CompiledSwitchNode(
        node_id=entry.node_id,
        parent=entry.parent,
        description=spec.description,
        limits=spec.limits,
        on=spec.on,
        cases={key: _switch_case(entry, case) for key, case in spec.cases.items()},
        output_names=tuple(decl.name for decl in spec.out),
        output_schema=_output_schema(context, entry),
    )


def _loop(context: CompileContext, entry: NodeEntry, spec: LoopNodeSpec) -> CompiledLoopNode:
    return CompiledLoopNode(
        node_id=entry.node_id,
        parent=entry.parent,
        description=spec.description,
        limits=spec.limits,
        body=tuple(inner_node_id(entry.node_id, local) for local in spec.body),
        init={inner_node_id(entry.node_id, local): bindings(items) for local, items in (spec.init or {}).items()},
        max_iter=spec.max_iter,
        stop=tuple(policy(context, ref, entry.file, ("stop", index)) for index, ref in enumerate(spec.stop or ())),
        select=policy(context, spec.select, entry.file, ("select",)),
        outputs=outputs(spec.out),
        output_schema=_output_schema(context, entry),
    )


def _call(context: CompileContext, entry: NodeEntry, spec: CallNodeSpec) -> CompiledCallNode:
    called = context.graph.flow_spec(spec.flow)
    if called is None:
        message = f"flow {spec.flow} does not exist or its spec is not materialized"
        raise compile_failure(DiagnosticCode.E_FLOW_UNKNOWN, entry.file, ("flow",), message)
    return CompiledCallNode(
        node_id=entry.node_id,
        parent=entry.parent,
        description=spec.description,
        limits=spec.limits,
        flow=spec.flow,
        inputs=bindings(spec.in_),
        input_schema=context.type_schema(called.input, entry.file, ("flow",)),
        output_schema=_output_schema(context, entry),
    )


def _narrow(context: CompileContext, entry: NodeEntry, spec: NarrowNodeSpec) -> CompiledNarrowNode:
    return CompiledNarrowNode(
        node_id=entry.node_id,
        parent=entry.parent,
        description=spec.description,
        limits=spec.limits,
        source=spec.from_,
        to=spec.to,
        output_schema=_output_schema(context, entry),
    )


def _inference(entry: NodeEntry, spec: LlmNodeSpec) -> InferenceId:
    if spec.inference is None:
        message = "llm node has no inference: no adjacent <node>.inference.yaml and no inference key"
        raise compile_failure(DiagnosticCode.E_INFERENCE_UNKNOWN, entry.file, (), message)
    return spec.inference


def _output_mode(context: CompileContext, entry: NodeEntry, spec: LlmNodeSpec) -> OutputMode:
    agent = context.check.agents.get(spec.agent)
    if agent is None:
        raise compile_failure(
            DiagnosticCode.E_AGENT_UNKNOWN, entry.file, ("agent",), f"agent {spec.agent} does not exist"
        )
    return resolved_agent_modes(agent).resolve().mode


def _tool_side(context: CompileContext, entry: NodeEntry, spec: ToolNodeSpec, side: Side) -> JsonSchema:
    if spec.tool not in context.project.tools:
        raise compile_failure(DiagnosticCode.E_TOOL_UNKNOWN, entry.file, ("tool",), f"tool {spec.tool} does not exist")
    schema = tool_schema(context, spec.tool, side)
    return open_object() if schema is None else schema


def _input_schema(context: CompileContext, entry: NodeEntry, fields: list[InputField]) -> JsonSchema:
    record = context.refs.record(f"flow.{entry.owner}.{entry.node_id}.{INPUT_RECORD}", fields)
    return context.schema(record, entry.file, (INPUT_RECORD,))


def _output_schema(context: CompileContext, entry: NodeEntry) -> JsonSchema:
    return context.schema(context.refs.node_output(entry), entry.file, ())


def _switch_case(entry: NodeEntry, case: SwitchCase) -> CompiledSwitchCase:
    node = inner_node_id(entry.node_id, case.node) if case.node is not None else None
    return CompiledSwitchCase(node=node, bindings=bindings(case.bind or ()))
