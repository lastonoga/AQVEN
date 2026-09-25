from collections.abc import Callable, Iterable, Iterator
from dataclasses import dataclass

from aqven.factors.alternatives import brought_alternatives
from aqven.factors.changes import variant_changes
from aqven.factors.model import FactorChange
from aqven.factors.subjects import called_flows, calls, is_local_subject
from aqven.loader import LoadedExperiment
from aqven.spec import FactorKind, FlowId, NodeId


@dataclass(frozen=True, slots=True)
class ExperimentUsage:
    alternatives: frozenset[NodeId]
    prompts: frozenset[str]
    flows: frozenset[FlowId]


def experiment_usage(experiment: LoadedExperiment) -> ExperimentUsage:
    changes = tuple(experiment_changes(experiment))
    alternatives = brought_alternatives(experiment, _values(changes, FactorKind.USE, NodeId))
    sources = (experiment.alternatives[node].spec for node in alternatives)
    roots = (*_subject(experiment), *_values(changes, FactorKind.FLOW, FlowId), *calls(sources))
    return ExperimentUsage(
        alternatives=frozenset(alternatives),
        prompts=frozenset(_values(changes, FactorKind.PROMPT, str)),
        flows=frozenset(called_flows(experiment.flows, roots)),
    )


def experiment_changes(experiment: LoadedExperiment) -> Iterator[FactorChange]:
    spec = experiment.source.spec
    return (change for variant in spec.variants for change in variant_changes(spec, variant))


def _values[T](changes: Iterable[FactorChange], what: FactorKind, typed: Callable[[str], T]) -> tuple[T, ...]:
    return tuple(typed(change.value) for change in changes if change.what is what)


def _subject(experiment: LoadedExperiment) -> tuple[FlowId, ...]:
    return (experiment.source.spec.subject.flow,) if is_local_subject(experiment) else ()
