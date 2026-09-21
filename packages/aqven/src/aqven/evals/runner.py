import uuid
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from statistics import fmean
from time import perf_counter
from typing import Final, Protocol

from pydantic import JsonValue
from pydantic_evals import Case, Dataset
from pydantic_evals.evaluators import EvaluationReason, Evaluator, EvaluatorContext, EvaluatorOutput
from pydantic_evals.reporting import EvaluationReport

from aqven.engine.assembly.code import LoaderInferenceModels
from aqven.engine.loading import CodeLoader
from aqven.engine.request import RunRecord
from aqven.evals.flows import InferenceFlow, case_input
from aqven.evals.gate import GateFamily, GateReport, GateRequest, ScorerSeries, build_gate
from aqven.evals.plan import CompiledScorer, EvalPlan, build_eval_plan
from aqven.evals.records import (
    CaseRecord,
    CaseStatus,
    EvalRunId,
    EvalRunRecord,
    ScorerDelta,
    ScoreRecord,
    ScorerSummary,
)
from aqven.evals.scoring import JudgeVerdict, ScoredCase, ScorerEngine, ScorerFailed
from aqven.evals.statistics import PairedStatistics, Statistics
from aqven.evals.store import EvalStore
from aqven.ir import CompiledProject, flow_hash
from aqven.runtime import CassetteConfig, Project, RunContext, RunOptions
from aqven.runtime.address import JsonObject, RunId
from aqven.runtime.runs import RunStarted
from aqven.runtime.vocabulary import RunMode
from aqven.spec import FlowId, GateSpec

EVALS_UNAVAILABLE_MESSAGE: Final = "prompt optimization is not implemented"
CASE_SEPARATOR: Final = "#"
MILLISECONDS: Final = 1000
DEFAULT_CONCURRENCY: Final = 4
CASE_KEY: Final = "case"
RUN_INDEX_KEY: Final = "run_index"
SEED_KEY: Final = "seed"
EXPECTED_KEY: Final = "expected_output"
FAMILY_KEYS: Final[tuple[GateFamily, ...]] = ("primary", "secondary", "safety")


class FlowLauncher(Protocol):
    async def start(
        self, plan: CompiledProject, flow_id: FlowId, flow_input: JsonObject, options: RunOptions
    ) -> RunStarted: ...

    async def result(self, run_id: RunId) -> RunRecord: ...


class EvalsUnavailable(NotImplementedError):
    def __init__(self, eval_id: str) -> None:
        super().__init__(f"{EVALS_UNAVAILABLE_MESSAGE}: {eval_id}")
        self.eval_id = eval_id


@dataclass(frozen=True, slots=True)
class EvalOptions:
    dataset_id: str | None = None
    baseline_run_id: str | None = None
    repeats: int | None = None
    concurrency: int = DEFAULT_CONCURRENCY
    mode: RunMode = "live"
    cassettes: CassetteConfig | None = None
    context: RunContext | None = None
    seed: int = 0
    statistics: Statistics | None = None
    store: EvalStore | None = None
    launcher: FlowLauncher | None = None
    eval_run_id: EvalRunId | None = None


@dataclass(frozen=True, slots=True)
class CaseOutput:
    status: CaseStatus
    output: JsonObject = field(default_factory=dict[str, JsonValue])
    run_id: RunId | None = None
    cost_usd: Decimal = Decimal(0)
    tokens_in: int = 0
    tokens_out: int = 0
    latency_ms: int = 0
    error: str | None = None


@dataclass(slots=True)
class ScoreCollector:
    scores: dict[str, list[ScoreRecord]] = field(default_factory=dict[str, list[ScoreRecord]])

    def add(self, case_name: str, record: ScoreRecord) -> None:
        self.scores.setdefault(case_name, []).append(record)

    def of(self, case_name: str) -> tuple[ScoreRecord, ...]:
        return tuple(sorted(self.scores.get(case_name, []), key=lambda item: item.scorer_id))


@dataclass
class ScorerEvaluator(Evaluator[JsonObject, CaseOutput, JsonObject]):
    scorer: CompiledScorer
    engine: ScorerEngine
    collector: ScoreCollector
    models: LoaderInferenceModels
    plan: EvalPlan

    async def evaluate(self, ctx: EvaluatorContext[JsonObject, CaseOutput, JsonObject]) -> EvaluatorOutput:
        name = ctx.name or ""
        if ctx.output.status != "ok":
            raise ScorerFailed(self.scorer.scorer_id, "case did not produce an output")
        record = await self.engine.score(self.scorer, self._case(ctx))
        self.collector.add(name, record)
        return EvaluationReason(value=record.value, reason=record.reason)

    def _case(self, ctx: EvaluatorContext[JsonObject, CaseOutput, JsonObject]) -> ScoredCase:
        inference = self.plan.plan.inference(self.plan.spec.inference)
        metadata = ctx.metadata or {}
        return ScoredCase(
            inputs=self.models.input_model(inference).model_validate(ctx.inputs),
            output=self.models.output_model(inference).model_validate(ctx.output.output),
            inputs_document=ctx.inputs,
            output_document=ctx.output.output,
            expected_output=metadata.get(EXPECTED_KEY),
            metadata=metadata,
            cost_usd=float(ctx.output.cost_usd),
            latency_ms=ctx.output.latency_ms,
        )


def case_name_of(name: str, run_index: int) -> str:
    return f"{name}{CASE_SEPARATOR}{run_index}"


def split_case_name(name: str) -> tuple[str, int]:
    base, _, index = name.rpartition(CASE_SEPARATOR)
    return (base, int(index)) if base and index.isdigit() else (name, 0)


def means_by_case(cases: Sequence[CaseRecord], scorer_id: str) -> Mapping[str, float]:
    grouped: dict[str, list[float]] = {}
    for record in (item for item in cases if item.status == "ok"):
        for score in (score for score in record.scores if score.scorer_id == scorer_id):
            grouped.setdefault(record.case_name, []).append(score.value)
    return {name: fmean(values) for name, values in grouped.items() if values}


def scorer_summary(scorer: CompiledScorer, cases: Sequence[CaseRecord]) -> ScorerSummary:
    values = [score.value for case in cases for score in case.scores if score.scorer_id == scorer.scorer_id]
    outcomes = [score.passed for case in cases for score in case.scores if score.scorer_id == scorer.scorer_id]
    decided = [item for item in outcomes if item is not None]
    return ScorerSummary(
        scorer_id=scorer.scorer_id,
        kind=scorer.kind,
        n=len(values),
        mean=fmean(values) if values else 0.0,
        pass_rate=(sum(1 for item in decided if item) / len(decided)) if decided else None,
        minimum=min(values) if values else 0.0,
        maximum=max(values) if values else 0.0,
    )


def scorer_delta(
    scorer: CompiledScorer, baseline: Sequence[CaseRecord], candidate: Sequence[CaseRecord]
) -> ScorerDelta:
    before = means_by_case(baseline, scorer.scorer_id)
    after = means_by_case(candidate, scorer.scorer_id)
    shared = sorted(set(before) & set(after))
    pairs = [(before[name], after[name]) for name in shared]
    wins = sum(1 for left, right in pairs if right > left)
    losses = sum(1 for left, right in pairs if right < left)
    return ScorerDelta(
        scorer_id=scorer.scorer_id,
        kind=scorer.kind,
        n=len(pairs),
        baseline_mean=fmean([left for left, _ in pairs]) if pairs else 0.0,
        candidate_mean=fmean([right for _, right in pairs]) if pairs else 0.0,
        delta=(fmean([right - left for left, right in pairs]) if pairs else 0.0),
        wins=wins,
        losses=losses,
        ties=len(pairs) - wins - losses,
    )


def families_of(gate: GateSpec) -> Mapping[str, GateFamily]:
    groups: Mapping[GateFamily, Sequence[str]] = {
        "primary": gate.families.primary,
        "secondary": gate.families.secondary or (),
        "safety": gate.families.safety or (),
    }
    return {scorer_id: name for name in FAMILY_KEYS for scorer_id in groups[name]}


def gate_series(
    plan: EvalPlan, gate: GateSpec, baseline: Sequence[CaseRecord], candidate: Sequence[CaseRecord]
) -> tuple[ScorerSeries, ...]:
    families = families_of(gate)
    series: list[ScorerSeries] = []
    for scorer in plan.scorers:
        family = families.get(scorer.scorer_id)
        if family is None:
            continue
        before = means_by_case(baseline, scorer.scorer_id)
        after = means_by_case(candidate, scorer.scorer_id)
        shared = sorted(set(before) & set(after))
        series.append(
            ScorerSeries(
                scorer_id=scorer.scorer_id,
                kind=scorer.kind,
                family=family,
                baseline=tuple(before[name] for name in shared),
                candidate=tuple(after[name] for name in shared),
            )
        )
    return tuple(series)


def dropped_between(baseline: Sequence[CaseRecord], candidate: Sequence[CaseRecord]) -> tuple[str, ...]:
    before = {item.case_name for item in baseline if item.status == "ok"}
    after = {item.case_name for item in candidate if item.status == "ok"}
    return tuple(sorted(before ^ after))


@dataclass(frozen=True, slots=True)
class FlowJudges:
    runner: EvalRunner

    async def judge(self, scorer_id: str, document: JsonObject) -> JudgeVerdict:
        flow = self.runner.plan.judges[scorer_id]
        inputs = case_input(self.runner.plan.plan, flow.inference, document)
        outcome = await self.runner.run_flow(flow, inputs)
        if outcome.status != "ok":
            return JudgeVerdict(output={}, cost_usd=outcome.cost_usd, error=outcome.error or "judge run failed")
        return JudgeVerdict(output=outcome.output, cost_usd=outcome.cost_usd)


@dataclass(frozen=True, slots=True)
class EvalRunner:
    project: Project
    plan: EvalPlan
    options: EvalOptions

    def run_options(self) -> RunOptions:
        return RunOptions(mode=self.options.mode, context=self.options.context, cassettes=self.options.cassettes)

    def launcher(self) -> FlowLauncher:
        return self.options.launcher if self.options.launcher is not None else self.project.engine()

    async def run_flow(self, flow: InferenceFlow, document: JsonObject) -> CaseOutput:
        engine = self.launcher()
        started = perf_counter()
        launched = await engine.start(self.plan.plan, flow.flow_id, document, self.run_options())
        record = await engine.result(launched.run_id)
        latency = int((perf_counter() - started) * MILLISECONDS)
        if record.status != "completed":
            message = record.error.message if record.error is not None else record.status
            return CaseOutput(
                status="failed",
                run_id=launched.run_id,
                cost_usd=record.usage.cost_usd,
                tokens_in=record.usage.tokens_in,
                tokens_out=record.usage.tokens_out,
                latency_ms=latency,
                error=message,
            )
        return CaseOutput(
            status="ok",
            output=flow.unwrap(record.output),
            run_id=launched.run_id,
            cost_usd=record.usage.cost_usd,
            tokens_in=record.usage.tokens_in,
            tokens_out=record.usage.tokens_out,
            latency_ms=latency,
        )

    async def subject(self, document: JsonObject) -> CaseOutput:
        return await self.run_flow(self.plan.subject, document)


def dataset_cases(plan: EvalPlan, repeats: int, seed: int) -> tuple[Case[JsonObject, CaseOutput, JsonObject], ...]:
    return tuple(
        Case[JsonObject, CaseOutput, JsonObject](
            name=case_name_of(case.name, index),
            inputs=case_input(plan.plan, plan.spec.inference, case.inputs),
            metadata={
                CASE_KEY: case.name,
                RUN_INDEX_KEY: index,
                SEED_KEY: seed + index,
                EXPECTED_KEY: case.expected_output,
                **(case.metadata or {}),
            },
        )
        for case in plan.cases
        for index in range(repeats)
    )


def report_outputs(report: EvaluationReport[JsonObject, CaseOutput, JsonObject]) -> Mapping[str, CaseOutput]:
    produced = {item.name: item.output for item in report.cases}
    failed = {
        item.name: CaseOutput(status="failed", error=item.error_message)
        for item in report.failures
        if item.name not in produced
    }
    return {**produced, **failed}


def evaluator_notes(report: EvaluationReport[JsonObject, CaseOutput, JsonObject]) -> tuple[str, ...]:
    found = {f"{item.name}: {failure.error_message}" for item in report.cases for failure in item.evaluator_failures}
    return tuple(sorted(found))


def case_records(
    cases: Sequence[Case[JsonObject, CaseOutput, JsonObject]],
    outputs: Mapping[str, CaseOutput],
    collector: ScoreCollector,
    seed: int,
    expected_scorers: int,
) -> tuple[CaseRecord, ...]:
    records: list[CaseRecord] = []
    for case in cases:
        name = case.name or ""
        base, index = split_case_name(name)
        output = outputs.get(name, CaseOutput(status="failed", error="case did not run"))
        scores = collector.of(name)
        complete = output.status == "ok" and len(scores) == expected_scorers
        records.append(
            CaseRecord(
                case_name=base,
                run_index=index,
                seed=seed + index,
                status="ok" if complete else "failed",
                run_id=output.run_id,
                output=output.output,
                error=output.error if output.error is not None else _missing_scores(complete),
                cost_usd=output.cost_usd + sum((item.cost_usd for item in scores), Decimal(0)),
                tokens_in=output.tokens_in,
                tokens_out=output.tokens_out,
                latency_ms=output.latency_ms,
                scores=scores,
            )
        )
    return tuple(records)


def _missing_scores(complete: bool) -> str | None:
    return None if complete else "one or more scorers produced no value"


def loader_models(plan: EvalPlan) -> LoaderInferenceModels:
    return LoaderInferenceModels(CodeLoader(plan.root), plan.plan.package)


@dataclass(frozen=True, slots=True)
class Baseline:
    record: EvalRunRecord | None = None
    cases: tuple[CaseRecord, ...] = ()

    @property
    def spec_hash(self) -> str:
        return self.record.spec_hash if self.record is not None else ""


async def load_baseline(store: EvalStore | None, baseline_run_id: str | None) -> Baseline:
    if store is None or baseline_run_id is None:
        return Baseline()
    wanted = EvalRunId(baseline_run_id)
    return Baseline(record=await store.run(wanted), cases=await store.cases(wanted))


def spec_hash_of(plan: EvalPlan) -> str:
    return flow_hash(plan.plan, plan.subject.flow_id)


def gate_report(
    plan: EvalPlan,
    baseline: Baseline,
    candidate: Sequence[CaseRecord],
    statistics: Statistics | None,
    repeats: int,
    seeds: Sequence[int],
) -> GateReport | None:
    gate = plan.spec.gate
    if gate is None or not baseline.cases:
        return None
    request = GateRequest(
        spec=gate,
        series=gate_series(plan, gate, baseline.cases, candidate),
        dataset_size=len({item.case_name for item in candidate}),
        dropped_cases=dropped_between(baseline.cases, candidate),
        spec_a_hash=baseline.spec_hash,
        spec_b_hash=spec_hash_of(plan),
        seeds=tuple(seeds),
    )
    return build_gate(request, statistics, repeats)


async def run_eval(project: Project, eval_id: str, options: EvalOptions | None = None) -> EvalRunRecord:
    chosen = options or EvalOptions()
    plan = build_eval_plan(project, eval_id, chosen.dataset_id)
    repeats = chosen.repeats or plan.repeats
    runner = EvalRunner(project=project, plan=plan, options=chosen)
    models = loader_models(plan)
    collector = ScoreCollector()
    scorers = ScorerEngine(loader=CodeLoader(plan.root), judges=FlowJudges(runner))
    evaluators = [
        ScorerEvaluator(scorer=scorer, engine=scorers, collector=collector, models=models, plan=plan)
        for scorer in plan.scorers
    ]
    cases = dataset_cases(plan, repeats, chosen.seed)
    dataset = Dataset[JsonObject, CaseOutput, JsonObject](
        name=f"{plan.eval_id}:{plan.dataset_id}", cases=list(cases), evaluators=evaluators
    )
    started_at = datetime.now(UTC)
    report = await dataset.evaluate(runner.subject, max_concurrency=chosen.concurrency, progress=False)
    records = case_records(cases, report_outputs(report), collector, chosen.seed, len(plan.scorers))
    previous = await load_baseline(chosen.store, chosen.baseline_run_id)
    seeds = tuple(chosen.seed + index for index in range(repeats))
    record = EvalRunRecord(
        eval_run_id=chosen.eval_run_id or EvalRunId(str(uuid.uuid7())),
        eval_id=plan.eval_id,
        dataset_id=plan.dataset_id,
        inference=plan.spec.inference,
        agent=plan.spec.agent,
        status="completed" if all(item.status == "ok" for item in records) else "failed",
        spec_hash=spec_hash_of(plan),
        started_at=started_at,
        finished_at=datetime.now(UTC),
        repeats=repeats,
        seeds=seeds,
        cases_total=len(records),
        cases_ok=sum(1 for item in records if item.status == "ok"),
        cases_failed=sum(1 for item in records if item.status != "ok"),
        dropped_cases=tuple(sorted({item.case_name for item in records if item.status != "ok"})),
        cost_usd=sum((item.cost_usd for item in records), Decimal(0)),
        tokens_in=sum(item.tokens_in for item in records),
        tokens_out=sum(item.tokens_out for item in records),
        scorers=tuple(scorer_summary(scorer, records) for scorer in plan.scorers),
        baseline_run_id=EvalRunId(chosen.baseline_run_id) if chosen.baseline_run_id else None,
        deltas=tuple(scorer_delta(scorer, previous.cases, records) for scorer in plan.scorers)
        if previous.cases
        else (),
        gate=gate_report(plan, previous, records, chosen.statistics or PairedStatistics(), repeats, seeds),
        notes=evaluator_notes(report),
    )
    await _persist(chosen.store, record, records)
    return record


async def _persist(store: EvalStore | None, record: EvalRunRecord, cases: Sequence[CaseRecord]) -> None:
    if store is None:
        return
    await store.save_run(record)
    await store.save_cases(record.eval_run_id, cases)


async def run_optimization(project: Project, eval_id: str) -> Path:
    raise EvalsUnavailable(eval_id)
