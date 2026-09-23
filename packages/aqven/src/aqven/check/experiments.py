from collections.abc import Callable, Iterable, Iterator, Mapping
from dataclasses import dataclass
from typing import Final, assert_never

from pydantic import ValidationError

from aqven.check.context import CheckContext
from aqven.check.datasets import PARTIAL, STRICT, case_inputs, input_model, repeated, selected_cases
from aqven.check.registry import known, known_agent
from aqven.check.subjects import flow_spec, range_order, subject_flow, subject_label
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic, templated_diagnostic
from aqven.loader import NODE_ID_SEPARATOR, LoadedExperiment, LoadedFlow, SourceSpec, YamlPath, local_node_id
from aqven.policies.evaluators import EXPECTED_CHECK, ExpectedParams, expectation_gap
from aqven.spec import (
    AgentId,
    ArmId,
    CompareQuestion,
    DatasetFile,
    ExperimentCheck,
    ExperimentSpec,
    FlowSpec,
    LlmNodeSpec,
    LookQuestion,
    NodeId,
    NoninferiorQuestion,
    SeriesMetric,
    ThresholdQuestion,
    VariantId,
    VariantSpec,
)

SERIES_METRICS: Final = tuple(metric.value for metric in SeriesMetric)
NONE: Final = "none"
RANGE_KEYS: Final = ("from", "to")
TYPE_KEYS: Final = ("input", "output")
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


@dataclass(frozen=True, slots=True)
class ExperimentSite:
    context: CheckContext
    loaded: LoadedExperiment

    @property
    def spec(self) -> ExperimentSpec:
        return self.loaded.source.spec

    @property
    def file(self) -> str:
        return self.loaded.source.path

    @property
    def subject(self) -> LoadedFlow | None:
        return subject_flow(self.context, self.loaded)

    @property
    def label(self) -> str:
        return subject_label(self.spec.subject)

    @property
    def variant_ids(self) -> tuple[VariantId, ...]:
        return tuple(variant.id for variant in self.spec.variants)

    @property
    def check_ids(self) -> tuple[str, ...]:
        return tuple(check.id for check in self.spec.checks or ())

    def values(self, **values: str) -> Mapping[str, str]:
        return {"experiment": self.loaded.experiment_id, **values}

    def problem(self, code: DiagnosticCode, path: YamlPath, problem: str, fix: str) -> Diagnostic:
        return templated_diagnostic(code, self.file, path, self.values(problem=problem, fix=fix))


type ExperimentRule = Callable[[ExperimentSite], Iterator[Diagnostic]]


def check_experiments(context: CheckContext) -> Iterable[Diagnostic]:
    sites = (ExperimentSite(context, loaded) for loaded in context.project.experiments.values())
    return tuple(item for site in sites for rule in EXPERIMENT_RULES for item in rule(site))


def _subject(site: ExperimentSite) -> Iterator[Diagnostic]:
    subject = site.spec.subject
    if subject.arm is not None and subject.arm not in site.loaded.arms:
        yield _arm_unknown(site, ("subject", "arm"), subject.arm)
    if subject.flow is not None and not known(site.context, site.context.project.flows, subject.flow):
        message = f"flow {subject.flow} does not exist in the project"
        yield diagnostic(DiagnosticCode.E_FLOW_UNKNOWN, site.file, ("subject", "flow"), message)


def _arm_unknown(site: ExperimentSite, path: YamlPath, arm: ArmId) -> Diagnostic:
    arms = ", ".join(sorted(site.loaded.arms)) or NONE
    values = site.values(arm=arm, arms=arms, folder=site.loaded.folder)
    return templated_diagnostic(DiagnosticCode.E_ARM_UNKNOWN, site.file, path, values)


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


def _variant_ranges(site: ExperimentSite) -> Iterator[Diagnostic]:
    subject = site.spec.subject
    if subject.from_ is None or subject.to is None:
        return
    for index, variant in enumerate(site.spec.variants):
        yield from _variant_range(site, index, variant)


def _variant_range(site: ExperimentSite, index: int, variant: VariantSpec) -> Iterator[Diagnostic]:
    subject = site.spec.subject
    arm = site.loaded.arms.get(variant.arm) if variant.arm is not None else None
    spec = flow_spec(arm)
    if spec is None or subject.from_ is None or subject.to is None:
        return
    ends = tuple(dict.fromkeys((subject.from_, subject.to)))
    missing = tuple(node for node in ends if node not in spec.order)
    reversed_ends = not missing and spec.order.index(subject.from_) > spec.order.index(subject.to)
    if not missing and not reversed_ends:
        return
    ranged = f"the range {subject.from_} to {subject.to}"
    problem = (
        f"variant {variant.id} runs arm {variant.arm}, whose top-level nodes lack {', '.join(missing)} of {ranged}"
        if missing
        else f"variant {variant.id} runs arm {variant.arm}, where {ranged} is reversed"
    )
    fix = f"give arm {variant.arm} the top-level nodes {subject.from_} and {subject.to} in this order"
    yield site.problem(DiagnosticCode.E_RANGE_INVALID, ("variants", index, "arm"), problem, fix)


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
    if subject is None or owner == subject:
        return
    holder = f"flow {owner}" if owner is not None else "no flow"
    problem = f"dataset {site.spec.cases.dataset} belongs to {holder}, but the subject is flow {subject}"
    fix = f"pick a dataset with flow: {subject}; only an arm subject runs a dataset without flow"
    yield site.problem(DiagnosticCode.E_DATASET_MISMATCH, ("cases", "dataset"), problem, fix)


def _dataset_input(site: ExperimentSite, source: SourceSpec[DatasetFile]) -> Iterator[Diagnostic]:
    arm = site.spec.subject.arm
    owner = source.spec.flow
    subject = flow_spec(site.subject)
    other = flow_spec(site.context.project.flows.get(owner)) if owner is not None else None
    if arm is None or subject is None or other is None or other.input == subject.input:
        return
    problem = (
        f"dataset {site.spec.cases.dataset} holds inputs {other.input} of flow {owner}, "
        f"but arm {arm} takes {subject.input}"
    )
    fix = "pick a dataset without flow or a flow dataset whose input type is the arm input type"
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
    for index, variant in enumerate(site.spec.variants):
        yield from _variant(site, ("variants", index), variant)


def _variant(site: ExperimentSite, path: YamlPath, variant: VariantSpec) -> Iterator[Diagnostic]:
    if variant.arm is not None and variant.arm not in site.loaded.arms:
        yield _arm_unknown(site, (*path, "arm"), variant.arm)
    target = site.loaded.arms.get(variant.arm) if variant.arm is not None else site.subject
    for node_id, agent_id in (variant.agents or {}).items():
        yield from _assignment(site, (*path, "agents", node_id), variant, target, node_id, agent_id)


def _assignment(
    site: ExperimentSite,
    path: YamlPath,
    variant: VariantSpec,
    target: LoadedFlow | None,
    node_id: NodeId,
    agent_id: AgentId,
) -> Iterator[Diagnostic]:
    if not known_agent(site.context, agent_id):
        message = f"agent {agent_id} does not exist in the project"
        yield diagnostic(DiagnosticCode.E_AGENT_UNKNOWN, site.file, path, message)
    if target is None or local_node_id(node_id) in site.context.project.broken_ids:
        return
    label = f"arm {variant.arm}" if variant.arm is not None else site.label
    node = target.nodes.get(node_id)
    if node is None or not isinstance(node.spec, LlmNodeSpec):
        problem = f"variant {variant.id} assigns agent {agent_id} to {node_id}, which is not an llm node of {label}"
        fix = f"use an llm node id ({', '.join(_llm_nodes(target)) or NONE}); a nested node is <container>__<node>"
        yield site.problem(DiagnosticCode.E_VARIANT_INVALID, path, problem, fix)
        return
    ranged = range_order(site.spec.subject, flow_spec(site.subject))
    if variant.arm is not None or ranged is None or node_id.split(NODE_ID_SEPARATOR)[0] in ranged:
        return
    problem = f"variant {variant.id} assigns agent {agent_id} to {node_id}, which lies outside the range of {label}"
    fix = f"assign agents inside the range ({', '.join(ranged)}): nodes before it replay the case node_outputs"
    yield site.problem(DiagnosticCode.E_VARIANT_INVALID, path, problem, fix)


def _llm_nodes(flow: LoadedFlow) -> tuple[NodeId, ...]:
    return tuple(node_id for node_id, source in flow.nodes.items() if isinstance(source.spec, LlmNodeSpec))


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


def _arm_types(site: ExperimentSite) -> Iterator[Diagnostic]:
    subject = flow_spec(site.subject)
    if subject is None:
        return
    arms = ((arm_id, arm) for arm_id, arm in site.loaded.arms.items() if arm is not site.subject)
    for arm_id, arm in arms:
        yield from _arm_type(site, arm_id, arm, subject)


def _arm_type(site: ExperimentSite, arm_id: ArmId, arm: LoadedFlow, subject: FlowSpec) -> Iterator[Diagnostic]:
    source = arm.source
    if source is None:
        return
    sides = zip(TYPE_KEYS, (source.spec.input, source.spec.output), (subject.input, subject.output), strict=True)
    for key, own, expected in sides:
        if own == expected:
            continue
        problem = f"arm {arm_id} has {key} {own}, but the subject {site.label} has {key} {expected}"
        fix = f"give every arm the {key} type of the subject: all variants run the same cases and checks"
        values = site.values(problem=problem, fix=fix)
        yield templated_diagnostic(DiagnosticCode.E_DATASET_MISMATCH, source.path, (key,), values)


EXPERIMENT_RULES: Final[tuple[ExperimentRule, ...]] = (
    _subject,
    _range,
    _variant_ranges,
    _cases,
    _variants,
    _checks,
    _question,
    _arm_types,
)
