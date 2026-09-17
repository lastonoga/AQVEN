from collections.abc import Iterator
from dataclasses import dataclass

from aqven.compiler.project import CompileSource, compile_project
from aqven.ir import CompiledFlow, CompiledProject, IrHash, flow_closure, flow_hash
from aqven.loader import inner_node_id
from aqven.spec import FlowId, NodeId


@dataclass(frozen=True, slots=True)
class FlowPlan:
    flow_id: FlowId
    ir_hash: IrHash
    project: CompiledProject

    @property
    def flow(self) -> CompiledFlow:
        return self.project.flow(self.flow_id)


def plan_flow(project: CompiledProject, flow_id: str) -> FlowPlan:
    target = FlowId(flow_id)
    return FlowPlan(flow_id=target, ir_hash=flow_hash(project, target), project=flow_closure(project, target))


def compile_flow_plan(source: CompileSource, flow_id: str) -> FlowPlan:
    return plan_flow(compile_project(source), flow_id)


def visible_node(flow: CompiledFlow, scope: NodeId | None, name: str) -> NodeId | None:
    candidates = (*(inner_node_id(container, name) for container in _containers(flow, scope)), NodeId(name))
    return next((candidate for candidate in candidates if candidate in flow.nodes), None)


def _containers(flow: CompiledFlow, scope: NodeId | None) -> Iterator[NodeId]:
    current = scope
    while current is not None and current in flow.nodes:
        yield current
        current = flow.nodes[current].parent
