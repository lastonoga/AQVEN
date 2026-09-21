from pathlib import Path
from typing import Final

import pytest

from aqven.check import check_project
from aqven.compiler import compile_flow_plan, compile_root, plan_flow, visible_node
from aqven.ir import CompiledProject, IrLookupError, flow_hash
from aqven.spec import AgentId, FlowId, InferenceId, NodeId, ToolId

FIXTURE: Final = Path(__file__).parents[1] / "fixtures" / "standard_shop"
LUMEN: Final = Path(__file__).parents[4] / "examples" / "lumen"
INTAKE: Final = FlowId("intake")


@pytest.fixture(scope="module")
def standard() -> CompiledProject:
    return compile_root(FIXTURE)


def test_plan_holds_the_flow_closure_and_its_hash(standard: CompiledProject) -> None:
    plan = plan_flow(standard, "intake")

    assert plan.flow_id == INTAKE
    assert plan.flow == standard.flow(INTAKE)
    assert plan.ir_hash == flow_hash(standard, INTAKE) == flow_hash(plan.project, INTAKE)
    assert set(plan.project.agents) == {AgentId("critic"), AgentId("writer")}
    assert set(plan.project.inferences) == {InferenceId("lookup"), InferenceId("redo"), InferenceId("reply")}
    assert set(plan.project.tools) == {ToolId("stamp")}
    assert plan.project.type_schemas == {}


def test_plan_of_an_unknown_flow_is_a_lookup_error(standard: CompiledProject) -> None:
    with pytest.raises(IrLookupError):
        plan_flow(standard, "missing")


def test_plan_straight_from_a_check_report(standard: CompiledProject) -> None:
    assert compile_flow_plan(check_project(FIXTURE), "intake") == plan_flow(standard, "intake")


def test_visible_node_follows_lexical_scopes_of_nested_bodies(standard: CompiledProject) -> None:
    flow = standard.flow(INTAKE)
    loop = NodeId("review__recheck")

    assert visible_node(flow, loop, "redo") == NodeId("review__recheck__redo")
    assert visible_node(flow, loop, "reply") == NodeId("reply")
    assert visible_node(flow, None, "clean") == NodeId("clean")
    assert visible_node(flow, None, "redo") is None
    assert visible_node(flow, NodeId("review"), "trim") is None


def test_lumen_plan_reaches_the_called_flow_only_from_the_caller() -> None:
    report = check_project(LUMEN)
    if not report.ok:
        pytest.skip(f"the lumen example does not pass aqven check yet: {len(report.errors)} errors")

    support = compile_flow_plan(report, "support_case")
    panel = compile_flow_plan(report, "judge_panel")

    assert set(support.project.flows) == {FlowId("judge_panel"), FlowId("support_case")}
    assert set(panel.project.flows) == {FlowId("judge_panel")}
    assert support.ir_hash != panel.ir_hash
