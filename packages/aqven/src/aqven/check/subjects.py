from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field
from typing import Final

from pydantic import BaseModel

from aqven.check.arms import arm_view
from aqven.check.context import CheckContext
from aqven.check.scopes import EvaluatedRecords, Side
from aqven.loader import LoadedExperiment, LoadedFlow
from aqven.spec import ArmId, ExperimentSubject, FlowId, FlowSpec, NodeId

UNKNOWN_RECORDS: Final = EvaluatedRecords(None, None)
EXPECTED_OUTPUT: Final = "expected_output"
JSON_RECORD: Final = BaseModel


@dataclass(frozen=True, slots=True)
class JudgeScope:
    label: str
    documents: tuple[object | None, ...]
    bound: frozenset[str] = frozenset()


@dataclass(frozen=True, slots=True)
class Evaluated:
    label: str
    records: EvaluatedRecords
    hints: EvaluatedRecords = UNKNOWN_RECORDS
    scopes: tuple[JudgeScope, ...] = ()
    sides: Mapping[Side, str] = field(default_factory=dict[Side, str])
    typing: str = ""
    owner: str = ""


@dataclass(frozen=True, slots=True)
class Target:
    view: CheckContext
    flow_id: FlowId
    spec: FlowSpec
    label: str


type ScopeDocuments = Callable[[Target, ExperimentSubject], tuple[object | None, ...]]


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
    label = f"inference {inference_id}"
    records = context.refs.inference_records(inference_id)
    return Evaluated(label, records, records, (JudgeScope(label, (records.in_, records.out)),))


def subject_evaluated(context: CheckContext, experiment: LoadedExperiment) -> Evaluated:
    subject = experiment.source.spec.subject
    label = subject_label(subject)
    targets = experiment_targets(context, experiment)
    if not targets:
        return Evaluated(label, UNKNOWN_RECORDS, owner=experiment.experiment_id)
    target = targets[0]
    ranged = subject.from_ is not None and subject.to is not None
    records = SUBJECT_RECORDS[ranged](target, subject)
    return Evaluated(
        label=label,
        records=records,
        hints=EvaluatedRecords(records.in_, JSON_RECORD if ranged else records.out),
        scopes=tuple(judge_scope(item, subject) for item in targets),
        sides=SUBJECT_SIDES[ranged](target, subject),
        typing=SUBJECT_TYPING[ranged](target, subject),
        owner=experiment.experiment_id,
    )


def experiment_view(context: CheckContext, experiment: LoadedExperiment) -> CheckContext:
    arms = {
        FlowId(arm_id): arm for arm_id, arm in experiment.arms.items() if FlowId(arm_id) not in context.project.flows
    }
    if not arms:
        return context
    return arm_view(context, arms)


def subject_target(context: CheckContext, experiment: LoadedExperiment) -> Target | None:
    subject = experiment.source.spec.subject
    flow_id = FlowId(subject.arm) if subject.arm is not None else subject.flow
    spec = flow_spec(subject_flow(context, experiment))
    if flow_id is None or spec is None:
        return None
    return Target(experiment_view(context, experiment), flow_id, spec, subject_label(subject))


def experiment_targets(context: CheckContext, experiment: LoadedExperiment) -> tuple[Target, ...]:
    subject = subject_target(context, experiment)
    if subject is None:
        return ()
    arms = dict.fromkeys(variant.arm for variant in experiment.source.spec.variants if variant.arm is not None)
    others = (_arm_target(subject.view, experiment, arm) for arm in arms if FlowId(arm) != subject.flow_id)
    return (subject, *(item for item in others if item is not None))


def _arm_target(view: CheckContext, experiment: LoadedExperiment, arm: ArmId) -> Target | None:
    spec = flow_spec(experiment.arms.get(arm))
    return None if spec is None else Target(view, FlowId(arm), spec, f"arm {arm}")


def judge_scope(target: Target, subject: ExperimentSubject) -> JudgeScope:
    ranged = subject.from_ is not None and subject.to is not None
    return JudgeScope(target.label, SCOPE_DOCUMENTS[ranged](target, subject), frozenset({EXPECTED_OUTPUT}))


def node_outputs(target: Target, nodes: Iterable[NodeId]) -> tuple[object | None, ...]:
    entries = (target.view.graph.top(target.flow_id, node) for node in nodes)
    return tuple(target.view.refs.node_output(entry) for entry in entries if entry is not None)


def _flow_documents(target: Target, subject: ExperimentSubject) -> tuple[object | None, ...]:
    refs = target.view.refs
    before_last = target.spec.order[:-1]
    return (
        refs.type_annotation(target.spec.input),
        *node_outputs(target, before_last),
        refs.type_annotation(target.spec.output),
    )


def _range_documents(target: Target, subject: ExperimentSubject) -> tuple[object | None, ...]:
    order = target.spec.order
    first = target.view.refs.type_annotation(target.spec.input)
    if subject.to is None or subject.to not in order:
        return (first,)
    return (first, *node_outputs(target, order[: order.index(subject.to) + 1]))


def _flow_records(target: Target, subject: ExperimentSubject) -> EvaluatedRecords:
    refs = target.view.refs
    return EvaluatedRecords(refs.type_annotation(target.spec.input), refs.type_annotation(target.spec.output))


def _range_records(target: Target, subject: ExperimentSubject) -> EvaluatedRecords:
    last = node_outputs(target, () if subject.to is None else (subject.to,))
    return EvaluatedRecords(target.view.refs.type_annotation(target.spec.input), last[0] if last else None)


def _flow_sides(target: Target, subject: ExperimentSubject) -> Mapping[Side, str]:
    return {
        "in": f"$in, the input {target.spec.input} of {target.label}",
        "out": f"$out, the output {target.spec.output} of {target.label}",
    }


def _range_sides(target: Target, subject: ExperimentSubject) -> Mapping[Side, str]:
    return {
        "in": f"$in, the input {target.spec.input} of {target.label}",
        "out": f"$out, the out of node {subject.to} of {target.label}",
    }


def _flow_typing(target: Target, subject: ExperimentSubject) -> str:
    spec = target.spec
    return f"type value as {spec.output} and context as EvalContext[{spec.input}, {spec.output}]"


def _range_typing(target: Target, subject: ExperimentSubject) -> str:
    return (
        f"type value as BaseModel and read it with json_of: a range passes $out as the JSON record of node "
        f"{subject.to}; context.inputs is {target.spec.input} and the outputs of the nodes before the range "
        f"are in context.metadata['node_outputs']"
    )


SCOPE_DOCUMENTS: Final[Mapping[bool, ScopeDocuments]] = {False: _flow_documents, True: _range_documents}
SUBJECT_RECORDS: Final[Mapping[bool, Callable[[Target, ExperimentSubject], EvaluatedRecords]]] = {
    False: _flow_records,
    True: _range_records,
}
SUBJECT_SIDES: Final[Mapping[bool, Callable[[Target, ExperimentSubject], Mapping[Side, str]]]] = {
    False: _flow_sides,
    True: _range_sides,
}
SUBJECT_TYPING: Final[Mapping[bool, Callable[[Target, ExperimentSubject], str]]] = {
    False: _flow_typing,
    True: _range_typing,
}
