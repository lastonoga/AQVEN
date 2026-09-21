from pathlib import Path
from typing import Final

import pytest

from aqven.check import check_project
from aqven.check.simulation.runner import simulation_context
from aqven.cli import main
from aqven.compiler import compile_project
from aqven.diagnostics import DiagnosticCode
from aqven.engine.facade import missing_context_keys, require_context
from aqven.engine.request import RunSpec
from aqven.ir import CompiledFlow, CompiledProject
from aqven.ports.engine import EngineError
from aqven.runtime.options import RunContext
from aqven.spec import FlowId, RunContextKey
from aqven.testing import copy_project

FIXTURES: Final = Path(__file__).parents[1] / "fixtures"
FIXTURE: Final = FIXTURES / "fixture_shop"
LAYOUT: Final = FIXTURES / "layout_shop"
LUMEN: Final = Path(__file__).parents[4] / "examples" / "lumen"
CONFIRM: Final = "triage/confirm.yaml"
TRIAGE_FLOW: Final = "triage/flow.yaml"
INTAKE_FLOW: Final = "flows/intake/flow.yaml"
SUPPORT_FLOW: Final = "flows/support_case/flow.yaml"
TRIAGE: Final = FlowId("triage")
INTAKE: Final = FlowId("intake")
AUDIT: Final = FlowId("audit")
SUPPORT_CASE: Final = FlowId("support_case")
JUDGE_PANEL: Final = FlowId("judge_panel")
DATE_INPUT: Final = '- name: "today"\n  type: "Date"\n  description: "Run date"\n  from: "$run.context.date"\n'
LUMEN_DECLARATION: Final = 'context:\n- "date"\n- "tenant_id"\n'
ORDER_KEY: Final = "order:\n"


@pytest.fixture
def shop(tmp_path: Path) -> Path:
    return copy_project(FIXTURE, tmp_path)


@pytest.fixture
def layout(tmp_path: Path) -> Path:
    return copy_project(LAYOUT, tmp_path)


def append(root: Path, relative: str, text: str) -> None:
    target = root / relative
    target.write_text(target.read_text(encoding="utf-8") + text, encoding="utf-8")


def declare(root: Path, relative: str, keys: str) -> None:
    target = root / relative
    source = target.read_text(encoding="utf-8")
    assert source.count(ORDER_KEY) == 1
    target.write_text(source.replace(ORDER_KEY, f"{keys}{ORDER_KEY}"), encoding="utf-8")


def plan_of(root: Path) -> CompiledProject:
    report = check_project(root)
    assert report.ok, report.diagnostics
    return compile_project(report)


def codes(root: Path) -> list[DiagnosticCode]:
    return [item.code for item in check_project(root).diagnostics]


def test_compiler_infers_keys_from_node_bindings(shop: Path) -> None:
    append(shop, CONFIRM, DATE_INPUT)

    assert plan_of(shop).flow(TRIAGE).context == (RunContextKey.DATE,)


def test_flow_without_context_bindings_publishes_no_keys(shop: Path) -> None:
    assert plan_of(shop).flow(TRIAGE).context == ()


def test_declaration_alone_is_kept_and_reported(shop: Path) -> None:
    append(shop, CONFIRM, DATE_INPUT)
    declare(shop, TRIAGE_FLOW, 'context:\n- "locale"\n')

    report = check_project(shop)
    unused = [item for item in report.diagnostics if item.code is DiagnosticCode.W_CONTEXT_KEY_UNUSED]

    assert report.ok
    assert [(item.file, item.path) for item in unused] == [(TRIAGE_FLOW, ("context", 0))]
    assert plan_of(shop).flow(TRIAGE).context == (RunContextKey.DATE, RunContextKey.LOCALE)


def test_binding_to_an_unknown_context_key_stays_an_error(shop: Path) -> None:
    append(shop, CONFIRM, DATE_INPUT.replace("$run.context.date", "$run.context.weather"))

    assert DiagnosticCode.E_REF_SYNTAX in codes(shop)


def test_caller_inherits_the_keys_of_the_flow_it_calls(layout: Path) -> None:
    declare(layout, INTAKE_FLOW, 'context:\n- "tenant_id"\n')

    plan = plan_of(layout)

    assert plan.flow(INTAKE).context == (RunContextKey.TENANT_ID,)
    assert plan.flow(AUDIT).context == (RunContextKey.TENANT_ID,)


def test_lumen_publishes_the_keys_its_nodes_read() -> None:
    plan = plan_of(LUMEN)

    assert plan.flow(SUPPORT_CASE).context == (RunContextKey.DATE, RunContextKey.TENANT_ID)
    assert plan.flow(JUDGE_PANEL).context == ()


def test_lumen_keys_are_inferred_without_the_declaration(tmp_path: Path) -> None:
    root = copy_project(LUMEN, tmp_path)
    flow = root / SUPPORT_FLOW
    source = flow.read_text(encoding="utf-8")
    assert source.count(LUMEN_DECLARATION) == 1
    flow.write_text(source.replace(LUMEN_DECLARATION, ""), encoding="utf-8")

    plan = plan_of(root)

    assert plan.flow(SUPPORT_CASE).context == (RunContextKey.DATE, RunContextKey.TENANT_ID)


def test_tree_names_the_context_keys_of_a_flow(shop: Path, capsys: pytest.CaptureFixture[str]) -> None:
    append(shop, CONFIRM, DATE_INPUT)

    assert main(["tree", str(shop)]) == 0
    assert "run context: date" in capsys.readouterr().out


def test_simulation_supplies_only_the_keys_of_the_flow() -> None:
    supplied = simulation_context((RunContextKey.DATE, RunContextKey.TENANT_ID))

    assert supplied is not None
    assert set(supplied.model_dump(exclude_none=True)) == {"date", "tenant_id"}
    assert simulation_context(()) is None


def support_case_flow() -> CompiledFlow:
    return plan_of(LUMEN).flow(SUPPORT_CASE)


def test_a_run_without_the_keys_the_flow_needs_is_refused() -> None:
    flow = support_case_flow()
    spec = RunSpec(flow_id=SUPPORT_CASE, context=RunContext(date=None, tenant_id=None))

    with pytest.raises(EngineError) as refused:
        require_context(flow, spec)

    paths = [".".join(str(part) for part in problem.path) for problem in refused.value.problems]
    assert refused.value.code == "CONTEXT_MISSING"
    assert paths == ["context.date", "context.tenant_id"]
    assert all(problem.code == "CONTEXT_KEY_MISSING" for problem in refused.value.problems)


def test_a_run_with_every_key_passes_the_guard() -> None:
    flow = support_case_flow()
    context = RunContext.model_validate({"date": "2026-09-18", "tenant_id": "lumen"})

    assert missing_context_keys(flow, RunSpec(flow_id=SUPPORT_CASE, context=context)) == ()
    require_context(flow, RunSpec(flow_id=SUPPORT_CASE, context=context))
