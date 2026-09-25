from collections.abc import Callable, Mapping, Sequence
from typing import Final

from aqven.diagnostics import Diagnostic, diagnostic, render_path
from aqven.factors import FactorChange, VariantSite, brought_alternatives, resolve_flow
from aqven.loader import LoadedExperiment, LoadedProject, entity_stem, within
from aqven.spec import FactorKind, FlowId, NodeId

type Ownership = Callable[[LoadedProject, LoadedExperiment, FactorChange, str], bool]


def relocated(
    project: LoadedProject, site: VariantSite, changes: Sequence[FactorChange], item: Diagnostic
) -> Diagnostic:
    path = site.path(_slot(project, site.experiment, changes, item.file))
    message = f"variant {site.variant_id}: {_origin(item)}: {item.message}"
    return diagnostic(item.code, site.file, path, message, hint=item.hint)


def _slot(
    project: LoadedProject, experiment: LoadedExperiment, changes: Sequence[FactorChange], file: str
) -> NodeId | None:
    owner = next((item for item in changes if OWNERSHIP[item.what](project, experiment, item, file)), None)
    if owner is not None:
        return owner.node_id
    return changes[0].node_id if len(changes) == 1 else None


def _origin(item: Diagnostic) -> str:
    location = f"{item.file}:{item.line}" if item.line is not None else item.file
    return f"{location} {render_path(item.path)}" if item.path else location


def _agent_owns(project: LoadedProject, experiment: LoadedExperiment, change: FactorChange, file: str) -> bool:
    return False


def _prompt_owns(project: LoadedProject, experiment: LoadedExperiment, change: FactorChange, file: str) -> bool:
    prompt = experiment.prompts.get(change.value)
    return prompt is not None and prompt.path == file


def _use_owns(project: LoadedProject, experiment: LoadedExperiment, change: FactorChange, file: str) -> bool:
    brought = brought_alternatives(experiment, (NodeId(change.value),))
    return entity_stem(file) in {entity_stem(experiment.alternatives[node].path) for node in brought}


def _flow_owns(project: LoadedProject, experiment: LoadedExperiment, change: FactorChange, file: str) -> bool:
    target = resolve_flow(project, experiment, FlowId(change.value))
    return target is not None and bool(target.folder) and within(file, target.folder)


OWNERSHIP: Final[Mapping[FactorKind, Ownership]] = {
    FactorKind.AGENT: _agent_owns,
    FactorKind.PROMPT: _prompt_owns,
    FactorKind.USE: _use_owns,
    FactorKind.FLOW: _flow_owns,
}
