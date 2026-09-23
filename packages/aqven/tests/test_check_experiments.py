from dataclasses import dataclass
from pathlib import Path
from typing import Final

import pytest

from aqven.check import CheckReport, check_project
from aqven.codegen import GENERATED_TYPES, generate_types
from aqven.diagnostics import DiagnosticCode, Severity
from aqven.loader import load_project
from aqven.server.views.files import declared_kinds, file_kind
from aqven.testing import copy_project

FIXTURE: Final = Path(__file__).parent / "fixtures" / "fixture_shop"

TRIAGE_EXPERIMENT: Final = "experiments/triage_agents/experiment.yaml"
JUDGE_EXPERIMENT: Final = "experiments/judge_check/experiment.yaml"
ARM_FLOW: Final = "experiments/judge_check/arms/judge/flow.yaml"
ARM_NODE: Final = "experiments/judge_check/arms/judge/nodes/judge.node.yaml"
TRIAGE_CASES: Final = "datasets/triage_cases.yaml"
JUDGE_CASES: Final = "datasets/judge_cases.yaml"
JUDGE_INFERENCE: Final = "triage/quality/triage_judge.inference.yaml"
CHECKS_CODE: Final = "triage/experiment_checks.py"

JUDGE_CASE_TYPE: Final = """apiVersion: "aqven/v1"
kind: "Type"
type: "record"
description: "A ticket subject with the queue chosen for it"
fields:
- name: "subject"
  type: "Text"
  description: "Ticket subject"
  maxLength: 200
- name: "category"
  type: "TriageCategory"
  description: "Chosen queue"
"""

JUDGE_SCORE_TYPE: Final = """apiVersion: "aqven/v1"
kind: "Type"
type: "record"
description: "The judge score of a chosen queue"
fields:
- name: "rationale"
  type: "Text"
  description: "Why the score"
  maxLength: 300
- name: "score"
  type: "Int"
  description: "Score from 1 to 5"
  minimum: 1
  maximum: 5
"""

TRIAGE_JUDGE: Final = """apiVersion: "aqven/v1"
kind: "Inference"
description: "Judges whether the chosen queue fits the ticket subject"
in:
- name: "subject"
  type: "Text"
  description: "Ticket subject"
  maxLength: 200
- name: "category"
  type: "TriageCategory"
  description: "Chosen queue"
out:
- name: "rationale"
  type: "Text"
  description: "Why the score"
  maxLength: 300
- name: "score"
  type: "Int"
  description: "Score from 1 to 5"
  minimum: 1
  maximum: 5
"""

TRIAGE_JUDGE_PROMPT: Final = """{% message system %}
Rate from 1 to 5 whether the chosen queue fits the ticket subject.
{{ output_format }}
{% endmessage %}
{% message user %}
Subject: {{ subject }}
Queue: {{ category }}
{% endmessage %}
"""

CHECKS_MODULE: Final = """from aqven.policies import EvalContext, NoParams, Verdict
from fixture_shop.types import TriageResult, TriageTicket


def summary_written(value: TriageResult, context: EvalContext[TriageTicket, TriageResult], params: NoParams) -> Verdict:
    return Verdict(passed=bool(value.summary))
"""

TRIAGE_DATASET: Final = """apiVersion: "aqven/v1"
kind: "Dataset"
flow: "triage"
cases:
- name: "late_parcel"
  inputs:
    subject: "Where is my parcel"
    body: "The order did not arrive in time"
    customer:
      name: "Anna"
      email: null
    photo: null
  tags:
    lang: "en"
  expected_output:
    category: "delivery"
    summary: "The parcel is late"
- name: "double_charge"
  inputs:
    subject: "Charged twice"
    body: "My card was charged twice for one order"
    customer:
      name: "Oleg"
      email: null
    photo: null
  tags:
    lang: "en"
  expected_output:
    category: "billing"
    summary: "A double charge"
"""

JUDGE_DATASET: Final = """apiVersion: "aqven/v1"
kind: "Dataset"
cases:
- name: "right_queue"
  inputs:
    subject: "Where is my parcel"
    category: "delivery"
  tags:
    planted: "no"
  expected_output:
    score: 5
- name: "wrong_queue"
  inputs:
    subject: "Where is my parcel"
    category: "billing"
  tags:
    planted: "yes"
  expected_output:
    score: 1
"""

TRIAGE_EXPERIMENT_YAML: Final = """apiVersion: "aqven/v1"
kind: "Experiment"
description: "The cheap agent sorts tickets as well as the writer"
subject:
  flow: "triage"
cases:
  dataset: "triage_cases"
  tags:
    lang: "en"
variants:
- id: "writer"
- id: "cheap"
  agents:
    classify: "cheap"
checks:
- id: "category_matches"
  kind: "binary"
  use: "expected"
  with:
    fields:
    - "category"
- id: "summary_written"
  kind: "binary"
  run: "@root.triage.experiment_checks:summary_written"
- id: "judge"
  kind: "ordinal"
  inference: "triage_judge"
  agent: "writer"
  validated_by: "judge_check"
question:
  kind: "noninferior"
  baseline: "writer"
  candidate: "cheap"
  primary: "category_matches"
  margin: 0.05
  guardrails:
  - metric: "cost_of_pass"
    direction: "lower_is_better"
    margin: 0.2
    relative: true
plan:
  cases: 2
  repeats: 3
"""

JUDGE_EXPERIMENT_YAML: Final = """apiVersion: "aqven/v1"
kind: "Experiment"
description: "The triage judge finds planted wrong queues"
subject:
  arm: "judge"
cases:
  dataset: "judge_cases"
variants:
- id: "writer"
checks:
- id: "agrees"
  kind: "binary"
  use: "expected"
  with:
    fields:
    - "score"
question:
  kind: "threshold"
  metric: "agrees"
  variant: "writer"
  above: 0.8
"""

ARM_FLOW_YAML: Final = """apiVersion: "aqven/v1"
kind: "Flow"
description: "The triage judge as a one-step arm"
input: "JudgeCase"
output: "JudgeScore"
returns:
- name: "rationale"
  from: "$judge.out.rationale"
- name: "score"
  from: "$judge.out.score"
order:
- "judge"
"""

ARM_NODE_YAML: Final = """apiVersion: "aqven/v1"
kind: "Node"
node: "llm"
description: "Scores the chosen queue"
inference: "triage_judge"
agent: "writer"
in:
- name: "subject"
  from: "$input.subject"
- name: "category"
  from: "$input.category"
"""

ARM_STEP: Final = "experiments/judge_check/arms/judge/nodes/verdict.node.yaml"

ARM_STEP_YAML: Final = """apiVersion: "aqven/v1"
kind: "Node"
node: "code"
description: "Reads the judge score as a pass"
run: "verdict"
in:
- name: "score"
  type: "Int"
  description: "Score from 1 to 5"
  from: "$judge.out.score"
out:
- name: "passed"
  type: "Bool"
  description: "Whether the score passes"
"""

ARM_STEP_MODULE: Final = """from fixture_shop.types import JudgeCheckJudgeVerdictOut


def verdict(score: int) -> JudgeCheckJudgeVerdictOut:
    return JudgeCheckJudgeVerdictOut(passed=score >= 4)
"""

PROJECT_FILES: Final = {
    "triage/types/judge_case.yaml": JUDGE_CASE_TYPE,
    "triage/types/judge_score.yaml": JUDGE_SCORE_TYPE,
    JUDGE_INFERENCE: TRIAGE_JUDGE,
    "triage/quality/triage_judge.prompt.md": TRIAGE_JUDGE_PROMPT,
    CHECKS_CODE: CHECKS_MODULE,
    TRIAGE_CASES: TRIAGE_DATASET,
    JUDGE_CASES: JUDGE_DATASET,
    TRIAGE_EXPERIMENT: TRIAGE_EXPERIMENT_YAML,
    JUDGE_EXPERIMENT: JUDGE_EXPERIMENT_YAML,
    "experiments/judge_check/experiment.md": "Measures the triage judge on planted wrong queues.\n",
    ARM_FLOW: ARM_FLOW_YAML,
    ARM_NODE: ARM_NODE_YAML,
}


@dataclass(frozen=True, slots=True)
class Mutation:
    file: str
    old: str
    new: str
    expected: DiagnosticCode
    at: tuple[str, tuple[str | int, ...]]


def write(root: Path, relative: str, text: str) -> None:
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def replace(root: Path, relative: str, old: str, new: str) -> None:
    target = root / relative
    source = target.read_text(encoding="utf-8")
    assert source.count(old) == 1, old
    target.write_text(source.replace(old, new), encoding="utf-8")


def located(report: CheckReport, code: DiagnosticCode) -> list[tuple[str, tuple[str | int, ...]]]:
    return [(item.file, item.path) for item in report.diagnostics if item.code is code]


@pytest.fixture
def lab(tmp_path: Path) -> Path:
    root = copy_project(FIXTURE, tmp_path)
    for relative, text in PROJECT_FILES.items():
        write(root, relative, text)
    generate_types(root)
    return root


def test_experiments_with_arms_datasets_and_checks_are_clean(lab: Path) -> None:
    report = check_project(lab)

    assert report.diagnostics == ()
    assert report.project is not None
    assert set(report.project.experiments) == {"triage_agents", "judge_check"}


MUTATIONS: Final[dict[str, Mutation]] = {
    "subject_flow_unknown": Mutation(
        TRIAGE_EXPERIMENT,
        'flow: "triage"',
        'flow: "sorting"',
        DiagnosticCode.E_FLOW_UNKNOWN,
        (TRIAGE_EXPERIMENT, ("subject", "flow")),
    ),
    "subject_arm_unknown": Mutation(
        JUDGE_EXPERIMENT,
        'arm: "judge"',
        'arm: "critic"',
        DiagnosticCode.E_ARM_UNKNOWN,
        (JUDGE_EXPERIMENT, ("subject", "arm")),
    ),
    "variant_arm_unknown": Mutation(
        JUDGE_EXPERIMENT,
        '- id: "writer"\n',
        '- id: "writer"\n- id: "critic"\n  arm: "critic"\n',
        DiagnosticCode.E_ARM_UNKNOWN,
        (JUDGE_EXPERIMENT, ("variants", 1, "arm")),
    ),
    "range_node_nested": Mutation(
        TRIAGE_EXPERIMENT,
        'flow: "triage"\n',
        'flow: "triage"\n  from: "route__confirm"\n  to: "summarize"\n',
        DiagnosticCode.E_RANGE_INVALID,
        (TRIAGE_EXPERIMENT, ("subject", "from")),
    ),
    "range_reversed": Mutation(
        TRIAGE_EXPERIMENT,
        'flow: "triage"\n',
        'flow: "triage"\n  from: "summarize"\n  to: "classify"\n',
        DiagnosticCode.E_RANGE_INVALID,
        (TRIAGE_EXPERIMENT, ("subject", "from")),
    ),
    "dataset_unknown": Mutation(
        TRIAGE_EXPERIMENT,
        'dataset: "triage_cases"',
        'dataset: "labels"',
        DiagnosticCode.E_DATASET_UNKNOWN,
        (TRIAGE_EXPERIMENT, ("cases", "dataset")),
    ),
    "dataset_without_flow_for_a_flow_subject": Mutation(
        TRIAGE_EXPERIMENT,
        'dataset: "triage_cases"\n  tags:\n    lang: "en"\n',
        'dataset: "judge_cases"\n',
        DiagnosticCode.E_DATASET_MISMATCH,
        (TRIAGE_EXPERIMENT, ("cases", "dataset")),
    ),
    "flow_dataset_for_an_arm_with_other_input": Mutation(
        JUDGE_EXPERIMENT,
        'dataset: "judge_cases"',
        'dataset: "triage_cases"',
        DiagnosticCode.E_DATASET_MISMATCH,
        (JUDGE_EXPERIMENT, ("cases", "dataset")),
    ),
    "tags_select_nothing": Mutation(
        TRIAGE_EXPERIMENT,
        'lang: "en"',
        'lang: "de"',
        DiagnosticCode.E_CASES_EMPTY,
        (TRIAGE_EXPERIMENT, ("cases", "tags")),
    ),
    "variant_id_duplicate": Mutation(
        TRIAGE_EXPERIMENT,
        '- id: "cheap"',
        '- id: "writer"',
        DiagnosticCode.E_ID_DUPLICATE,
        (TRIAGE_EXPERIMENT, ("variants", 1, "id")),
    ),
    "variant_agent_unknown": Mutation(
        TRIAGE_EXPERIMENT,
        'classify: "cheap"',
        'classify: "mystery"',
        DiagnosticCode.E_AGENT_UNKNOWN,
        (TRIAGE_EXPERIMENT, ("variants", 1, "agents", "classify")),
    ),
    "variant_agent_on_code_node": Mutation(
        TRIAGE_EXPERIMENT,
        'classify: "cheap"',
        'summarize: "cheap"',
        DiagnosticCode.E_VARIANT_INVALID,
        (TRIAGE_EXPERIMENT, ("variants", 1, "agents", "summarize")),
    ),
    "variant_agent_on_nested_human_node": Mutation(
        TRIAGE_EXPERIMENT,
        'classify: "cheap"',
        'route__confirm: "cheap"',
        DiagnosticCode.E_VARIANT_INVALID,
        (TRIAGE_EXPERIMENT, ("variants", 1, "agents", "route__confirm")),
    ),
    "variant_agent_outside_the_range": Mutation(
        TRIAGE_EXPERIMENT,
        'flow: "triage"\n',
        'flow: "triage"\n  from: "route"\n  to: "summarize"\n',
        DiagnosticCode.E_VARIANT_INVALID,
        (TRIAGE_EXPERIMENT, ("variants", 1, "agents", "classify")),
    ),
    "baseline_undeclared": Mutation(
        TRIAGE_EXPERIMENT,
        'baseline: "writer"',
        'baseline: "gpt"',
        DiagnosticCode.E_VARIANT_INVALID,
        (TRIAGE_EXPERIMENT, ("question", "baseline")),
    ),
    "threshold_variant_undeclared": Mutation(
        JUDGE_EXPERIMENT,
        'variant: "writer"',
        'variant: "gpt"',
        DiagnosticCode.E_VARIANT_INVALID,
        (JUDGE_EXPERIMENT, ("question", "variant")),
    ),
    "comparison_with_one_variant": Mutation(
        TRIAGE_EXPERIMENT,
        '- id: "cheap"\n  agents:\n    classify: "cheap"\n',
        "",
        DiagnosticCode.E_VARIANT_INVALID,
        (TRIAGE_EXPERIMENT, ("variants",)),
    ),
    "primary_metric_unknown": Mutation(
        TRIAGE_EXPERIMENT,
        'primary: "category_matches"',
        'primary: "accuracy"',
        DiagnosticCode.E_METRIC_UNKNOWN,
        (TRIAGE_EXPERIMENT, ("question", "primary")),
    ),
    "guardrail_metric_unknown": Mutation(
        TRIAGE_EXPERIMENT,
        'metric: "cost_of_pass"',
        'metric: "price"',
        DiagnosticCode.E_METRIC_UNKNOWN,
        (TRIAGE_EXPERIMENT, ("question", "guardrails", 0, "metric")),
    ),
    "threshold_metric_unknown": Mutation(
        JUDGE_EXPERIMENT,
        'metric: "agrees"',
        'metric: "accuracy"',
        DiagnosticCode.E_METRIC_UNKNOWN,
        (JUDGE_EXPERIMENT, ("question", "metric")),
    ),
    "check_id_duplicate": Mutation(
        TRIAGE_EXPERIMENT,
        'id: "summary_written"',
        'id: "category_matches"',
        DiagnosticCode.E_ID_DUPLICATE,
        (TRIAGE_EXPERIMENT, ("checks", 1, "id")),
    ),
    "check_id_is_a_series_metric": Mutation(
        TRIAGE_EXPERIMENT,
        'id: "summary_written"',
        'id: "cost_of_pass"',
        DiagnosticCode.E_ID_DUPLICATE,
        (TRIAGE_EXPERIMENT, ("checks", 1, "id")),
    ),
    "validated_by_unknown": Mutation(
        TRIAGE_EXPERIMENT,
        'validated_by: "judge_check"',
        'validated_by: "judge_planted"',
        DiagnosticCode.E_EXPERIMENT_UNKNOWN,
        (TRIAGE_EXPERIMENT, ("checks", 2, "validated_by")),
    ),
    "builtin_check_unknown": Mutation(
        TRIAGE_EXPERIMENT,
        'use: "expected"',
        'use: "equals"',
        DiagnosticCode.E_POLICY_UNKNOWN,
        (TRIAGE_EXPERIMENT, ("checks", 0, "use")),
    ),
    "expected_field_outside_the_output": Mutation(
        TRIAGE_EXPERIMENT,
        '    - "category"\n',
        '    - "queue"\n',
        DiagnosticCode.E_CHECK_PARAMS,
        (TRIAGE_EXPERIMENT, ("checks", 0, "with")),
    ),
    "expected_params_invalid": Mutation(
        TRIAGE_EXPERIMENT,
        '    fields:\n    - "category"\n',
        '    columns:\n    - "category"\n',
        DiagnosticCode.E_CHECK_PARAMS,
        (TRIAGE_EXPERIMENT, ("checks", 0, "with")),
    ),
    "code_check_typed_for_an_inference": Mutation(
        TRIAGE_EXPERIMENT,
        '"@root.triage.experiment_checks:summary_written"',
        '"fixture_shop.triage.classify:rationale_is_short"',
        DiagnosticCode.E_CODE_SIGNATURE_MISMATCH,
        (TRIAGE_EXPERIMENT, ("checks", 1, "run")),
    ),
    "code_check_unresolved": Mutation(
        TRIAGE_EXPERIMENT,
        "experiment_checks:summary_written",
        "experiment_checks:summary_missing",
        DiagnosticCode.E_CODE_REF_UNRESOLVED,
        (TRIAGE_EXPERIMENT, ("checks", 1, "run")),
    ),
    "judge_agent_unknown": Mutation(
        TRIAGE_EXPERIMENT,
        '  agent: "writer"\n  validated_by',
        '  agent: "critic"\n  validated_by',
        DiagnosticCode.E_AGENT_UNKNOWN,
        (TRIAGE_EXPERIMENT, ("checks", 2, "agent")),
    ),
    "judge_inference_unknown": Mutation(
        TRIAGE_EXPERIMENT,
        'inference: "triage_judge"',
        'inference: "grade"',
        DiagnosticCode.E_INFERENCE_UNKNOWN,
        (TRIAGE_EXPERIMENT, ("checks", 2, "inference")),
    ),
    "judge_input_outside_the_subject": Mutation(
        JUDGE_INFERENCE,
        'in:\n- name: "subject"',
        'in:\n- name: "topic"',
        DiagnosticCode.E_CHECK_PARAMS,
        (TRIAGE_EXPERIMENT, ("checks", 2, "inference")),
    ),
    "case_input_type": Mutation(
        TRIAGE_CASES,
        'subject: "Charged twice"',
        "subject: 42",
        DiagnosticCode.E_SPEC_INVALID,
        (TRIAGE_CASES, ("cases", 1, "inputs")),
    ),
    "case_input_missing_for_a_whole_flow": Mutation(
        TRIAGE_CASES,
        '    body: "My card was charged twice for one order"\n',
        "",
        DiagnosticCode.E_SPEC_INVALID,
        (TRIAGE_CASES, ("cases", 1, "inputs")),
    ),
    "arm_case_input_type": Mutation(
        JUDGE_CASES,
        'category: "billing"',
        'category: "returns"',
        DiagnosticCode.E_SPEC_INVALID,
        (JUDGE_CASES, ("cases", 1, "inputs")),
    ),
    "expected_output_missing": Mutation(
        TRIAGE_CASES,
        '  expected_output:\n    category: "billing"\n    summary: "A double charge"\n',
        "",
        DiagnosticCode.E_EXPECTED_MISSING,
        (TRIAGE_CASES, ("cases", 1, "expected_output")),
    ),
    "expected_output_lacks_a_compared_field": Mutation(
        TRIAGE_CASES,
        '    category: "billing"\n',
        "",
        DiagnosticCode.E_EXPECTED_MISSING,
        (TRIAGE_CASES, ("cases", 1, "expected_output")),
    ),
    "arm_expected_output_lacks_a_compared_field": Mutation(
        JUDGE_CASES,
        "    score: 1\n",
        '    rationale: "wrong queue"\n',
        DiagnosticCode.E_EXPECTED_MISSING,
        (JUDGE_CASES, ("cases", 1, "expected_output")),
    ),
    "case_name_duplicate": Mutation(
        TRIAGE_CASES,
        'name: "double_charge"',
        'name: "late_parcel"',
        DiagnosticCode.E_CASE_DUPLICATE,
        (TRIAGE_CASES, ("cases", 1, "name")),
    ),
    "dataset_flow_unknown": Mutation(
        TRIAGE_CASES,
        'flow: "triage"',
        'flow: "sorting"',
        DiagnosticCode.E_FLOW_UNKNOWN,
        (TRIAGE_CASES, ("flow",)),
    ),
    "arm_node_agent_unknown": Mutation(
        ARM_NODE,
        'agent: "writer"',
        'agent: "ghost"',
        DiagnosticCode.E_AGENT_UNKNOWN,
        (ARM_NODE, ("agent",)),
    ),
    "arm_node_binding_missing": Mutation(
        ARM_NODE,
        'from: "$input.category"',
        'from: "$input.queue"',
        DiagnosticCode.E_REF_MISSING,
        (ARM_NODE, ("in", 1, "from")),
    ),
    "arm_returns_type": Mutation(
        ARM_FLOW,
        'output: "JudgeScore"',
        'output: "JudgeCase"',
        DiagnosticCode.E_BINDING_TYPE,
        (ARM_FLOW, ("returns",)),
    ),
}


@pytest.mark.parametrize("name", list(MUTATIONS), ids=list(MUTATIONS))
def test_experiment_problem_is_reported(lab: Path, name: str) -> None:
    mutation = MUTATIONS[name]
    replace(lab, mutation.file, mutation.old, mutation.new)

    report = check_project(lab)

    assert mutation.at in located(report, mutation.expected), report.diagnostics
    assert not report.ok


def test_plan_larger_than_the_selected_cases_is_a_warning(lab: Path) -> None:
    replace(lab, TRIAGE_EXPERIMENT, "  cases: 2\n", "  cases: 80\n")

    report = check_project(lab)

    assert [(item.code, item.severity, item.file, item.path) for item in report.diagnostics] == [
        (DiagnosticCode.W_PLAN_EXCEEDS_CASES, Severity.WARNING, TRIAGE_EXPERIMENT, ("plan", "cases"))
    ]
    assert report.ok


def test_expected_without_fields_needs_an_expected_output_on_every_selected_case(lab: Path) -> None:
    replace(lab, TRIAGE_EXPERIMENT, '  with:\n    fields:\n    - "category"\n', "")
    replace(lab, TRIAGE_CASES, '  expected_output:\n    category: "billing"\n    summary: "A double charge"\n', "")

    report = check_project(lab)

    (problem,) = report.diagnostics
    assert (problem.code, problem.file, problem.path) == (
        DiagnosticCode.E_EXPECTED_MISSING,
        TRIAGE_CASES,
        ("cases", 1, "expected_output"),
    )
    assert problem.line == 18
    assert problem.message == (
        "experiment triage_agents: check category_matches uses the built-in expected, "
        "but in case double_charge there is no expected_output to compare with"
    )
    assert problem.hint == (
        "add expected_output to case double_charge of dataset triage_cases, or narrow cases.tags to cases that carry it"
    )


def test_expected_output_is_required_on_selected_cases_only(lab: Path) -> None:
    replace(
        lab,
        TRIAGE_CASES,
        '  tags:\n    lang: "en"\n  expected_output:\n    category: "billing"',
        '  tags:\n    lang: "de"\n  expected_output:\n    summary: "x"',
    )

    report = check_project(lab)

    assert located(report, DiagnosticCode.E_EXPECTED_MISSING) == []


def test_expected_is_not_an_inference_check_because_a_live_request_has_no_case(lab: Path) -> None:
    inference = "triage/classify.inference.yaml"
    replace(lab, inference, '- use: "not_empty"\n  with:\n    field: "$out.rationale"\n', '- use: "expected"\n')

    report = check_project(lab)

    (problem,) = report.diagnostics
    assert (problem.code, problem.file, problem.path) == (
        DiagnosticCode.E_CHECK_PARAMS,
        inference,
        ("checks", 0, "use"),
    )
    assert problem.message == (
        "built-in expected compares the output with the case expected_output and is available in experiments only: "
        "an inference check runs on live requests, which have no case"
    )


def with_arm_step(root: Path, folder: str = "experiments/judge_check") -> None:
    write(root, f"{folder}/arms/judge/nodes/verdict.node.yaml", ARM_STEP_YAML)
    write(root, f"{folder}/arms/judge/nodes/verdict.py", ARM_STEP_MODULE)
    arm_flow = f"{folder}/arms/judge/flow.yaml"
    replace(root, arm_flow, 'order:\n- "judge"\n', 'order:\n- "judge"\n- "verdict"\n')


def generated_source(root: Path) -> str:
    return (root / GENERATED_TYPES).read_text(encoding="utf-8")


def test_code_step_of_an_arm_imports_typed_models_named_after_experiment_and_arm(lab: Path) -> None:
    with_arm_step(lab)

    stale = check_project(lab)
    generate_types(lab)
    report = check_project(lab)

    assert DiagnosticCode.W_GENERATED_STALE in {item.code for item in stale.diagnostics}
    assert report.diagnostics == ()
    assert "class JudgeCheckJudgeVerdictIn(BaseModel):" in generated_source(lab)
    assert "class JudgeCheckJudgeVerdictOut(BaseModel):" in generated_source(lab)


def test_same_arm_step_in_two_experiments_gets_two_models(lab: Path) -> None:
    folder = "experiments/judge_again"
    write(lab, f"{folder}/experiment.yaml", JUDGE_EXPERIMENT_YAML)
    write(lab, f"{folder}/arms/judge/flow.yaml", ARM_FLOW_YAML)
    write(lab, f"{folder}/arms/judge/nodes/judge.node.yaml", ARM_NODE_YAML)
    with_arm_step(lab)
    with_arm_step(lab, folder)
    generate_types(lab)

    report = check_project(lab)

    assert report.diagnostics == ()
    assert "class JudgeAgainJudgeVerdictOut(BaseModel):" in generated_source(lab)
    assert "class JudgeCheckJudgeVerdictOut(BaseModel):" in generated_source(lab)


def test_arm_step_model_name_taken_by_a_type_is_reported_on_the_arm_node(lab: Path) -> None:
    with_arm_step(lab)
    write(lab, "triage/types/judge_check_judge_verdict_out.yaml", JUDGE_SCORE_TYPE)
    generate_types(lab)

    report = check_project(lab)

    assert (ARM_STEP, ()) in located(report, DiagnosticCode.E_ID_DUPLICATE)


def test_range_subject_tolerates_partial_case_inputs(lab: Path) -> None:
    replace(lab, TRIAGE_EXPERIMENT, 'flow: "triage"\n', 'flow: "triage"\n  from: "classify"\n  to: "summarize"\n')
    replace(lab, TRIAGE_CASES, '    body: "My card was charged twice for one order"\n', "")

    assert check_project(lab).diagnostics == ()


def test_partial_case_inputs_pass_a_dataset_that_no_experiment_runs_whole(lab: Path) -> None:
    replace(lab, TRIAGE_EXPERIMENT, 'dataset: "triage_cases"', 'dataset: "late_cases"')
    write(lab, "datasets/late_cases.yaml", (lab / TRIAGE_CASES).read_text(encoding="utf-8"))
    replace(lab, TRIAGE_CASES, '    body: "My card was charged twice for one order"\n', "")

    assert check_project(lab).diagnostics == ()


def test_flow_dataset_that_no_experiment_runs_is_checked_against_the_flow_input(lab: Path) -> None:
    unused = "datasets/unused_cases.yaml"
    write(lab, unused, TRIAGE_DATASET.replace('subject: "Charged twice"', "subject: 42"))

    report = check_project(lab)

    assert located(report, DiagnosticCode.E_SPEC_INVALID) == [(unused, ("cases", 1, "inputs"))]


def test_arm_with_other_output_than_the_subject_is_reported_on_the_arm(lab: Path) -> None:
    other = "experiments/judge_check/arms/strict/flow.yaml"
    write(lab, other, ARM_FLOW_YAML.replace('output: "JudgeScore"', 'output: "JudgeCase"'))
    write(lab, "experiments/judge_check/arms/strict/nodes/judge.node.yaml", ARM_NODE_YAML)

    report = check_project(lab)

    assert (other, ("output",)) in located(report, DiagnosticCode.E_DATASET_MISMATCH)
    assert (ARM_FLOW, ("output",)) not in located(report, DiagnosticCode.E_DATASET_MISMATCH)


def test_arm_id_taken_by_a_project_flow_is_reported(lab: Path) -> None:
    write(lab, "experiments/judge_check/arms/triage/flow.yaml", ARM_FLOW_YAML)
    write(lab, "experiments/judge_check/arms/triage/nodes/judge.node.yaml", ARM_NODE_YAML)

    report = check_project(lab)

    assert located(report, DiagnosticCode.E_ID_DUPLICATE) == [("experiments/judge_check/arms/triage/flow.yaml", ())]


def test_arm_diagnostics_carry_positions_and_stay_inside_the_experiment(lab: Path) -> None:
    replace(lab, ARM_NODE, 'agent: "writer"', 'agent: "ghost"')

    report = check_project(lab)

    (problem,) = report.errors
    assert (problem.file, problem.code, problem.line) == (ARM_NODE, DiagnosticCode.E_AGENT_UNKNOWN, 6)


def test_same_arm_name_in_two_experiments_is_checked_per_experiment(lab: Path) -> None:
    folder = "experiments/judge_again"
    write(lab, f"{folder}/experiment.yaml", JUDGE_EXPERIMENT_YAML)
    write(lab, f"{folder}/arms/judge/flow.yaml", ARM_FLOW_YAML)
    write(lab, f"{folder}/arms/judge/nodes/judge.node.yaml", ARM_NODE_YAML.replace('agent: "writer"', 'agent: "ghost"'))

    report = check_project(lab)

    assert located(report, DiagnosticCode.E_AGENT_UNKNOWN) == [
        (f"{folder}/arms/judge/nodes/judge.node.yaml", ("agent",))
    ]


def test_broken_experiment_keeps_its_arms_out_of_the_project_flows(lab: Path) -> None:
    replace(lab, JUDGE_EXPERIMENT, 'description: "The triage judge finds planted wrong queues"\n', "")

    report = check_project(lab)

    assert report.project is not None
    assert "judge" not in report.project.flows
    assert {item.code for item in report.diagnostics} == {DiagnosticCode.E_SPEC_INVALID}


def test_file_index_knows_experiment_and_arm_files(lab: Path) -> None:
    project = load_project(lab).project
    declared = declared_kinds(project)

    kinds = {path: file_kind(path, declared) for path in (JUDGE_EXPERIMENT, ARM_FLOW, ARM_NODE)}

    assert kinds == {JUDGE_EXPERIMENT: "Experiment", ARM_FLOW: "Flow", ARM_NODE: "Node"}
    assert file_kind("experiments/draft/experiment.yaml", {}) == "Experiment"
