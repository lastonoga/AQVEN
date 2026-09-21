import json
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass
from typing import Final

from aqven.check.simulation.plan import INJECTED_CODE
from aqven.check.simulation.runner import FlowResult, NodeFailure, PassResult
from aqven.diagnostics import Diagnostic, DiagnosticCode, templated_diagnostic
from aqven.ir import CompiledFlow, CompiledParallelNode
from aqven.loader import LoadedProject
from aqven.runtime.address import ExecutionAddress, JsonObject
from aqven.spec import FlowId, NodeId

PROJECT_FILE: Final = "aqven.yaml"
INPUT_LIMIT: Final = 400
MESSAGE_LIMIT: Final = 400
NODE_PATH: Final = "node"
PROMPT_CODES: Final = frozenset({"prompt_invalid"})
OUTPUT_CODES: Final = frozenset(
    {
        "output_invalid",
        "MODEL_INVALID_JSON",
        "MODEL_SCHEMA_MISMATCH",
        "MODEL_NO_STRUCTURED_OUTPUT",
        "MODEL_RETRIES_EXHAUSTED",
    }
)
FAILURE_CODES: Final[Mapping[str, DiagnosticCode]] = {
    **{code: DiagnosticCode.E_SIM_PROMPT_RENDER for code in PROMPT_CODES},
    **{code: DiagnosticCode.E_SIM_OUTPUT_INVALID for code in OUTPUT_CODES},
}
RESOLUTION_CODES: Final = frozenset({"CODE_NOT_FOUND", "E_CODE_REF_UNRESOLVED", "code_invalid"})


@dataclass(frozen=True, slots=True)
class FlowFiles:
    flow_file: str
    nodes: Mapping[str, str]

    def node_file(self, node_id: str) -> str:
        return self.nodes.get(node_id, self.flow_file)


def flow_files(project: LoadedProject, flow_id: FlowId) -> FlowFiles:
    loaded = project.flows.get(flow_id)
    if loaded is None:
        return FlowFiles(flow_file=PROJECT_FILE, nodes={})
    source = loaded.source
    nodes = {str(node_id): node.path for node_id, node in loaded.nodes.items()}
    return FlowFiles(flow_file=source.path if source is not None else PROJECT_FILE, nodes=nodes)


def address_text(address: ExecutionAddress) -> str:
    parts = (
        address.node_id,
        f"branch {address.branch_key}" if address.branch_key is not None else "",
        f"iteration {address.iteration}" if address.iteration is not None else "",
        f"item {address.item_index}" if address.item_index is not None else "",
    )
    named = [part for part in parts if part]
    return ", ".join(named)


def input_text(flow_input: JsonObject) -> str:
    return json.dumps(flow_input, ensure_ascii=False, sort_keys=True)[:INPUT_LIMIT]


def resolution_failed(result: FlowResult) -> bool:
    node_codes = (failure.error.code for item in result.passes for failure in item.failures)
    run_codes = (item.error.code for item in result.passes if item.error is not None)
    return any(code in RESOLUTION_CODES for code in (*node_codes, *run_codes))


def flow_diagnostics(flow: CompiledFlow, files: FlowFiles, result: FlowResult) -> tuple[Diagnostic, ...]:
    failures = tuple(_pass_diagnostics(flow, files, result.flow_id, item) for item in result.passes)
    unreached = _unreached(flow, files, result)
    return (*(item for group in failures for item in group), *unreached)


def _pass_diagnostics(
    flow: CompiledFlow, files: FlowFiles, flow_id: FlowId, item: PassResult
) -> tuple[Diagnostic, ...]:
    ignored = _ignored_nodes(flow, item)
    reported = _innermost(flow, tuple(failure for failure in item.failures if failure.error.code != INJECTED_CODE))
    nodes = tuple(
        _failure_diagnostic(files, flow_id, item, failure)
        for failure in reported
        if failure.address.node_id not in ignored
    )
    return (*nodes, *_run_diagnostic(files, flow_id, item))


def _innermost(flow: CompiledFlow, failures: Sequence[NodeFailure]) -> tuple[NodeFailure, ...]:
    inner = {parent for failure in failures for parent in tuple(_ancestors(flow, NodeId(failure.address.node_id)))[1:]}
    return tuple(failure for failure in failures if failure.address.node_id not in inner)


def _run_diagnostic(files: FlowFiles, flow_id: FlowId, item: PassResult) -> Iterator[Diagnostic]:
    error = item.error
    if error is None or item.injected_node is not None or error.address is not None:
        return
    yield templated_diagnostic(
        DiagnosticCode.E_SIM_RUN_FAILED,
        files.flow_file,
        (),
        {
            "flow": flow_id,
            "pass": item.name,
            "code": error.code,
            "message": error.message[:MESSAGE_LIMIT],
            "input": input_text(item.flow_input),
        },
    )


def _failure_diagnostic(files: FlowFiles, flow_id: FlowId, item: PassResult, failure: NodeFailure) -> Diagnostic:
    code = FAILURE_CODES.get(failure.error.code, DiagnosticCode.E_SIM_NODE_FAILED)
    return templated_diagnostic(
        code,
        files.node_file(failure.address.node_id),
        (NODE_PATH,),
        {
            "flow": flow_id,
            "pass": item.name,
            "address": address_text(failure.address),
            "code": failure.error.code,
            "message": failure.error.message[:MESSAGE_LIMIT],
            "input": input_text(item.flow_input),
        },
    )


def _unreached(flow: CompiledFlow, files: FlowFiles, result: FlowResult) -> tuple[Diagnostic, ...]:
    executed = result.executed
    return tuple(
        templated_diagnostic(
            DiagnosticCode.W_SIM_NODE_UNREACHED,
            files.node_file(node_id),
            (NODE_PATH,),
            {"flow": result.flow_id, "node": node_id},
        )
        for node_id in flow.nodes
        if node_id not in executed and not _joined_branch(flow, node_id, executed)
    )


def _joined_branch(flow: CompiledFlow, node_id: NodeId, executed: frozenset[str]) -> bool:
    owners = tuple(_ancestors(flow, node_id))[1:]
    named = (NodeId(owner) for owner in owners)
    return any(isinstance(flow.nodes[owner], CompiledParallelNode) and owner in executed for owner in named)


def _ignored_nodes(flow: CompiledFlow, item: PassResult) -> frozenset[str]:
    injected = item.injected_node
    if injected is None:
        return frozenset()
    return frozenset(_ancestors(flow, injected))


def _ancestors(flow: CompiledFlow, node_id: NodeId) -> Iterator[str]:
    current: NodeId | None = node_id
    while current is not None and current in flow.nodes:
        yield current
        current = flow.nodes[current].parent
