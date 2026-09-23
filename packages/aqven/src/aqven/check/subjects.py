from dataclasses import dataclass
from typing import Final

from aqven.check.context import CheckContext
from aqven.check.scopes import EvaluatedRecords
from aqven.loader import LoadedExperiment, LoadedFlow
from aqven.spec import ExperimentSubject, FlowSpec, NodeId

UNKNOWN_RECORDS: Final = EvaluatedRecords(None, None)


@dataclass(frozen=True, slots=True)
class Evaluated:
    label: str
    records: EvaluatedRecords


def subject_flow(context: CheckContext, experiment: LoadedExperiment) -> LoadedFlow | None:
    subject = experiment.source.spec.subject
    if subject.arm is not None:
        return experiment.arms.get(subject.arm)
    return context.project.flows.get(subject.flow) if subject.flow is not None else None


def subject_label(subject: ExperimentSubject) -> str:
    return f"arm {subject.arm}" if subject.arm is not None else f"flow {subject.flow}"


def flow_spec(flow: LoadedFlow | None) -> FlowSpec | None:
    source = flow.source if flow is not None else None
    return source.spec if source is not None else None


def range_order(subject: ExperimentSubject, spec: FlowSpec | None) -> tuple[NodeId, ...] | None:
    if spec is None or subject.from_ is None or subject.to is None:
        return None
    order = spec.order
    if subject.from_ not in order or subject.to not in order:
        return None
    return tuple(order[order.index(subject.from_) : order.index(subject.to) + 1]) or None


def inference_evaluated(context: CheckContext, inference_id: str) -> Evaluated:
    return Evaluated(f"inference {inference_id}", context.refs.inference_records(inference_id))


def subject_evaluated(context: CheckContext, experiment: LoadedExperiment) -> Evaluated:
    subject = experiment.source.spec.subject
    label = subject_label(subject)
    spec = flow_spec(subject_flow(context, experiment))
    if spec is None or subject.from_ is not None:
        return Evaluated(label, UNKNOWN_RECORDS)
    refs = context.refs
    return Evaluated(label, EvaluatedRecords(refs.type_annotation(spec.input), refs.type_annotation(spec.output)))
