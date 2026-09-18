import asyncio
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

from aqven.evals import CaseRecord, EvalRunId, EvalRunRecord, ScoreRecord, SqliteEvalStore
from aqven.evals.records import EvalRunStatus
from aqven.evals.store import EvalRunQuery
from aqven.spec import AgentId, DatasetId, EvalId, InferenceId, MetricKind

MOMENT = datetime(2026, 9, 18, 10, 0, tzinfo=UTC)


def record(run_id: str, eval_id: str = "reply_quality", status: EvalRunStatus = "completed") -> EvalRunRecord:
    return EvalRunRecord(
        eval_run_id=EvalRunId(run_id),
        eval_id=EvalId(eval_id),
        dataset_id=DatasetId("reply_cases"),
        inference=InferenceId("reply"),
        agent=AgentId("writer"),
        status=status,
        started_at=MOMENT,
        cost_usd=Decimal("0.0001"),
    )


def case(name: str, index: int = 0) -> CaseRecord:
    return CaseRecord(
        case_name=name,
        run_index=index,
        seed=index,
        status="ok",
        scores=(ScoreRecord(scorer_id="filled", kind=MetricKind.BINARY, value=1.0, passed=True),),
    )


def test_a_run_and_its_cases_survive_a_reopen(tmp_path: Path) -> None:
    path = tmp_path / "aqven.sqlite"
    store = SqliteEvalStore.open(path)
    first = record("run-1")

    asyncio.run(store.save_run(first))
    asyncio.run(store.save_cases(first.eval_run_id, [case("a"), case("b")]))
    reopened = SqliteEvalStore.open(path)
    stored = asyncio.run(reopened.run(first.eval_run_id))
    cases = asyncio.run(reopened.cases(first.eval_run_id))

    assert stored is not None and stored.cost_usd == Decimal("0.0001")
    assert [item.case_name for item in cases] == ["a", "b"]
    assert cases[0].scores[0].scorer_id == "filled"


def test_saving_the_same_run_twice_updates_it(tmp_path: Path) -> None:
    store = SqliteEvalStore.open(tmp_path / "aqven.sqlite")
    running = record("run-2", status="running")

    asyncio.run(store.save_run(running))
    asyncio.run(store.save_run(running.model_copy(update={"status": "completed"})))
    rows = asyncio.run(store.search(EvalRunQuery()))

    assert [item.status for item in rows] == ["completed"]


def test_search_filters_by_eval_id_and_status(tmp_path: Path) -> None:
    store = SqliteEvalStore.open(tmp_path / "aqven.sqlite")
    asyncio.run(store.save_run(record("run-3")))
    asyncio.run(store.save_run(record("run-4", eval_id="other")))
    asyncio.run(store.save_run(record("run-5", status="failed")))

    mine = asyncio.run(store.search(EvalRunQuery(eval_id=EvalId("reply_quality"))))
    failed = asyncio.run(store.search(EvalRunQuery(status="failed")))

    assert {item.eval_run_id for item in mine} == {"run-3", "run-5"}
    assert [item.eval_run_id for item in failed] == ["run-5"]


def test_an_unknown_run_is_none(tmp_path: Path) -> None:
    store = SqliteEvalStore.open(tmp_path / "aqven.sqlite")

    assert asyncio.run(store.run(EvalRunId("nothing"))) is None
    assert asyncio.run(store.cases(EvalRunId("nothing"))) == ()
