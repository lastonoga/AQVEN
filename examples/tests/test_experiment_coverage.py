from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final

import pytest

from aqven.loader import LoadedExperiment, LoadedProject, load_project
from aqven.policies import BUILTINS, Slot
from aqven.policies.evaluators import EXPECTED_CHECK
from aqven.spec import (
    CodeNodeSpec,
    CompareQuestion,
    DatasetFile,
    ExperimentCheck,
    ExperimentSpec,
    Guardrail,
    LookQuestion,
    MetricDirection,
    MetricKind,
    NoninferiorQuestion,
    SeriesMetric,
    ThresholdQuestion,
    VariantSpec,
)
from aqven.spec.experiments import MAX_REPEATS

type Setup = tuple[str | None, tuple[tuple[str, str], ...]]

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
    def arm_steps(self) -> frozenset[int]:
        return frozenset(len(arm.source.spec.order) for arm in self.loaded.arms.values() if arm.source is not None)

    @property
    def validators(self) -> frozenset[str]:
        experiments = self.project.experiments.values()
        return frozenset(
            check.validated_by
            for experiment in experiments
            for check in experiment.source.spec.checks or ()
            if check.validated_by is not None
        )

    def setup(self, variant: VariantSpec) -> Setup:
        return variant.arm or self.spec.subject.arm, tuple(sorted((variant.agents or {}).items()))


type Feature = Callable[[Experiment], bool]


def _code_step_in_arm(experiment: Experiment) -> bool:
    nodes = (node for arm in experiment.loaded.arms.values() for node in arm.nodes.values())
    return any(isinstance(node.spec, CodeNodeSpec) for node in nodes)


def _identical_pair(experiment: Experiment) -> bool:
    pair = experiment.pair
    return pair is not None and pair[0] == pair[1]


def _agents_differ(experiment: Experiment) -> bool:
    pair = experiment.pair
    return pair is not None and pair[0][0] == pair[1][0] and pair[0][1] != pair[1][1]


def _arms_differ(experiment: Experiment) -> bool:
    pair = experiment.pair
    return pair is not None and pair[0][0] != pair[1][0]


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
    on_flow = experiment.spec.subject.flow is not None and experiment.spec.failure_mode is not None
    return on_flow and _threshold_on_check(experiment)


def _judge_validation(experiment: Experiment) -> bool:
    planted = any(PLANTED_TAG in (case.tags or {}) for case in experiment.dataset.cases)
    return planted and experiment.loaded.experiment_id in experiment.validators


FEATURES: Final[Mapping[str, Feature]] = {
    "subject: whole project flow": lambda e: e.spec.subject.flow is not None and e.spec.subject.from_ is None,
    "subject: range of a project flow": lambda e: e.spec.subject.flow is not None and e.spec.subject.from_ is not None,
    "subject: whole arm": lambda e: e.spec.subject.arm is not None and e.spec.subject.from_ is None,
    "subject: range of an arm": lambda e: e.spec.subject.arm is not None and e.spec.subject.from_ is not None,
    "cases: dataset with flow": lambda e: e.dataset.flow is not None,
    "cases: dataset without flow": lambda e: e.dataset.flow is None,
    "cases: arm subject on a flow dataset": lambda e: e.spec.subject.arm is not None and e.dataset.flow is not None,
    "cases: no tag filter": lambda e: not e.tags,
    "cases: filter by one tag": lambda e: len(e.tags) == 1,
    "cases: filter by several tags": lambda e: len(e.tags) >= 2,
    "variants: as written": lambda e: any(v.arm is None and not v.agents for v in e.variants),
    "variants: agent on one node": lambda e: any(len(v.agents or {}) == 1 for v in e.variants),
    "variants: agents on several nodes": lambda e: any(len(v.agents or {}) >= 2 for v in e.variants),
    "variants: another arm": lambda e: any(v.arm is not None and v.arm != e.spec.subject.arm for v in e.variants),
    "variants: arm plus agents": lambda e: any(v.arm is not None and v.agents for v in e.variants),
    "variants: exactly one": lambda e: len(e.variants) == 1,
    "variants: three or more": lambda e: len(e.variants) >= 3,
    "variants: two identical for A/A": _identical_pair,
    "arms: YAML flow": lambda e: any(arm.source is not None for arm in e.loaded.arms.values()),
    "arms: Python flow builder": lambda e: any(arm.builder_path is not None for arm in e.loaded.arms.values()),
    "arms: code step": _code_step_in_arm,
    "arms: one step": lambda e: 1 in e.arm_steps,
    "arms: two steps": lambda e: 2 in e.arm_steps,
    "arms: three steps": lambda e: 3 in e.arm_steps,
    "arms: five steps": lambda e: 5 in e.arm_steps,
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
    "purpose: choose an agent": _agents_differ,
    "purpose: choose an arm": _arms_differ,
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


@pytest.mark.parametrize("metric", tuple(metric.value for metric in SeriesMetric))
def test_series_metric_is_asked(experiments: tuple[Experiment, ...], metric: str) -> None:
    asked = any(metric in experiment.metrics for experiment in experiments)
    assert asked, f"no lumen experiment asks about series metric {metric}"


@pytest.mark.parametrize("evaluator", sorted(BUILTINS[Slot.EVALUATOR]))
def test_builtin_evaluator_is_used(experiments: tuple[Experiment, ...], evaluator: str) -> None:
    used = any(evaluator in experiment.uses for experiment in experiments)
    assert used, f"no lumen experiment checks with built-in evaluator {evaluator}"
