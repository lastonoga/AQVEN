from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from typing import Final, assert_never

from pydantic import ValidationError

from aqven.check.context import CheckContext
from aqven.check.datasets import PARTIAL, STRICT, case_inputs, input_model, repeated, selected_cases
from aqven.check.experiment_site import ExperimentRule, ExperimentSite
from aqven.check.factors import FACTOR_RULES
from aqven.check.registry import known
from aqven.check.subjects import flow_spec
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic, templated_diagnostic
from aqven.factors import is_local_subject
from aqven.loader import SourceSpec, YamlPath
from aqven.policies.evaluators import EXPECTED_CHECK, ExpectedParams, expectation_gap
from aqven.spec import (
    CompareQuestion,
    DatasetFile,
    ExperimentCheck,
    ExperimentSpec,
    LookQuestion,
    NoninferiorQuestion,
    SeriesMetric,
    ThresholdQuestion,
    VariantId,
)

SERIES_METRICS: Final = tuple(metric.value for metric in SeriesMetric)
NONE: Final = "none"
RANGE_KEYS: Final = ("from", "to")
EXPECTED_OUTPUT_KEY: Final = "expected_output"


@dataclass(frozen=True, slots=True)
class Expectation:
    check_id: str
    fields: tuple[str, ...] | None

    @property
    def wanted(self) -> str:
        if self.fields is None:
            return EXPECTED_OUTPUT_KEY
        return f"{EXPECTED_OUTPUT_KEY} with the fields {', '.join(self.fields)}"


def check_experiments(context: CheckContext) -> Iterable[Diagnostic]:
    sites = (ExperimentSite(context, loaded) for loaded in context.project.experiments.values())
    return tuple(item for site in sites for rule in EXPERIMENT_RULES for item in rule(site))


def _subject(site: ExperimentSite) -> Iterator[Diagnostic]:
    flow = site.spec.subject.flow
    if site.subject is not None or known(site.context, site.context.project.flows, flow):
        return
    message = f"flow {flow} is neither a flow of {site.loaded.folder}/flows nor a flow of the project"
    yield diagnostic(DiagnosticCode.E_FLOW_UNKNOWN, site.file, ("subject", "flow"), message)


def _range(site: ExperimentSite) -> Iterator[Diagnostic]:
    subject = site.spec.subject
    spec = flow_spec(site.subject)
    if spec is None or subject.from_ is None or subject.to is None:
        return
    order = spec.order
    ends = tuple(zip(RANGE_KEYS, (subject.from_, subject.to), strict=True))
    outside = tuple((key, node) for key, node in ends if node not in order)
    for key, node in outside:
        problem = f"range node {node} is not a top-level node of {site.label}"
        fix = f"set {key} to a node of the order ({', '.join(order)}); a nested node runs inside its container"
        yield site.problem(DiagnosticCode.E_RANGE_INVALID, ("subject", key), problem, fix)
    if outside or order.index(subject.from_) <= order.index(subject.to):
        return
    problem = f"range from {subject.from_} comes after to {subject.to} in the order of {site.label}"
    yield site.problem(DiagnosticCode.E_RANGE_INVALID, ("subject", "from"), problem, "swap from and to")


def _cases(site: ExperimentSite) -> Iterator[Diagnostic]:
    selection = site.spec.cases
    source = site.context.project.datasets.get(selection.dataset)
    if source is None:
        yield from _dataset_unknown(site)
        return
    mismatch = (*_dataset_flow(site, source), *_dataset_input(site, source))
    yield from mismatch
    selected = selected_cases(source.spec, selection.tags)
    yield from _selection(site, len(selected))
    if mismatch:
        return
    yield from _selected_inputs(site, source, selected)
    yield from _expected_outputs(site, source, selected)


def _dataset_unknown(site: ExperimentSite) -> Iterator[Diagnostic]:
    dataset = site.spec.cases.dataset
    if known(site.context, site.context.project.datasets, dataset):
        return
    message = f"dataset {dataset} does not exist in the project"
    yield diagnostic(DiagnosticCode.E_DATASET_UNKNOWN, site.file, ("cases", "dataset"), message)


def _dataset_flow(site: ExperimentSite, source: SourceSpec[DatasetFile]) -> Iterator[Diagnostic]:
    subject = site.spec.subject.flow
    owner = source.spec.flow
    if owner == subject or is_local_subject(site.loaded):
        return
    holder = f"flow {owner}" if owner is not None else "no flow"
    problem = f"dataset {site.spec.cases.dataset} belongs to {holder}, but the subject is flow {subject}"
    fix = f"pick a dataset with flow: {subject}; only a local flow of the experiment runs a dataset without flow"
    yield site.problem(DiagnosticCode.E_DATASET_MISMATCH, ("cases", "dataset"), problem, fix)


def _dataset_input(site: ExperimentSite, source: SourceSpec[DatasetFile]) -> Iterator[Diagnostic]:
    owner = source.spec.flow
    subject = flow_spec(site.subject)
    other = flow_spec(site.context.project.flows.get(owner)) if owner is not None else None
    if not is_local_subject(site.loaded) or subject is None or other is None or other.input == subject.input:
        return
    problem = (
        f"dataset {site.spec.cases.dataset} holds inputs {other.input} of flow {owner}, "
        f"but local flow {site.spec.subject.flow} takes {subject.input}"
    )
    fix = "pick a dataset without flow or a flow dataset whose input type is the input type of the local flow"
    yield site.problem(DiagnosticCode.E_DATASET_MISMATCH, ("cases", "dataset"), problem, fix)


def _selection(site: ExperimentSite, selected: int) -> Iterator[Diagnostic]:
    selection = site.spec.cases
    tags = ", ".join(f"{name}={value}" for name, value in (selection.tags or {}).items())
    if not selected:
        values = site.values(tags=tags, dataset=selection.dataset)
        yield templated_diagnostic(DiagnosticCode.E_CASES_EMPTY, site.file, ("cases", "tags"), values)
        return
    planned = site.spec.plan.cases
    if planned is None or planned <= selected:
        return
    values = site.values(planned=str(planned), selected=str(selected), dataset=selection.dataset)
    yield templated_diagnostic(DiagnosticCode.W_PLAN_EXCEEDS_CASES, site.file, ("plan", "cases"), values)


def _selected_inputs(
    site: ExperimentSite, source: SourceSpec[DatasetFile], selected: tuple[int, ...]
) -> Iterator[Diagnostic]:
    spec = flow_spec(site.subject)
    if spec is None:
        return
    tolerated = PARTIAL if site.spec.subject.from_ is not None else STRICT
    yield from case_inputs(source, input_model(site.context, spec.input, tolerated), selected)


def _expected_outputs(
    site: ExperimentSite, source: SourceSpec[DatasetFile], selected: tuple[int, ...]
) -> Iterator[Diagnostic]:
    cases = source.spec.cases
    gaps = (
        (expectation, index, gap)
        for expectation in _expectations(site.spec)
        for index in selected
        if (gap := expectation_gap(cases[index].expected_output, expectation.fields)) is not None
    )
    for expectation, index, gap in gaps:
        values = site.values(
            check=expectation.check_id,
            case=cases[index].name,
            problem=gap,
            wanted=expectation.wanted,
            dataset=site.spec.cases.dataset,
        )
        path: YamlPath = ("cases", index, EXPECTED_OUTPUT_KEY)
        yield templated_diagnostic(DiagnosticCode.E_EXPECTED_MISSING, source.path, path, values)


def _expectations(spec: ExperimentSpec) -> Iterator[Expectation]:
    for check in spec.checks or ():
        params = _expected_params(check)
        if params is None:
            continue
        yield Expectation(check.id, tuple(params.fields) if params.fields is not None else None)


def _expected_params(check: ExperimentCheck) -> ExpectedParams | None:
    if check.use != EXPECTED_CHECK:
        return None
    try:
        return ExpectedParams.model_validate(check.with_ or {})
    except ValidationError:
        return None


def _variants(site: ExperimentSite) -> Iterator[Diagnostic]:
    for index, _ in repeated(site.variant_ids):
        message = f"variant id {site.variant_ids[index]} is already declared in this experiment"
        yield diagnostic(DiagnosticCode.E_ID_DUPLICATE, site.file, ("variants", index, "id"), message)


def _checks(site: ExperimentSite) -> Iterator[Diagnostic]:
    ids = site.check_ids
    for index, _ in repeated(ids):
        message = f"check id {ids[index]} is already declared in this experiment"
        yield diagnostic(DiagnosticCode.E_ID_DUPLICATE, site.file, ("checks", index, "id"), message)
    for index, check_id in enumerate(ids):
        if check_id not in SERIES_METRICS:
            continue
        message = f"check id {check_id} is the name of a series metric, and a question could not tell them apart"
        yield diagnostic(DiagnosticCode.E_ID_DUPLICATE, site.file, ("checks", index, "id"), message)
    for index, check in enumerate(site.spec.checks or ()):
        target = check.validated_by
        if target is None or known(site.context, site.context.project.experiments, target):
            continue
        values = {"check": check.id, "target": target}
        path: YamlPath = ("checks", index, "validated_by")
        yield templated_diagnostic(DiagnosticCode.E_EXPERIMENT_UNKNOWN, site.file, path, values)


def _question(site: ExperimentSite) -> Iterator[Diagnostic]:
    question = site.spec.question
    match question:
        case LookQuestion():
            return iter(())
        case ThresholdQuestion():
            return _threshold(site, question)
        case CompareQuestion() | NoninferiorQuestion():
            return _comparison(site, question)
        case _:
            assert_never(question)


def _threshold(site: ExperimentSite, question: ThresholdQuestion) -> Iterator[Diagnostic]:
    yield from _metric(site, ("question", "metric"), question.metric)
    if question.variant is not None:
        yield from _declared(site, ("question", "variant"), question.variant)


def _comparison(site: ExperimentSite, question: CompareQuestion | NoninferiorQuestion) -> Iterator[Diagnostic]:
    yield from _metric(site, ("question", "primary"), question.primary)
    for index, guardrail in enumerate(question.guardrails or ()):
        yield from _metric(site, ("question", "guardrails", index, "metric"), guardrail.metric)
    yield from _declared(site, ("question", "baseline"), question.baseline)
    yield from _declared(site, ("question", "candidate"), question.candidate)
    count = len(site.spec.variants)
    if count >= 2:
        return
    problem = f"question {question.kind} compares two variants, but the experiment declares {count}"
    fix = "declare the baseline and the candidate under variants"
    yield site.problem(DiagnosticCode.E_VARIANT_INVALID, ("variants",), problem, fix)


def _metric(site: ExperimentSite, path: YamlPath, metric: str) -> Iterator[Diagnostic]:
    if metric in site.check_ids or metric in SERIES_METRICS:
        return
    checks = ", ".join(site.check_ids) or NONE
    values = site.values(metric=metric, checks=checks, metrics=", ".join(SERIES_METRICS))
    yield templated_diagnostic(DiagnosticCode.E_METRIC_UNKNOWN, site.file, path, values)


def _declared(site: ExperimentSite, path: YamlPath, variant: VariantId) -> Iterator[Diagnostic]:
    if variant in site.variant_ids:
        return
    problem = f"question names variant {variant}, which is not declared under variants"
    fix = f"declare it or name one of: {', '.join(site.variant_ids)}"
    yield site.problem(DiagnosticCode.E_VARIANT_INVALID, path, problem, fix)


EXPERIMENT_RULES: Final[tuple[ExperimentRule, ...]] = (
    _subject,
    _range,
    _cases,
    _variants,
    _checks,
    _question,
    *FACTOR_RULES,
)
