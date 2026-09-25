from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final

import pytest

from aqven.factors import is_local_subject, local_nodes, subject_flow
from aqven.loader import LoadedExperiment, LoadedFlow, LoadedProject, load_project, local_node_id
from aqven.policies import BUILTINS, Slot
from aqven.policies.evaluators import EXPECTED_CHECK
from aqven.spec import (
    CallNodeSpec,
    CodeNodeSpec,
    CompareQuestion,
    DatasetFile,
    ExperimentCheck,
    ExperimentFactor,
    ExperimentSpec,
    FactorKind,
    Guardrail,
    LlmNodeSpec,
    LookQuestion,
    MetricDirection,
    MetricKind,
    NodeId,
    NodeSpec,
    NoninferiorQuestion,
    SeriesMetric,
    ThresholdQuestion,
    VariantSpec,
)
from aqven.spec.experiments import MAX_REPEATS

type Setup = tuple[tuple[str, str], ...]
type WrittenValue = Callable[[NodeSpec], str | None]

PLAN_KEY: Final = "plan"
FIELDS_KEY: Final = "fields"
REGRESSION_TAG: Final = "regression"
PLANTED_TAG: Final = "planted"
YES: Final = "yes"
EXPLORATION_CHECKS: Final = 3
STABILITY_REPEATS: Final = 3
BUDGET_METRICS: Final = frozenset(
    {SeriesMetric.COST_USD, SeriesMetric.COST_OF_PASS, SeriesMetric.LATENCY_P50_MS, SeriesMetric.LATENCY_P95_MS}
)


def _written_agent(spec: NodeSpec) -> str | None:
    return spec.agent if isinstance(spec, LlmNodeSpec) else None


def _written_flow(spec: NodeSpec) -> str | None:
    return spec.flow if isinstance(spec, CallNodeSpec) else None


def _no_written_value(spec: NodeSpec) -> str | None:
    return None


WRITTEN_VALUES: Final[Mapping[FactorKind, WrittenValue]] = {
    FactorKind.AGENT: _written_agent,
    FactorKind.PROMPT: _no_written_value,
    FactorKind.USE: _no_written_value,
    FactorKind.FLOW: _written_flow,
}


@dataclass(frozen=True, slots=True)
class Experiment:
    project: LoadedProject
    loaded: LoadedExperiment

    @property
    def spec(self) -> ExperimentSpec:
        return self.loaded.source.spec

    @property
    def dataset(self) -> DatasetFile:
        return self.project.datasets[self.spec.cases.dataset].spec

    @property
    def tags(self) -> Mapping[str, str]:
        return self.spec.cases.tags or {}

    @property
    def variants(self) -> tuple[VariantSpec, ...]:
        return tuple(self.spec.variants)

    @property
    def checks(self) -> tuple[ExperimentCheck, ...]:
        return tuple(self.spec.checks or ())

    @property
    def check_ids(self) -> frozenset[str]:
        return frozenset(check.id for check in self.checks)

    @property
    def uses(self) -> frozenset[str]:
        return frozenset(check.use for check in self.checks if check.use is not None)

    @property
    def expected_checks(self) -> tuple[ExperimentCheck, ...]:
        return tuple(check for check in self.checks if check.use == EXPECTED_CHECK)

    @property
    def threshold(self) -> ThresholdQuestion | None:
        question = self.spec.question
        return question if isinstance(question, ThresholdQuestion) else None

    @property
    def compare(self) -> CompareQuestion | None:
        question = self.spec.question
        return question if isinstance(question, CompareQuestion) else None

    @property
    def comparison(self) -> CompareQuestion | NoninferiorQuestion | None:
        question = self.spec.question
        return question if isinstance(question, CompareQuestion | NoninferiorQuestion) else None

    @property
    def guardrails(self) -> tuple[Guardrail, ...]:
        comparison = self.comparison
        return tuple(comparison.guardrails or ()) if comparison is not None else ()

    @property
    def metrics(self) -> frozenset[str]:
        threshold = self.threshold
        comparison = self.comparison
        asked = (threshold.metric,) if threshold is not None else ()
        compared = (comparison.primary,) if comparison is not None else ()
        return frozenset((*asked, *compared, *(guardrail.metric for guardrail in self.guardrails)))

    @property
    def factor(self) -> ExperimentFactor | None:
        return self.spec.varies

    @property
    def what(self) -> FactorKind | None:
        factor = self.factor
        return factor.what if factor is not None else None

    @property
    def factor_nodes(self) -> tuple[NodeId, ...]:
        factor = self.factor
        return tuple(factor.nodes) if factor is not None else ()

    @property
    def local(self) -> bool:
        return is_local_subject(self.loaded)

    @property
    def ranged(self) -> bool:
        return self.spec.subject.from_ is not None

    @property
    def subject(self) -> LoadedFlow | None:
        return subject_flow(self.project, self.loaded)

    @property
    def subject_nodes(self) -> Mapping[NodeId, NodeSpec]:
        subject = self.subject
        return local_nodes(subject) if subject is not None else {}

    @property
    def nested_nodes(self) -> frozenset[NodeId]:
        subject = self.subject
        expanded: tuple[NodeId, ...] = tuple(subject.nodes) if subject is not None else ()
        return frozenset(local_node_id(node) for node in expanded if local_node_id(node) != node)

    @property
    def slot_flows(self) -> frozenset[str]:
        if self.what is not FactorKind.FLOW:
            return frozenset()
        written = (_written_flow(self.subject_nodes[node]) for node in self.factor_nodes if node in self.subject_nodes)
        return frozenset(flow for flow in written if flow is not None)

    @property
    def values(self) -> frozenset[str]:
        return frozenset(value for variant in self.variants for value in (variant.nodes or {}).values())

    @property
    def pair(self) -> tuple[Setup, Setup] | None:
        comparison = self.comparison
        if comparison is None:
            return None
        variants = {variant.id: variant for variant in self.variants}
        return self.setup(variants[comparison.baseline]), self.setup(variants[comparison.candidate])

    @property
    def plan_written(self) -> bool:
        return PLAN_KEY in self.spec.model_fields_set

    @property
    def local_steps(self) -> frozenset[int]:
        flows = self.loaded.flows.values()
        return frozenset(len(flow.source.spec.order) for flow in flows if flow.source is not None)

    @property
    def validators(self) -> frozenset[str]:
        experiments = self.project.experiments.values()
        return frozenset(
            check.validated_by
            for experiment in experiments
            for check in experiment.source.spec.checks or ()
            if check.validated_by is not None
        )

    def as_written(self, node: str, value: str) -> bool:
        what = self.what
        spec = self.subject_nodes.get(NodeId(node))
        return what is not None and spec is not None and WRITTEN_VALUES[what](spec) == value

    def setup(self, variant: VariantSpec) -> Setup:
        values = (variant.nodes or {}).items()
        return tuple(sorted((node, value) for node, value in values if not self.as_written(node, value)))

    def demonstrates(self, kind: FactorKind) -> bool:
        return self.what is kind and bool(self.values) and self.loaded.notes is not None


type Feature = Callable[[Experiment], bool]


def _code_step_in_local_flow(experiment: Experiment) -> bool:
    nodes = (node for flow in experiment.loaded.flows.values() for node in flow.nodes.values())
    return any(isinstance(node.spec, CodeNodeSpec) for node in nodes)


def _code_alternative(experiment: Experiment) -> bool:
    return any(isinstance(node.spec, CodeNodeSpec) for node in experiment.loaded.alternatives.values())


def _identical_pair(experiment: Experiment) -> bool:
    pair = experiment.pair
    return pair is not None and pair[0] == pair[1]


def _factor_differs(experiment: Experiment, what: FactorKind) -> bool:
    pair = experiment.pair
    return experiment.what is what and pair is not None and pair[0] != pair[1]


def _factor_node_left_as_written(experiment: Experiment) -> bool:
    declared = frozenset(experiment.factor_nodes)
    set_nodes = (frozenset(variant.nodes or {}) for variant in experiment.variants)
    return any(nodes and nodes < declared for nodes in set_nodes)


def _local_flow_value(experiment: Experiment) -> bool:
    return experiment.what is FactorKind.FLOW and any(value in experiment.loaded.flows for value in experiment.values)


def _threshold_on_check(experiment: Experiment) -> bool:
    threshold = experiment.threshold
    return threshold is not None and threshold.metric in experiment.check_ids


def _threshold_margin(experiment: Experiment, positive: bool) -> bool:
    threshold = experiment.threshold
    return threshold is not None and (threshold.margin > 0) == positive


def _compare_direction(experiment: Experiment, direction: MetricDirection | None) -> bool:
    compare = experiment.compare
    return compare is not None and compare.direction == direction


def _compare_margin(experiment: Experiment, positive: bool) -> bool:
    compare = experiment.compare
    return compare is not None and (compare.margin > 0) == positive


def _budget(experiment: Experiment) -> bool:
    threshold = experiment.threshold
    return threshold is not None and threshold.below is not None and threshold.metric in BUDGET_METRICS


def _exploration(experiment: Experiment) -> bool:
    explores = isinstance(experiment.spec.question, LookQuestion) and experiment.spec.failure_mode is None
    return explores and len(experiment.checks) >= EXPLORATION_CHECKS


def _quick_try(experiment: Experiment) -> bool:
    looks = isinstance(experiment.spec.question, LookQuestion) and len(experiment.variants) == 1
    return looks and not experiment.plan_written


def _risk_threshold(experiment: Experiment) -> bool:
    on_flow = not experiment.local and experiment.spec.failure_mode is not None
    return on_flow and _threshold_on_check(experiment)


def _judge_validation(experiment: Experiment) -> bool:
    planted = any(PLANTED_TAG in (case.tags or {}) for case in experiment.dataset.cases)
    return planted and experiment.loaded.experiment_id in experiment.validators


FEATURES: Final[Mapping[str, Feature]] = {
    "subject: whole project flow": lambda e: not e.local and not e.ranged,
    "subject: range of a project flow": lambda e: not e.local and e.ranged,
    "subject: whole local flow": lambda e: e.local and not e.ranged,
    "subject: range of a local flow": lambda e: e.local and e.ranged,
    "cases: dataset with flow": lambda e: e.dataset.flow is not None,
    "cases: dataset without flow": lambda e: e.dataset.flow is None,
    "cases: local flow subject on a flow dataset": lambda e: e.local and e.dataset.flow is not None,
    "cases: no tag filter": lambda e: not e.tags,
    "cases: filter by one tag": lambda e: len(e.tags) == 1,
    "cases: filter by several tags": lambda e: len(e.tags) >= 2,
    "factor: none with one variant": lambda e: e.factor is None and len(e.variants) == 1,
    "factor: one node": lambda e: len(e.factor_nodes) == 1,
    "factor: several nodes": lambda e: len(e.factor_nodes) >= 2,
    "factor: nested node named by its own id": lambda e: any(node in e.nested_nodes for node in e.factor_nodes),
    "factor: node inside a range": lambda e: e.factor is not None and e.ranged,
    "factor: node of a local flow": lambda e: e.factor is not None and e.local,
    "factor: a variant leaves a factor node as written": _factor_node_left_as_written,
    "variants: all as written, an A/A pair": lambda e: len(e.variants) > 1 and all(not v.nodes for v in e.variants),
    "prompt: several prompt files": lambda e: len(e.loaded.prompts) >= 2,
    "use: code alternative": _code_alternative,
    "use: several alternatives": lambda e: len(e.loaded.alternatives) >= 2,
    "flow: slot calls a project flow as written": lambda e: any(flow in e.project.flows for flow in e.slot_flows),
    "flow: slot calls a local flow as written": lambda e: any(flow in e.loaded.flows for flow in e.slot_flows),
    "flow: value is a local flow": _local_flow_value,
    "variants: as written": lambda e: any(not v.nodes for v in e.variants),
    "variants: value on one node": lambda e: any(len(v.nodes or {}) == 1 for v in e.variants),
    "variants: values on several nodes": lambda e: any(len(v.nodes or {}) >= 2 for v in e.variants),
    "variants: exactly one": lambda e: len(e.variants) == 1,
    "variants: three or more": lambda e: len(e.variants) >= 3,
    "variants: two identical for A/A": _identical_pair,
    "local flows: YAML flow": lambda e: any(flow.source is not None for flow in e.loaded.flows.values()),
    "local flows: Python flow builder": lambda e: any(
        flow.builder_path is not None for flow in e.loaded.flows.values()
    ),
    "local flows: code step": _code_step_in_local_flow,
    "local flows: one step": lambda e: 1 in e.local_steps,
    "local flows: two steps": lambda e: 2 in e.local_steps,
    "local flows: three steps": lambda e: 3 in e.local_steps,
    "local flows: five steps": lambda e: 5 in e.local_steps,
    "checks: none, series metrics only": lambda e: not e.checks,
    "checks: expected with fields": lambda e: any(FIELDS_KEY in (c.with_ or {}) for c in e.expected_checks),
    "checks: expected without fields": lambda e: any(FIELDS_KEY not in (c.with_ or {}) for c in e.expected_checks),
    "checks: code": lambda e: any(c.run is not None for c in e.checks),
    "checks: judge": lambda e: any(c.inference is not None for c in e.checks),
    "checks: judge with validated_by": lambda e: any(c.validated_by is not None for c in e.checks),
    "checks: binary kind": lambda e: any(c.kind is MetricKind.BINARY for c in e.checks),
    "checks: ordinal kind": lambda e: any(c.kind is MetricKind.ORDINAL for c in e.checks),
    "checks: continuous kind": lambda e: any(c.kind is MetricKind.CONTINUOUS for c in e.checks),
    "question: look": lambda e: isinstance(e.spec.question, LookQuestion),
    "question: threshold below": lambda e: e.threshold is not None and e.threshold.below is not None,
    "question: threshold above": lambda e: e.threshold is not None and e.threshold.above is not None,
    "question: threshold for one variant": lambda e: e.threshold is not None and e.threshold.variant is not None,
    "question: threshold per variant": lambda e: (
        e.threshold is not None and e.threshold.variant is None and len(e.variants) >= 2
    ),
    "question: threshold margin 0": lambda e: _threshold_margin(e, positive=False),
    "question: threshold margin above 0": lambda e: _threshold_margin(e, positive=True),
    "question: threshold on a check": _threshold_on_check,
    "question: compare default direction": lambda e: _compare_direction(e, None),
    "question: compare higher_is_better": lambda e: _compare_direction(e, MetricDirection.HIGHER_IS_BETTER),
    "question: compare lower_is_better": lambda e: _compare_direction(e, MetricDirection.LOWER_IS_BETTER),
    "question: compare margin 0": lambda e: _compare_margin(e, positive=False),
    "question: compare margin above 0": lambda e: _compare_margin(e, positive=True),
    "question: noninferior": lambda e: isinstance(e.spec.question, NoninferiorQuestion),
    "guardrails: none": lambda e: e.comparison is not None and not e.guardrails,
    "guardrails: one relative": lambda e: len(e.guardrails) == 1 and e.guardrails[0].relative,
    "guardrails: one absolute": lambda e: len(e.guardrails) == 1 and not e.guardrails[0].relative,
    "guardrails: several": lambda e: len(e.guardrails) >= 2,
    "guardrails: explicit direction": lambda e: any(g.direction is not None for g in e.guardrails),
    "guardrails: default direction": lambda e: any(g.direction is None for g in e.guardrails),
    "plan: omitted": lambda e: not e.plan_written,
    "plan: with cases": lambda e: e.spec.plan.cases is not None,
    "plan: repeats without cases": lambda e: e.plan_written and e.spec.plan.cases is None,
    "plan: 1 repeat": lambda e: e.plan_written and e.spec.plan.repeats == 1,
    "plan: 3 repeats": lambda e: e.spec.plan.repeats == 3,
    "plan: 20 repeats": lambda e: e.spec.plan.repeats == MAX_REPEATS,
    "meta: failure_mode set": lambda e: e.spec.failure_mode is not None,
    "meta: failure_mode unset": lambda e: e.spec.failure_mode is None,
    "meta: experiment.md present": lambda e: e.loaded.notes is not None,
    "meta: experiment.md absent": lambda e: e.loaded.notes is None,
    "purpose: quick try": _quick_try,
    "purpose: exploration of failure modes": _exploration,
    "purpose: risk threshold": _risk_threshold,
    "purpose: cost or latency budget": _budget,
    "purpose: stability and A/A noise": lambda e: _identical_pair(e) and e.spec.plan.repeats >= STABILITY_REPEATS,
    "purpose: choose an agent": lambda e: _factor_differs(e, FactorKind.AGENT),
    "purpose: choose a prompt": lambda e: _factor_differs(e, FactorKind.PROMPT),
    "purpose: choose a node algorithm": lambda e: _factor_differs(e, FactorKind.USE),
    "purpose: choose a flow pattern": lambda e: _factor_differs(e, FactorKind.FLOW),
    "purpose: regression on regression cases": lambda e: e.tags.get(REGRESSION_TAG) == YES,
    "purpose: judge validation on planted defects": _judge_validation,
}


@pytest.fixture(scope="module")
def experiments(aqven_project_root: Path) -> tuple[Experiment, ...]:
    project = load_project(aqven_project_root).project
    assert project is not None
    return tuple(Experiment(project, loaded) for loaded in project.experiments.values())


@pytest.mark.parametrize("feature", FEATURES)
def test_feature_is_exercised(experiments: tuple[Experiment, ...], feature: str) -> None:
    exercised = FEATURES[feature]
    assert any(exercised(experiment) for experiment in experiments), f"no lumen experiment exercises {feature}"


@pytest.mark.parametrize("kind", tuple(FactorKind), ids=[kind.value for kind in FactorKind])
def test_factor_kind_is_demonstrated(experiments: tuple[Experiment, ...], kind: FactorKind) -> None:
    demonstrated = any(experiment.demonstrates(kind) for experiment in experiments)
    assert demonstrated, f"no lumen experiment with notes varies {kind.value} and sets it in a variant"


def test_variants_that_set_values_declare_one_factor(experiments: tuple[Experiment, ...]) -> None:
    undeclared = [e.loaded.experiment_id for e in experiments if any(v.nodes for v in e.variants) and e.factor is None]
    assert undeclared == [], f"experiments whose variants set values and no varies: {', '.join(undeclared)}"


@pytest.mark.parametrize("metric", tuple(metric.value for metric in SeriesMetric))
def test_series_metric_is_asked(experiments: tuple[Experiment, ...], metric: str) -> None:
    asked = any(metric in experiment.metrics for experiment in experiments)
    assert asked, f"no lumen experiment asks about series metric {metric}"


@pytest.mark.parametrize("evaluator", sorted(BUILTINS[Slot.EVALUATOR]))
def test_builtin_evaluator_is_used(experiments: tuple[Experiment, ...], evaluator: str) -> None:
    used = any(evaluator in experiment.uses for experiment in experiments)
    assert used, f"no lumen experiment checks with built-in evaluator {evaluator}"
