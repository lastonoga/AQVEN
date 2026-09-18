from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

from aqven.check import CodeResolver, build_context
from aqven.compiler.bindings import evaluator
from aqven.compiler.context import CompileContext
from aqven.evals.flows import InferenceFlow, inference_flow, plan_with
from aqven.ir import CompiledEvaluator, CompiledProject, JudgeEvaluator
from aqven.loader import LoadedProject
from aqven.runtime import Project
from aqven.spec import DatasetCase, DatasetId, EvalId, EvalSpec, MetricKind, ScorerSpec

SCORERS_KEY = "scorers"
JUDGE_SUFFIX = "judge"


class EvalNotFound(LookupError):
    def __init__(self, eval_id: str, known: Sequence[str]) -> None:
        super().__init__(f"eval {eval_id} is not in the project; known evals: {', '.join(known) or 'none'}")
        self.eval_id = eval_id


class DatasetNotFound(LookupError):
    def __init__(self, dataset_id: str, known: Sequence[str]) -> None:
        super().__init__(f"dataset {dataset_id} is not in the project; known datasets: {', '.join(known) or 'none'}")
        self.dataset_id = dataset_id


@dataclass(frozen=True, slots=True)
class CompiledScorer:
    scorer_id: str
    kind: MetricKind
    evaluator: CompiledEvaluator


@dataclass(frozen=True, slots=True)
class EvalPlan:
    eval_id: EvalId
    spec: EvalSpec
    dataset_id: DatasetId
    cases: tuple[DatasetCase, ...]
    scorers: tuple[CompiledScorer, ...]
    plan: CompiledProject
    subject: InferenceFlow
    judges: Mapping[str, InferenceFlow]
    root: Path

    @property
    def repeats(self) -> int:
        return self.spec.gate.repeats if self.spec.gate is not None else 1

    def kinds(self) -> Mapping[str, MetricKind]:
        return {scorer.scorer_id: scorer.kind for scorer in self.scorers}


def compiled_scorers(context: CompileContext, spec: EvalSpec, file: str) -> tuple[CompiledScorer, ...]:
    return tuple(
        CompiledScorer(
            scorer_id=scorer.id,
            kind=scorer.kind,
            evaluator=evaluator(context, scorer, file, (SCORERS_KEY, index)),
        )
        for index, scorer in enumerate(spec.scorers)
    )


def judge_flows(
    plan: CompiledProject, scorers: Sequence[CompiledScorer]
) -> tuple[CompiledProject, dict[str, InferenceFlow]]:
    current = plan
    flows: dict[str, InferenceFlow] = {}
    for scorer in scorers:
        judge = scorer.evaluator
        if not isinstance(judge, JudgeEvaluator):
            continue
        built = inference_flow(current, f"{scorer.scorer_id}_{JUDGE_SUFFIX}", judge.inference, judge.agent)
        flows[scorer.scorer_id] = built
        current = plan_with(current, (built,))
    return current, flows


def build_eval_plan(project: Project, eval_id: str, dataset_id: str | None = None) -> EvalPlan:
    loaded = project.loaded_project()
    source = loaded.evals.get(EvalId(eval_id))
    if source is None:
        raise EvalNotFound(eval_id, sorted(loaded.evals))
    spec = source.spec
    wanted = DatasetId(dataset_id) if dataset_id else spec.dataset
    dataset = loaded.datasets.get(wanted)
    if dataset is None:
        raise DatasetNotFound(wanted, sorted(loaded.datasets))
    context = compile_context(loaded)
    scorers = compiled_scorers(context, spec, source.path)
    compiled = project.compiled()
    subject = inference_flow(compiled, spec.inference, spec.inference, spec.agent)
    with_subject = plan_with(compiled, (subject,))
    full, judges = judge_flows(with_subject, scorers)
    return EvalPlan(
        eval_id=EvalId(eval_id),
        spec=spec,
        dataset_id=wanted,
        cases=tuple(dataset.spec.cases),
        scorers=scorers,
        plan=full,
        subject=subject,
        judges=judges,
        root=project.root,
    )


def compile_context(loaded: LoadedProject) -> CompileContext:
    return CompileContext(build_context(loaded, CodeResolver(loaded.root)))


def scorer_specs(spec: EvalSpec) -> Mapping[str, ScorerSpec]:
    return {scorer.id: scorer for scorer in spec.scorers}
