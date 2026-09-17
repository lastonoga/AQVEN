from collections.abc import Callable, Mapping
from typing import Final

from aqven.diagnostics import Diagnostic, Severity
from aqven.ir.identity import flow_closure, flow_hash
from aqven.loader import LoadedFlow, within
from aqven.server.errors import ApiFailure, diagnostic_problem
from aqven.server.resources import (
    CompileStatus,
    FileRef,
    FlowDetail,
    FlowIr,
    FlowSchemas,
    FlowSpecView,
    FlowSummary,
    RunBrief,
)
from aqven.server.views.common import (
    diagnostics_within,
    loaded_flow,
    loaded_project,
    problem_counts,
    ref_schema,
    type_models,
)
from aqven.server.views.nodes import node_schemas, ordered_nodes
from aqven.server.workspace import FileStat, WorkspaceState
from aqven.spec import FlowId

type StatusRule = Callable[[WorkspaceState, LoadedFlow, tuple[Diagnostic, ...]], bool]


def _unreadable(state: WorkspaceState, flow: LoadedFlow, problems: tuple[Diagnostic, ...]) -> bool:
    return flow.source is None and flow.builder_path is None


def _invalid(state: WorkspaceState, flow: LoadedFlow, problems: tuple[Diagnostic, ...]) -> bool:
    project = state.report.project
    broken = project is not None and any(within(path, flow.folder) for path in project.invalid_paths)
    return broken or any(item.severity is Severity.ERROR for item in problems)


def _not_runnable(state: WorkspaceState, flow: LoadedFlow, problems: tuple[Diagnostic, ...]) -> bool:
    return not state.report.ok


STATUS_RULES: Final[tuple[tuple[StatusRule, CompileStatus], ...]] = (
    (_unreadable, "unreadable"),
    (_invalid, "invalid"),
    (_not_runnable, "not_runnable"),
)


def compile_status(state: WorkspaceState, flow: LoadedFlow, problems: tuple[Diagnostic, ...]) -> CompileStatus:
    for rule, status in STATUS_RULES:
        if rule(state, flow, problems):
            return status
    return "ok"


def content_hash(state: WorkspaceState, flow_id: str) -> str | None:
    compiled = state.compiled
    if compiled is None or FlowId(flow_id) not in compiled.flows:
        return None
    return flow_hash(compiled, FlowId(flow_id))


def flow_summary(state: WorkspaceState, flow: LoadedFlow, last_run: RunBrief | None) -> FlowSummary:
    problems = diagnostics_within(state, flow.folder)
    source = flow.source
    return FlowSummary(
        flow_id=flow.flow_id,
        root_path=flow.folder,
        compile_status=compile_status(state, flow, problems),
        problems=problem_counts(problems),
        first_problem=problems[0] if problems else None,
        node_count=len(flow.nodes),
        input_type=None if source is None else source.spec.input,
        output_type=None if source is None else source.spec.output,
        content_hash=content_hash(state, flow.flow_id),
        last_run=last_run,
    )


def flow_summaries(state: WorkspaceState, last_runs: Mapping[str, RunBrief]) -> tuple[FlowSummary, ...]:
    flows = sorted(loaded_project(state).flows.values(), key=lambda flow: flow.flow_id)
    return tuple(flow_summary(state, flow, last_runs.get(flow.flow_id)) for flow in flows)


def file_path(stat: FileStat) -> str:
    return stat.path


def flow_detail(state: WorkspaceState, flow_id: str, last_run: RunBrief | None) -> FlowDetail:
    flow = loaded_flow(state, flow_id)
    summary = flow_summary(state, flow, last_run)
    files = sorted((stat for path, stat in state.snapshot.files.items() if within(path, flow.folder)), key=file_path)
    source = flow.source
    return FlowDetail(
        **summary.model_dump(),
        description=None if source is None else source.spec.description,
        files=tuple(FileRef(path=stat.path, file_hash=stat.file_hash) for stat in files),
        tree_hash=state.snapshot.tree_hash,
        order=() if source is None else tuple(source.spec.order),
        diagnostics=diagnostics_within(state, flow.folder),
        layout_rev=None,
    )


def flow_spec_view(state: WorkspaceState, flow_id: str) -> FlowSpecView:
    flow = loaded_flow(state, flow_id)
    return FlowSpecView(
        flow_id=flow_id,
        flow=None if flow.source is None else flow.source.spec,
        builder_path=flow.builder_path,
        nodes={node_id: source.spec for node_id, source in ordered_nodes(flow)},
    )


def flow_ir(state: WorkspaceState, flow_id: str) -> FlowIr:
    flow = loaded_flow(state, flow_id)
    compiled = state.compiled
    if not state.report.ok:
        problems = tuple(diagnostic_problem(item) for item in state.report.errors)
        raise ApiFailure("NOT_RUNNABLE", "working copy has errors: IR cannot be built", problems=problems)
    if compiled is None or flow.flow_id not in compiled.flows:
        raise ApiFailure("NOT_RUNNABLE", f"IR of flow {flow_id} is unavailable: no compiler is connected to the server")
    return FlowIr(
        flow_id=flow_id,
        content_hash=flow_hash(compiled, flow.flow_id),
        ir=flow_closure(compiled, flow.flow_id),
    )


def flow_schemas(state: WorkspaceState, flow_id: str) -> FlowSchemas:
    flow = loaded_flow(state, flow_id)
    models = type_models(loaded_project(state))
    source = flow.source
    return FlowSchemas(
        flow_id=flow_id,
        input=ref_schema(models, None if source is None else source.spec.input),
        output=ref_schema(models, None if source is None else source.spec.output),
        context=() if source is None or source.spec.context is None else tuple(source.spec.context),
        nodes=node_schemas(state, flow),
    )
