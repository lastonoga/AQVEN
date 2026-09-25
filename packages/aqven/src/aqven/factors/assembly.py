from collections.abc import Iterable, Mapping
from dataclasses import replace
from typing import Final

from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.factors.agent import AgentFactor
from aqven.factors.base import Factor
from aqven.factors.changes import variant_changes, variant_index
from aqven.factors.draft import VariantDraft
from aqven.factors.flow import FlowFactor
from aqven.factors.model import AssembledVariant, AssemblyFailure, FactorChange, VariantAssembly
from aqven.factors.prompt import PromptFactor
from aqven.factors.site import VariantSite
from aqven.factors.subjects import called_flows, experiment_flows, subject_flow
from aqven.factors.use import UseFactor
from aqven.loader import LoadedExperiment, LoadedProject
from aqven.spec import FactorKind, VariantId, VariantSpec

SUBJECT_PATH: Final = ("subject", "flow")

FACTORS: Final[Mapping[FactorKind, Factor]] = {
    FactorKind.AGENT: AgentFactor(),
    FactorKind.PROMPT: PromptFactor(),
    FactorKind.USE: UseFactor(),
    FactorKind.FLOW: FlowFactor(),
}


def assemble_variant(project: LoadedProject, experiment: LoadedExperiment, variant: VariantSpec) -> VariantAssembly:
    spec = experiment.source.spec
    site = VariantSite(experiment, variant.id, variant_index(spec, variant))
    return assemble_changes(project, experiment, site, variant_changes(spec, variant))


def assemble_subject(project: LoadedProject, experiment: LoadedExperiment, variant_id: VariantId) -> VariantAssembly:
    return assemble_changes(project, experiment, VariantSite(experiment, variant_id, None), ())


def assemble_changes(
    project: LoadedProject, experiment: LoadedExperiment, site: VariantSite, changes: Iterable[FactorChange]
) -> VariantAssembly:
    subject = subject_flow(project, experiment)
    if subject is None:
        return AssemblyFailure(site.variant_id, (_subject_unknown(experiment),))
    draft = VariantDraft.start(project, experiment, site, subject)
    applied = tuple(changes)
    problems = tuple(item for change in applied for item in _apply(draft, change))
    if problems:
        return AssemblyFailure(site.variant_id, problems)
    return _assembled(draft, applied)


def _apply(draft: VariantDraft, change: FactorChange) -> tuple[Diagnostic, ...]:
    slot = draft.nodes.get(change.node_id)
    if slot is not None:
        return FACTORS[change.what].apply(draft, change, slot)
    if change.node_id in draft.project.broken_ids:
        return ()
    return (draft.unknown_node(change),)


def _assembled(draft: VariantDraft, changes: tuple[FactorChange, ...]) -> AssembledVariant:
    subject = draft.subject_flow()
    flows = {**experiment_flows(draft.project, draft.experiment), subject.flow_id: subject}
    reached = called_flows(flows, (subject.flow_id,))
    project = replace(
        draft.project,
        flows={flow_id: flows[flow_id] for flow_id in reached},
        inferences={**draft.project.inferences, **draft.inferences},
        experiments={},
        datasets={},
    )
    return AssembledVariant(draft.site.variant_id, subject.flow_id, project, changes)


def _subject_unknown(experiment: LoadedExperiment) -> Diagnostic:
    flow = experiment.source.spec.subject.flow
    message = f"flow {flow} is neither a flow of {experiment.folder}/flows nor a flow of the project"
    return diagnostic(DiagnosticCode.E_FLOW_UNKNOWN, experiment.source.path, SUBJECT_PATH, message)
