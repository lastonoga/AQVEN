import posixpath
import re
from collections.abc import Callable, Iterable, Mapping
from typing import Final

from aqven.factors import subject_flow, variant_changes
from aqven.loader import (
    LoadedExperiment,
    LoadedInference,
    LoadedProject,
    SourceSpec,
    code_file_parts,
    local_node_id,
)
from aqven.series.views import FactorAgentView, FactorSlotView, NodeFileRole, NodeFileView
from aqven.server.views.nodes import agent_instructions
from aqven.server.views.prompts import prompt_facts
from aqven.spec import (
    CODE_FILE_PATTERN,
    AgentId,
    CallNodeSpec,
    CodeNodeSpec,
    ExperimentSpec,
    FactorKind,
    LlmNodeSpec,
    NodeId,
    NodeKind,
    NodeSpec,
)

type WrittenValue = Callable[[NodeId, NodeSpec], str | None]

CODE_FILE: Final = re.compile(CODE_FILE_PATTERN)
MODULE_SEPARATOR: Final = "."
FUNCTION_SEPARATOR: Final = ":"
PYTHON_SUFFIX: Final = ".py"
PACKAGE_INIT: Final = "__init__.py"


def written_agent(_: NodeId, spec: NodeSpec) -> str | None:
    return spec.agent if isinstance(spec, LlmNodeSpec) else None


def written_inference(_: NodeId, spec: NodeSpec) -> str | None:
    return spec.inference if isinstance(spec, LlmNodeSpec) else None


def written_node(node_id: NodeId, _: NodeSpec) -> str | None:
    return node_id


def written_flow(_: NodeId, spec: NodeSpec) -> str | None:
    return spec.flow if isinstance(spec, CallNodeSpec) else None


WRITTEN: Final[Mapping[FactorKind, WrittenValue]] = {
    FactorKind.AGENT: written_agent,
    FactorKind.PROMPT: written_inference,
    FactorKind.USE: written_node,
    FactorKind.FLOW: written_flow,
}


def file_view(role: NodeFileRole, path: str | None) -> tuple[NodeFileView, ...]:
    return () if path is None else (NodeFileView(role=role, path=path),)


def module_path(project: LoadedProject, ref: str) -> str | None:
    module = ref.partition(FUNCTION_SEPARATOR)[0]
    prefix = f"{project.project.spec.package}{MODULE_SEPARATOR}"
    if not module.startswith(prefix):
        return None
    base = posixpath.join(*module.removeprefix(prefix).split(MODULE_SEPARATOR))
    candidates = (f"{base}{PYTHON_SUFFIX}", posixpath.join(base, PACKAGE_INIT))
    return next((candidate for candidate in candidates if (project.root / candidate).is_file()), None)


def code_path(project: LoadedProject, ref: str | None) -> str | None:
    if ref is None:
        return None
    if CODE_FILE.fullmatch(ref) is not None:
        return code_file_parts(ref)[0]
    return module_path(project, ref)


def code_files(project: LoadedProject, spec: NodeSpec) -> tuple[NodeFileView, ...]:
    if not isinstance(spec, CodeNodeSpec):
        return ()
    return file_view("code", code_path(project, spec.run))


def inference_file(loaded: LoadedInference) -> str | None:
    return loaded.builder_path if loaded.source is None else loaded.source.path


def prompt_file(project: LoadedProject, loaded: LoadedInference) -> str | None:
    facts = prompt_facts(project, loaded)
    return facts.path if facts.path is not None else code_path(project, facts.builder_ref)


def inference_files(project: LoadedProject, spec: NodeSpec) -> tuple[NodeFileView, ...]:
    if not isinstance(spec, LlmNodeSpec) or spec.inference is None:
        return ()
    loaded = project.inferences.get(spec.inference)
    if loaded is None:
        return ()
    return (*file_view("inference", inference_file(loaded)), *file_view("prompt", prompt_file(project, loaded)))


def node_files(project: LoadedProject, source: SourceSpec[NodeSpec]) -> tuple[NodeFileView, ...]:
    return (
        NodeFileView(role="node", path=source.path),
        *code_files(project, source.spec),
        *inference_files(project, source.spec),
    )


def slot_view(
    project: LoadedProject, what: FactorKind, node_id: NodeId, source: SourceSpec[NodeSpec]
) -> FactorSlotView:
    return FactorSlotView(
        node_id=node_id,
        kind=NodeKind(source.spec.node),
        written=WRITTEN[what](node_id, source.spec),
        files=node_files(project, source),
    )


def slot_views(project: LoadedProject, loaded: LoadedExperiment) -> tuple[FactorSlotView, ...]:
    factor = loaded.source.spec.varies
    flow = subject_flow(project, loaded)
    if factor is None or flow is None:
        return ()
    nodes = {local_node_id(node_id): source for node_id, source in flow.nodes.items()}
    return tuple(slot_view(project, factor.what, node, nodes[node]) for node in factor.nodes if node in nodes)


def variant_values(spec: ExperimentSpec) -> Iterable[str]:
    return (change.value for variant in spec.variants for change in variant_changes(spec, variant))


def factor_agent_ids(spec: ExperimentSpec, slots: Iterable[FactorSlotView]) -> tuple[AgentId, ...]:
    if spec.varies is None or spec.varies.what is not FactorKind.AGENT:
        return ()
    written = (slot.written for slot in slots if slot.written is not None)
    return tuple(dict.fromkeys(AgentId(value) for value in (*written, *variant_values(spec))))


def agent_view(project: LoadedProject, agent_id: AgentId) -> tuple[FactorAgentView, ...]:
    source = project.agents.get(agent_id)
    if source is None:
        return ()
    return (
        FactorAgentView(
            agent_id=agent_id,
            file=source.path,
            spec=source.spec,
            instructions=agent_instructions(project, source),
        ),
    )


def factor_agents(
    project: LoadedProject, spec: ExperimentSpec, slots: Iterable[FactorSlotView]
) -> tuple[FactorAgentView, ...]:
    return tuple(view for agent_id in factor_agent_ids(spec, slots) for view in agent_view(project, agent_id))
