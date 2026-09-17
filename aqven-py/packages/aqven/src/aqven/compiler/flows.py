from aqven.compiler.bindings import bindings
from aqven.compiler.context import CompileContext
from aqven.compiler.errors import compile_failure
from aqven.compiler.nodes import compile_node
from aqven.diagnostics import DiagnosticCode
from aqven.ir import CompiledFlow
from aqven.loader import LoadedFlow


def compile_flow(context: CompileContext, loaded: LoadedFlow) -> CompiledFlow:
    source = loaded.source
    if source is None:
        message = f"flow {loaded.flow_id} from a builder is not materialized: compile a check_project report"
        raise compile_failure(DiagnosticCode.E_BUILDER_FAILED, loaded.builder_path or loaded.folder, (), message)
    spec = source.spec
    entries = sorted(context.graph.owner_entries(loaded.flow_id), key=lambda entry: entry.node_id)
    return CompiledFlow(
        flow_id=loaded.flow_id,
        description=spec.description,
        input_type=spec.input,
        output_type=spec.output,
        input_schema=context.type_schema(spec.input, source.path, ("input",)),
        output_schema=context.type_schema(spec.output, source.path, ("output",)),
        returns=bindings(spec.returns),
        context=tuple(spec.context or ()),
        limits=spec.limits,
        order=tuple(spec.order),
        nodes={entry.node_id: compile_node(context, entry) for entry in entries},
        requires=tuple(spec.requires or ()),
    )
