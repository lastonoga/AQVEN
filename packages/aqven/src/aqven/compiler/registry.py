import posixpath
from typing import Final, Literal

from aqven.check import ResolvedAgent, ResolvedModel
from aqven.check.output_modes import resolved_agent_modes
from aqven.compiler.bindings import checks, dynamic_outputs, fields_ir
from aqven.compiler.context import CompileContext
from aqven.compiler.errors import compile_failure
from aqven.compiler.prompts import inference_prompt
from aqven.diagnostics import DiagnosticCode
from aqven.ir import (
    AgentModel,
    CodeToolSource,
    CompiledAgent,
    CompiledAgentOutput,
    CompiledAllowedSet,
    CompiledDisplayFormatter,
    CompiledInference,
    CompiledInferenceDisplay,
    CompiledJobWait,
    CompiledMcpServer,
    CompiledTool,
    CompiledToolSource,
    JsonSchema,
    McpToolSource,
)
from aqven.loader import LoadedInference, SourceSpec, YamlPath, include_candidates
from aqven.spec import AgentId, AgentSpec, InferenceId, McpServerId, McpServerSpec, ToolId, ToolSpec, parse_model

type Side = Literal["in", "out"]

INSTRUCTIONS_KEY: Final = "instructions"
RUN_KEY: Final = "run"
WAIT_POLL_PATH: Final[YamlPath] = ("wait", "poll")


def compile_agent(context: CompileContext, agent_id: AgentId, source: SourceSpec[AgentSpec]) -> CompiledAgent:
    spec = source.spec
    resolved = context.check.agents[agent_id]
    return CompiledAgent(
        agent_id=agent_id,
        description=spec.description,
        models=tuple(_agent_model(model) for model in resolved.models),
        settings=spec.settings,
        output=compile_agent_output(resolved),
        file=source.path,
        instructions=_instructions(context, source),
        tools=tuple(spec.tools or ()),
        mcp_servers=tuple(spec.mcp_servers or ()),
        subagents=tuple(spec.subagents or ()),
        approval=spec.approval,
        limits=spec.limits,
    )


def compile_inference(context: CompileContext, loaded: LoadedInference) -> CompiledInference:
    source = loaded.source
    if source is None:
        message = f"inference {loaded.inference_id} from a builder is not materialized: compile a check_project report"
        raise compile_failure(DiagnosticCode.E_BUILDER_FAILED, loaded.builder_path or loaded.folder, (), message)
    spec = source.spec
    parts = inference_prompt(context, loaded, source)
    return CompiledInference(
        inference_id=loaded.inference_id,
        description=spec.description,
        input_fields=fields_ir(spec.in_),
        output_fields=fields_ir(spec.out),
        input_schema=_inference_schema(context, loaded.inference_id, source.path, "in"),
        output_schema=_inference_schema(context, loaded.inference_id, source.path, "out"),
        dynamic_outputs=dynamic_outputs(spec.out),
        prompt=parts.prompt,
        variants=parts.variants,
        allowed_sets=tuple(
            CompiledAllowedSet(type_id=allowed.type, source=allowed.from_, labels_from=allowed.labels_from)
            for allowed in spec.allowed_sets or ()
        ),
        examples=tuple(spec.examples or ()),
        checks=checks(context, spec.checks or (), source.path),
        display=(
            CompiledInferenceDisplay(
                input=_display_formatter(context, source.path, "input", spec.display.input),
                output=_display_formatter(context, source.path, "output", spec.display.output),
            )
            if spec.display is not None
            else None
        ),
        file=source.path,
        origin=loaded.origin,
    )


def _display_formatter(context: CompileContext, file: str, side: str, spec: object) -> CompiledDisplayFormatter | None:
    from aqven.spec import DisplayFormatterSpec

    if not isinstance(spec, DisplayFormatterSpec):
        return None
    return CompiledDisplayFormatter(
        run=context.code(spec.run, file, ("display", side, "run")) if spec.run is not None else None,
        template=(
            context.text_file(
                include_candidates((posixpath.dirname(file),), spec.template),
                file,
                ("display", side, "template"),
                f"display template {spec.template} is missing",
            )
            if spec.template is not None
            else None
        ),
        variables=spec.variables,
    )


def compile_agent_output(resolved: ResolvedAgent) -> CompiledAgentOutput:
    output = resolved.agent.output
    resolution = resolved_agent_modes(resolved).resolve()
    return CompiledAgentOutput(
        mode=resolution.mode,
        declared_mode=resolution.declared,
        mode_source=resolution.source,
        mode_reason=resolution.reason,
        instruction=resolution.instruction,
        strict=output.strict,
        retries=output.retries,
        on_error=output.on_error,
        on_refusal=output.on_refusal,
        on_truncated=output.on_truncated,
    )


def compile_tool(context: CompileContext, tool_id: ToolId, source: SourceSpec[ToolSpec]) -> CompiledTool:
    spec = source.spec
    return CompiledTool(
        tool_id=tool_id,
        description=spec.description,
        source=_tool_source(context, source),
        effect=spec.effect,
        idempotency_key=tuple(spec.idempotency_key or ()),
        secrets=tuple(spec.secrets or ()),
        wait=_wait(context, source),
        input_fields=fields_ir(spec.in_),
        output_fields=fields_ir(spec.out),
        input_schema=tool_schema(context, tool_id, "in"),
        output_schema=tool_schema(context, tool_id, "out"),
        dynamic_outputs=dynamic_outputs(spec.out),
    )


def compile_mcp_server(server_id: McpServerId, source: SourceSpec[McpServerSpec]) -> CompiledMcpServer:
    spec = source.spec
    return CompiledMcpServer(
        server_id=server_id,
        description=spec.description,
        transport=spec.transport,
        url=spec.url,
        headers=tuple(spec.headers or ()),
        schema_hash=spec.schema_hash,
    )


def tool_schema(context: CompileContext, tool_id: ToolId, side: Side) -> JsonSchema | None:
    source = context.project.tools[tool_id]
    if source.spec.mcp is not None:
        return None
    return context.schema(context.refs.tool_record(tool_id, side), source.path, (side,))


def _agent_model(resolved: ResolvedModel) -> AgentModel:
    return AgentModel(model=resolved.model, provider=parse_model(resolved.model).provider)


def _instructions(context: CompileContext, source: SourceSpec[AgentSpec]) -> str | None:
    written = source.spec.instructions
    if written is None:
        return None
    candidates = include_candidates((posixpath.dirname(source.path),), written)
    missing = f"instructions file {written} not found relative to the agent file or the project root"
    return context.project.texts[context.text_file(candidates, source.path, (INSTRUCTIONS_KEY,), missing)]


def _inference_schema(context: CompileContext, inference_id: InferenceId, file: str, side: Side) -> JsonSchema:
    return context.schema(context.refs.inference_record(inference_id, side), file, (side,))


def _tool_source(context: CompileContext, source: SourceSpec[ToolSpec]) -> CompiledToolSource:
    spec = source.spec
    if spec.mcp is not None:
        return McpToolSource(server=spec.mcp.server, tool=spec.mcp.tool)
    if spec.run is not None:
        return CodeToolSource(run=context.code(spec.run, source.path, (RUN_KEY,)))
    raise compile_failure(DiagnosticCode.E_SPEC_INVALID, source.path, (), "tool has neither run nor mcp")


def _wait(context: CompileContext, source: SourceSpec[ToolSpec]) -> CompiledJobWait | None:
    wait = source.spec.wait
    if wait is None:
        return None
    return CompiledJobWait(
        poll=context.code(wait.poll, source.path, WAIT_POLL_PATH),
        interval_seconds=wait.interval_seconds,
        timeout_seconds=wait.timeout_seconds,
    )
