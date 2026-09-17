from pathlib import Path
from typing import assert_never

from pydantic import ValidationError

from aqven.check import CheckReport, CodeResolver, build_context, check_project
from aqven.compiler.context import CompileContext
from aqven.compiler.errors import CompileError, compile_failure
from aqven.compiler.flows import compile_flow
from aqven.compiler.registry import compile_agent, compile_inference, compile_mcp_server, compile_tool
from aqven.diagnostics import DiagnosticCode
from aqven.ir import CompiledProject, JsonSchema
from aqven.loader import PROJECT_FILE, LoadedProject
from aqven.spec import TypeId

type CompileSource = LoadedProject | CheckReport


def compile_project(source: CompileSource) -> CompiledProject:
    project = loaded_project(source)
    context = CompileContext(build_context(project, CodeResolver(project.root)))
    try:
        return _compiled(context)
    except ValidationError as error:
        message = f"plan does not pass the IR models: {error}"
        raise compile_failure(DiagnosticCode.E_SPEC_INVALID, project.project.path, (), message) from error


def compile_root(root: Path) -> CompiledProject:
    return compile_project(check_project(root))


def loaded_project(source: CompileSource) -> LoadedProject:
    match source:
        case CheckReport():
            return _reported(source)
        case LoadedProject():
            return source
        case _:
            assert_never(source)


def _reported(report: CheckReport) -> LoadedProject:
    if not report.ok:
        raise CompileError(report.errors)
    if report.project is None:
        raise compile_failure(DiagnosticCode.E_PROJECT_NOT_FOUND, PROJECT_FILE, (), "check report has no project")
    return report.project


def _compiled(context: CompileContext) -> CompiledProject:
    project = context.project
    spec = context.check.spec
    return CompiledProject(
        package=spec.package,
        description=spec.description,
        providers=tuple(spec.providers),
        policies=spec.policies,
        limits=spec.limits,
        type_schemas=_type_schemas(context),
        agents={
            agent_id: compile_agent(context, agent_id, source) for agent_id, source in sorted(project.agents.items())
        },
        inferences={
            inference_id: compile_inference(context, loaded)
            for inference_id, loaded in sorted(project.inferences.items())
        },
        tools={tool_id: compile_tool(context, tool_id, source) for tool_id, source in sorted(project.tools.items())},
        mcp_servers={
            server_id: compile_mcp_server(server_id, source)
            for server_id, source in sorted(project.mcp_servers.items())
        },
        flows={flow_id: compile_flow(context, loaded) for flow_id, loaded in sorted(project.flows.items())},
    )


def _type_schemas(context: CompileContext) -> dict[TypeId, JsonSchema]:
    return {
        type_id: context.type_schema(type_id, source.path, ())
        for type_id, source in sorted(context.project.types.items())
    }
