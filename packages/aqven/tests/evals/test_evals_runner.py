import asyncio
from pathlib import Path

from evals_harness import DATASET_ID, EVAL_ID, FakeStatistics, long_answer, models, short_answer

from aqven.evals import EvalOptions, EvalRunRecord, SqliteEvalStore, build_eval_plan, run_eval
from aqven.runtime import Project
from aqven.testing.engines import EngineSession


def evaluate(root: Path, store: SqliteEvalStore | None = None, baseline: str | None = None) -> EvalRunRecord:
    project = Project.load(root)
    options = EvalOptions(store=store, baseline_run_id=baseline)
    return asyncio.run(run_eval(project, EVAL_ID, options))


def test_eval_plan_names_the_subject_and_the_judge_flows(eval_shop: Path) -> None:
    plan = build_eval_plan(Project.load(eval_shop), EVAL_ID)

    assert (plan.dataset_id, len(plan.cases)) == (DATASET_ID, 3)
    assert [scorer.scorer_id for scorer in plan.scorers] == ["filled", "brief", "grade", "cost_usd"]
    assert plan.subject.flow_id in plan.plan.flows
    assert plan.judges["grade"].flow_id in plan.plan.flows


def test_eval_run_scores_every_case_with_every_scorer(eval_shop: Path, aqven_engine: EngineSession) -> None:
    aqven_engine.models(models(short_answer))

    record = evaluate(eval_shop)

    assert (record.status, record.cases_total, record.cases_ok) == ("completed", 3, 3)
    assert [item.scorer_id for item in record.scorers] == ["filled", "brief", "grade", "cost_usd"]
    assert {item.scorer_id: item.mean for item in record.scorers}["filled"] == 1.0
    assert all(item.n == 3 for item in record.scorers)


def test_eval_run_persists_cases_and_compares_with_a_baseline(
    eval_shop: Path, aqven_engine: EngineSession, tmp_path: Path
) -> None:
    store = SqliteEvalStore.open(tmp_path / "evals.sqlite")
    aqven_engine.models(models(short_answer))
    first = evaluate(eval_shop, store)
    aqven_engine.models(models(long_answer))
    second = evaluate(eval_shop, store, first.eval_run_id)

    stored = asyncio.run(store.run(first.eval_run_id))
    cases = asyncio.run(store.cases(first.eval_run_id))
    deltas = {item.scorer_id: item for item in second.deltas}

    assert stored is not None and stored.eval_run_id == first.eval_run_id
    assert len(cases) == 3 and all(len(item.scores) == 4 for item in cases)
    assert deltas["grade"].delta > 0 and deltas["grade"].wins == 3
    assert deltas["brief"].delta < 0


def test_the_release_gate_runs_over_two_stored_eval_runs(
    eval_shop: Path, aqven_engine: EngineSession, tmp_path: Path
) -> None:
    store = SqliteEvalStore.open(tmp_path / "gate.sqlite")
    aqven_engine.models(models(short_answer))
    baseline = asyncio.run(run_eval(Project.load(eval_shop), EVAL_ID, EvalOptions(store=store)))
    aqven_engine.models(models(long_answer))
    options = EvalOptions(store=store, baseline_run_id=baseline.eval_run_id, statistics=FakeStatistics())

    record = asyncio.run(run_eval(Project.load(eval_shop), EVAL_ID, options))
    report = record.gate

    assert report is not None
    assert (report.decision.value, report.reason_code) == ("PASS", None)
    assert {row.scorer_id for row in report.per_test} == {"grade", "filled", "cost_usd"}
    assert next(row for row in report.per_test if row.scorer_id == "grade").delta > 0
    assert report.dropped_cases == () and report.seeds == (0,)


def test_a_gate_without_injected_statistics_still_decides(
    eval_shop: Path, aqven_engine: EngineSession, tmp_path: Path
) -> None:
    store = SqliteEvalStore.open(tmp_path / "default.sqlite")
    aqven_engine.models(models(short_answer))
    baseline = asyncio.run(run_eval(Project.load(eval_shop), EVAL_ID, EvalOptions(store=store)))
    aqven_engine.models(models(long_answer))
    options = EvalOptions(store=store, baseline_run_id=baseline.eval_run_id)

    record = asyncio.run(run_eval(Project.load(eval_shop), EVAL_ID, options))
    report = record.gate

    assert report is not None and report.decision.value != "GATE_UNAVAILABLE"
    assert {row.method for row in report.per_test} <= {"paired_bootstrap", "mcnemar_exact"}
    assert all(row.p_raw is not None for row in report.per_test)
