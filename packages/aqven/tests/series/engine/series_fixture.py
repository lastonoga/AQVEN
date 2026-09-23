import importlib
import sys
from collections.abc import Mapping
from pathlib import Path
from typing import Final

from aqven.codegen import generate_types

PACKAGE: Final = "series_shop"
WRITER_MODEL: Final = "openai:gpt-4o-mini"
CHEAP_MODEL: Final = "openai:gpt-4.1-mini"
CRITIC_MODEL: Final = "openai:gpt-4.1-nano"
DEV_CASES: Final = ("always_1", "never_1", "sometimes_1", "plain_2")
HOLDOUT_CASES: Final = ("always_3", "plain_1")
RANGE_CASES: Final = ("range_1", "range_4")
REVIEW_CASES: Final = ("always_1",)

PROJECT: Final = f"""apiVersion: "aqven/v1"
kind: "Project"
description: "Fixture project for the series engine"
package: "{PACKAGE}"
providers:
- id: "openai"
  api_key: "ref:env/OPENAI_API_KEY"
  data_policy:
    allows_pii: true
    allows_sensitive: false
    retention: "zero"
"""

WRITER: Final = f"""apiVersion: "aqven/v1"
kind: "Agent"
description: "Labels tickets carefully"
model: "{WRITER_MODEL}"
output:
  strict: false
"""

CHEAP: Final = f"""apiVersion: "aqven/v1"
kind: "Agent"
description: "Labels tickets cheaply with prompted output"
model: "{CHEAP_MODEL}"
output:
  mode: "prompted"
"""

CRITIC: Final = f"""apiVersion: "aqven/v1"
kind: "Agent"
description: "Grades a label"
model: "{CRITIC_MODEL}"
output:
  strict: false
"""

TICKET: Final = """apiVersion: "aqven/v1"
kind: "Type"
type: "record"
description: "A support ticket"
fields:
- name: "text"
  type: "Text"
  description: "Ticket text"
  maxLength: 200
"""

LABEL: Final = """apiVersion: "aqven/v1"
kind: "Type"
type: "record"
description: "A ticket label"
fields:
- name: "label"
  type: "Text"
  description: "Label"
  maxLength: 50
"""

TRIAGE_FLOW: Final = """apiVersion: "aqven/v1"
kind: "Flow"
description: "Label a ticket and tidy the label"
input: "Ticket"
output: "Label"
returns:
- name: "label"
  from: "$tidy.out.label"
order:
- "classify"
- "tidy"
"""

CLASSIFY_NODE: Final = """apiVersion: "aqven/v1"
kind: "Node"
node: "llm"
description: "Label the ticket"
agent: "writer"
in:
- name: "text"
  from: "$input.text"
"""

CLASSIFY_INFERENCE: Final = """apiVersion: "aqven/v1"
kind: "Inference"
description: "One label for a support ticket"
in:
- name: "text"
  type: "Text"
  description: "Ticket text"
  maxLength: 200
out:
- name: "label"
  type: "Text"
  description: "Label"
  maxLength: 50
"""

CLASSIFY_PROMPT: Final = """Label the support ticket.
<ticket>{{ text }}</ticket>
{{ output_format }}
"""

TIDY_NODE: Final = """apiVersion: "aqven/v1"
kind: "Node"
node: "code"
description: "Tidy the label"
run: "tidy"
in:
- name: "label"
  type: "Text"
  description: "Raw label"
  from: "$classify.out.label"
out:
- name: "label"
  type: "Text"
  description: "Tidy label"
  maxLength: 50
"""

TIDY_CODE: Final = f"""from {PACKAGE}.types import TriageTidyOut


def tidy(label: str) -> TriageTidyOut:
    return TriageTidyOut(label=label.strip())
"""

REVIEW_FLOW: Final = """apiVersion: "aqven/v1"
kind: "Flow"
description: "Label a ticket and let an operator confirm it"
input: "Ticket"
output: "Label"
returns:
- name: "label"
  from: "$confirm.out.label"
order:
- "sort"
- "confirm"
"""

SORT_NODE: Final = """apiVersion: "aqven/v1"
kind: "Node"
node: "llm"
description: "Label the ticket before review"
agent: "writer"
inference: "classify"
in:
- name: "text"
  from: "$input.text"
"""

CONFIRM_NODE: Final = """apiVersion: "aqven/v1"
kind: "Node"
node: "human"
description: "An operator confirms the label"
form: "Label"
assignee: "operator"
timeout_seconds: 3600
on_timeout:
  policy: "fail"
in:
- name: "label"
  type: "Text"
  description: "Proposed label"
  from: "$sort.out.label"
"""

GRADE_INFERENCE: Final = """apiVersion: "aqven/v1"
kind: "Inference"
description: "Grades whether a label fits a ticket"
in:
- name: "text"
  type: "Text"
  description: "Ticket text"
  maxLength: 200
- name: "label"
  type: "Text"
  description: "Label"
  maxLength: 50
out:
- name: "score"
  type: "Float"
  description: "Fit from 0 to 1"
  minimum: 0
  maximum: 1
- name: "rationale"
  type: "Text"
  description: "Why the score"
  maxLength: 200
"""

GRADE_PROMPT: Final = """Grade the label of the ticket.
<ticket>{{ text }}</ticket>
<label>{{ label }}</label>
{{ output_format }}
"""


def case_yaml(name: str, text: str, expected: str | None, node_label: str | None = None) -> str:
    expected_block = f'\n  expected_output:\n    label: "{expected}"' if expected is not None else ""
    outputs_block = f'\n  node_outputs:\n    classify:\n      label: "{node_label}"' if node_label is not None else ""
    return f'- name: "{name}"\n  inputs:\n    text: "{text}"{expected_block}{outputs_block}\n'


def dataset(flow: str, cases: str) -> str:
    return f'apiVersion: "aqven/v1"\nkind: "Dataset"\nflow: "{flow}"\ncases:\n{cases}'


TRIAGE_CASES: Final = dataset(
    "triage",
    "".join(
        (
            case_yaml("always_1", "always right", "ok"),
            case_yaml("never_1", "never right", "ok"),
            case_yaml("sometimes_1", "sometimes right", "ok"),
            case_yaml("plain_2", "plain always", "ok"),
            case_yaml("always_3", "always right", "ok"),
            case_yaml("plain_1", "plain always", "ok"),
        )
    ),
)

RANGE_DATASET: Final = dataset(
    "triage",
    "".join(
        (
            case_yaml("range_1", "always right", "ok", node_label=" ok "),
            case_yaml("range_4", "never right", "ok", node_label=" bad "),
        )
    ),
)

REVIEW_DATASET: Final = dataset("review", case_yaml("always_1", "always right", "ok"))

AGENTS_EXPERIMENT: Final = """apiVersion: "aqven/v1"
kind: "Experiment"
description: "The cheap agent labels tickets as well as the writer"
subject:
  flow: "triage"
cases:
  dataset: "triage_cases"
variants:
- id: "writer"
- id: "cheap"
  agents:
    classify: "cheap"
checks:
- id: "matches"
  kind: "binary"
  use: "expected"
  with:
    fields:
    - "label"
- id: "grade"
  kind: "continuous"
  inference: "grade"
  agent: "critic"
question:
  kind: "noninferior"
  baseline: "writer"
  candidate: "cheap"
  primary: "matches"
  margin: 0.1
plan:
  cases: 4
  repeats: 3
"""

RANGE_EXPERIMENT: Final = """apiVersion: "aqven/v1"
kind: "Experiment"
description: "Tidying keeps the recorded label"
subject:
  flow: "triage"
  from: "tidy"
  to: "tidy"
cases:
  dataset: "range_cases"
variants:
- id: "current"
checks:
- id: "matches"
  kind: "binary"
  use: "expected"
  with:
    fields:
    - "label"
question:
  kind: "look"
"""

ARM_EXPERIMENT: Final = """apiVersion: "aqven/v1"
kind: "Experiment"
description: "One labelling step labels tickets"
subject:
  arm: "solo"
cases:
  dataset: "triage_cases"
variants:
- id: "writer"
- id: "cheap"
  agents:
    answer: "cheap"
checks:
- id: "matches"
  kind: "binary"
  use: "expected"
  with:
    fields:
    - "label"
question:
  kind: "threshold"
  metric: "matches"
  above: 0.5
  margin: 0.05
plan:
  repeats: 1
"""

SOLO_FLOW: Final = """apiVersion: "aqven/v1"
kind: "Flow"
description: "Label a ticket in one step"
input: "Ticket"
output: "Label"
returns:
- name: "label"
  from: "$answer.out.label"
order:
- "answer"
"""

SOLO_NODE: Final = """apiVersion: "aqven/v1"
kind: "Node"
node: "llm"
description: "Label the ticket in one step"
agent: "writer"
inference: "classify"
in:
- name: "text"
  from: "$input.text"
"""

BROKEN_CHECK_CODE: Final = f"""from aqven.policies import EvalContext, NoParams, Verdict
from {PACKAGE}.types import Label, Ticket


def explode(value: Label, context: EvalContext[Ticket, Label], params: NoParams) -> Verdict:
    raise RuntimeError("the scorer broke")
"""

BROKEN_EXPERIMENT: Final = """apiVersion: "aqven/v1"
kind: "Experiment"
description: "A scorer that raises makes the attempt an infrastructure error"
subject:
  flow: "triage"
cases:
  dataset: "triage_cases"
variants:
- id: "writer"
checks:
- id: "explodes"
  kind: "binary"
  run: "@root.quality.checks:explode"
question:
  kind: "look"
plan:
  cases: 1
"""

FILES: Final[Mapping[str, str]] = {
    "aqven.yaml": PROJECT,
    "__init__.py": "",
    "agents/writer.yaml": WRITER,
    "agents/cheap.yaml": CHEAP,
    "agents/critic.yaml": CRITIC,
    "types/ticket.yaml": TICKET,
    "types/label.yaml": LABEL,
    "flows/__init__.py": "",
    "flows/triage/__init__.py": "",
    "flows/triage/flow.yaml": TRIAGE_FLOW,
    "flows/triage/nodes/classify/classify.node.yaml": CLASSIFY_NODE,
    "flows/triage/nodes/classify/classify.inference.yaml": CLASSIFY_INFERENCE,
    "flows/triage/nodes/classify/classify.prompt.md": CLASSIFY_PROMPT,
    "flows/triage/nodes/__init__.py": "",
    "flows/triage/nodes/tidy/__init__.py": "",
    "flows/triage/nodes/tidy/tidy.node.yaml": TIDY_NODE,
    "flows/triage/nodes/tidy/tidy.py": TIDY_CODE,
    "flows/review/flow.yaml": REVIEW_FLOW,
    "flows/review/nodes/sort.node.yaml": SORT_NODE,
    "flows/review/nodes/confirm.node.yaml": CONFIRM_NODE,
    "quality/grade.inference.yaml": GRADE_INFERENCE,
    "quality/grade.prompt.md": GRADE_PROMPT,
    "quality/__init__.py": "",
    "quality/checks.py": BROKEN_CHECK_CODE,
    "experiments/triage_broken/experiment.yaml": BROKEN_EXPERIMENT,
    "datasets/triage_cases.yaml": TRIAGE_CASES,
    "datasets/range_cases.yaml": RANGE_DATASET,
    "datasets/review_cases.yaml": REVIEW_DATASET,
    "experiments/triage_agents/experiment.yaml": AGENTS_EXPERIMENT,
    "experiments/triage_range/experiment.yaml": RANGE_EXPERIMENT,
    "experiments/triage_solo/experiment.yaml": ARM_EXPERIMENT,
    "experiments/triage_solo/arms/solo/flow.yaml": SOLO_FLOW,
    "experiments/triage_solo/arms/solo/nodes/answer.node.yaml": SOLO_NODE,
}


def forget_package(parent: Path) -> None:
    stale = [name for name in sys.modules if name == PACKAGE or name.startswith(f"{PACKAGE}.")]
    for name in stale:
        del sys.modules[name]
    sys.path[:] = [entry for entry in sys.path if not (Path(entry) / PACKAGE).is_dir() or Path(entry) == parent]
    importlib.invalidate_caches()


def write_project(parent: Path) -> Path:
    forget_package(parent.resolve())
    root = parent / PACKAGE
    for relative, text in FILES.items():
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
    generated = generate_types(root)
    assert generated.project is not None, generated.diagnostics
    return root
