import asyncio
from pathlib import Path
from typing import Final

import pytest
from pydantic import JsonValue
from series_fixture import write_project

from aqven.check import check_project
from aqven.engine import RunRecord, SeriesTag
from aqven.engine.loading import CodeLoader
from aqven.ir import CompiledLlmNode, flow_hash
from aqven.series.model import CaseSnapshot, JudgePlan, SubjectKind, SubjectRecord, VariantChange, VariantRole
from aqven.series.planner import PlannedSeries, PlanningState, SeriesPlanner, plan_request
from aqven.series.scoring import judge_input
from aqven.series.subjects import FlowSubject, RangeSubject, SubjectBinding, subject_strategy
from aqven.series.views import LookTarget, SeriesStartRequest
from aqven.server.errors import ApiFailure
from aqven.server.workspace import take_snapshot
from aqven.spec import AgentId, DatasetId, ExperimentId, FactorKind, FlowId, InferenceId, NodeId, SeriesSplit

TAG: Final = SeriesTag(
    series_id="01999f2e-4b1c-7a3d-9e21-5c7d8f0a1b2c",
    attempt_id="0cf98137-2d99-5695-8fe4-983a861383ab",
    role="subject",
    variant_id="writer",
    case_name="always_1",
    repeat=1,
)
LIMIT_MICROS: Final = 250_000


@pytest.fixture
def project_root(tmp_path: Path) -> Path:
    return write_project(tmp_path)


def planned(root: Path, request: SeriesStartRequest) -> PlannedSeries:
    planner = SeriesPlanner(types=CodeLoader(root), engine_version="test", holdout_share=0.5)
    state = PlanningState(check_project(root), take_snapshot(root))
    return asyncio.run(planner.plan(plan_request(request), state, None))


def binding(root: Path, subject: SubjectRecord) -> SubjectBinding:
    return SubjectBinding(subject=subject, types=CodeLoader(root), package="series_shop")


def case(name: str, inputs: dict[str, JsonValue], node_outputs: dict[NodeId, JsonValue] | None = None) -> CaseSnapshot:
    return CaseSnapshot(
        case_index=0,
        name=name,
        split=SeriesSplit.DEV,
        inputs=dict(inputs),
        node_outputs=dict(node_outputs or {}),
        expected_output={"label": "ok"},
    )


def test_a_flow_subject_swaps_agents_with_their_output_mode_and_registers_nothing_when_asked(
    project_root: Path,
) -> None:
    series = planned(project_root, SeriesStartRequest(experiment_id=ExperimentId("triage_agents")))

    writer, cheap = series.variants
    writer_node = writer.plan.flow(FlowId("triage")).nodes[NodeId("classify")]
    cheap_node = cheap.plan.flow(FlowId("triage")).nodes[NodeId("classify")]
    assert isinstance(writer_node, CompiledLlmNode) and isinstance(cheap_node, CompiledLlmNode)
    assert (writer_node.agent, cheap_node.agent) == ("writer", "cheap")
    assert writer_node.output_mode != cheap_node.output_mode
    assert cheap_node.output_mode == "prompted"
    assert (writer.record.role, cheap.record.role) == (VariantRole.BASELINE, VariantRole.CANDIDATE)
    assert [(item.node_id, item.agent_id, item.overridden) for item in cheap.record.assignments] == [
        ("classify", "cheap", True)
    ]
    assert [(item.node_id, item.overridden) for item in writer.record.assignments] == [("classify", False)]
    assert (writer.record.changes, cheap.record.changes) == (
        (),
        (VariantChange(node_id=NodeId("classify"), what=FactorKind.AGENT, value="cheap"),),
    )
    assert writer.plan is series.subject.plan
    assert cheap.record.flow_hash == flow_hash(cheap.plan, FlowId("triage"))
    assert writer.record.flow_hash != cheap.record.flow_hash
    assert writer.record.ir_hash == ""
    assert series.snapshot.flows == {"writer": writer.record.flow_hash, "cheap": cheap.record.flow_hash}
    assert set(series.snapshot.judges) == {"grade"}
    judge = next(check.judge for check in series.checks if check.judge is not None)
    assert judge == JudgePlan(
        flow_id=FlowId("aqven_judge_grade"),
        inference=InferenceId("grade"),
        agent=AgentId("critic"),
        input_fields=("text", "label"),
        validated_by=None,
    )


def test_a_flow_subject_prepares_an_experiment_run_of_the_case(project_root: Path) -> None:
    series = planned(project_root, SeriesStartRequest(experiment_id=ExperimentId("triage_agents")))
    strategy = subject_strategy(binding(project_root, series.draft.subject))

    prepared = strategy.prepare(
        series.variants[1].record, series.cases[0], DatasetId("triage_cases"), TAG, LIMIT_MICROS
    )

    assert strategy.kind is SubjectKind.FLOW
    assert prepared.flow_input == {"text": "always right"}
    spec = prepared.spec
    assert (spec.flow_id, spec.mode, spec.dataset_item_id) == ("triage", "experiment", "triage_cases/always_1")
    assert spec.limits is not None and spec.limits.usd_micros == LIMIT_MICROS
    assert (spec.output_deltas, spec.cassettes, spec.series) == (False, None, TAG)
    assert spec.start_node is None


def test_a_range_subject_runs_from_the_case_node_outputs_and_reads_out_of_the_last_node(project_root: Path) -> None:
    series = planned(project_root, SeriesStartRequest(experiment_id=ExperimentId("triage_range")))
    strategy = subject_strategy(binding(project_root, series.draft.subject))
    first = series.cases[0]

    prepared = strategy.prepare(series.variants[0].record, first, DatasetId("range_cases"), TAG, LIMIT_MICROS)
    record = RunRecord(status="completed", output={"tidy": {"label": "ok"}})

    assert isinstance(strategy, RangeSubject)
    assert (prepared.spec.start_node, prepared.spec.end_node) == ("tidy", "tidy")
    assert prepared.spec.node_outputs == {"classify": {"label": " ok "}}
    assert prepared.flow_input == {"text": "always right"}
    assert strategy.subject_output(record) == {"label": "ok"}
    assert series.variants[0].record.output_type is None
    assert series.variants[0].record.assignments == ()


def test_a_local_flow_subject_and_a_range_on_it_target_the_local_flow(project_root: Path) -> None:
    series = planned(project_root, SeriesStartRequest(experiment_id=ExperimentId("triage_solo")))
    ranged = series.draft.subject.model_copy(
        update={"kind": SubjectKind.RANGE, "start_node": NodeId("answer"), "end_node": NodeId("answer")}
    )
    ranged_strategy = subject_strategy(binding(project_root, ranged))
    plain = case("always_1", {"text": "always right"})

    assert series.draft.subject == SubjectRecord(
        kind=SubjectKind.FLOW, flow_id=FlowId("solo"), local_flow=True, start_node=None, end_node=None
    )
    assert series.draft.flow_id is None
    assert isinstance(subject_strategy(binding(project_root, series.draft.subject)), FlowSubject)
    assert [variant.record.flow_id for variant in series.variants] == ["solo", "solo"]
    assert [variant.record.role for variant in series.variants] == [VariantRole.CANDIDATE, VariantRole.CANDIDATE]
    assert set(series.subject.plan.flows) == {"solo"}
    assert ranged_strategy.problems(series.subject.plan, FlowId("solo"), plain) == ()
    prepared = ranged_strategy.prepare(series.variants[0].record, plain, DatasetId("triage_cases"), TAG, 1)
    assert (prepared.spec.flow_id, prepared.spec.start_node, prepared.spec.end_node) == ("solo", "answer", "answer")


def test_problems_refuse_a_range_case_without_boundary_outputs_before_any_run(project_root: Path) -> None:
    look = LookTarget(
        flow_id=FlowId("triage"),
        dataset_id=DatasetId("triage_cases"),
        case_names=("always_1",),
        start_node=NodeId("tidy"),
        end_node=NodeId("tidy"),
    )

    with pytest.raises(ApiFailure) as refused:
        planned(project_root, SeriesStartRequest(look=look))

    assert refused.value.code == "NOT_RUNNABLE"
    assert [problem.path for problem in refused.value.problems] == [("cases", "always_1", "current")]
    assert "output fixture for node classify is missing" in refused.value.problems[0].message


def test_problems_refuse_a_flow_case_whose_input_fails_the_input_type(project_root: Path) -> None:
    series = planned(project_root, SeriesStartRequest(experiment_id=ExperimentId("triage_agents")))
    strategy = FlowSubject().bind(binding(project_root, series.draft.subject))

    problems = strategy.problems(series.subject.plan, FlowId("triage"), case("broken", {"subject": "no text"}))

    assert problems
    assert any("text" in problem for problem in problems)


def test_the_judge_scope_orders_input_node_outputs_out_and_expected_output(project_root: Path) -> None:
    series = planned(project_root, SeriesStartRequest(experiment_id=ExperimentId("triage_agents")))
    flow = series.subject.plan.flow(FlowId("triage"))
    strategy = subject_strategy(binding(project_root, series.draft.subject))
    record = RunRecord(status="completed", output={"label": "final"})
    top_outputs: dict[NodeId, JsonValue] = {
        NodeId("classify"): {"label": "raw", "text": "from classify"},
        NodeId("tidy"): {"label": "tidy"},
    }
    judge = JudgePlan(
        flow_id=FlowId("aqven_judge_grade"),
        inference=InferenceId("grade"),
        agent=AgentId("critic"),
        input_fields=("text", "label", "expected_output"),
        validated_by=None,
    )

    documents = strategy.scope(flow, series.cases[0], record, top_outputs)

    assert documents == ({"text": "always right"}, {"label": "raw", "text": "from classify"}, {"label": "final"})
    assert judge_input(judge, documents, series.cases[0]) == {
        "text": "from classify",
        "label": "final",
        "expected_output": {"label": "ok"},
    }


def test_the_range_scope_adds_boundary_outputs_before_the_range(project_root: Path) -> None:
    series = planned(project_root, SeriesStartRequest(experiment_id=ExperimentId("triage_range")))
    flow = series.subject.plan.flow(FlowId("triage"))
    strategy = subject_strategy(binding(project_root, series.draft.subject))
    record = RunRecord(status="completed", output={"tidy": {"label": "ok"}})

    documents = strategy.scope(flow, series.cases[0], record, {NodeId("tidy"): {"label": "ok"}})

    assert documents == ({"text": "always right"}, {"label": " ok "}, {"label": "ok"})


def test_a_look_takes_named_cases_of_any_split_in_request_order(project_root: Path) -> None:
    look = LookTarget(
        flow_id=FlowId("triage"), dataset_id=DatasetId("triage_cases"), case_names=("always_3", "never_1")
    )

    series = planned(project_root, SeriesStartRequest(look=look))

    assert [(item.name, item.split, item.case_index) for item in series.cases] == [
        ("always_3", SeriesSplit.HOLDOUT, 0),
        ("never_1", SeriesSplit.DEV, 1),
    ]
    assert series.draft.on is SeriesSplit.DEV
    assert [check.only_with_expected for check in series.checks] == [True]
    assert [variant.record.variant_id for variant in series.variants] == ["current"]


def test_a_look_with_an_unknown_case_is_not_found(project_root: Path) -> None:
    look = LookTarget(flow_id=FlowId("triage"), dataset_id=DatasetId("triage_cases"), case_names=("missing",))

    with pytest.raises(ApiFailure) as refused:
        planned(project_root, SeriesStartRequest(look=look))

    assert refused.value.code == "NOT_FOUND"


def test_an_experiment_on_holdout_takes_only_holdout_cases_and_warns_when_short(project_root: Path) -> None:
    series = planned(
        project_root, SeriesStartRequest(experiment_id=ExperimentId("triage_agents"), on=SeriesSplit.HOLDOUT)
    )

    assert [item.name for item in series.cases] == ["always_3", "plain_1"]
    assert series.choice.available == 2
    assert series.choice.warnings == ("short_of_cases",)


def test_an_unknown_experiment_is_not_found(project_root: Path) -> None:
    with pytest.raises(ApiFailure) as refused:
        planned(project_root, SeriesStartRequest(experiment_id=ExperimentId("nothing_here")))

    assert refused.value.code == "NOT_FOUND"
