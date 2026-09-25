from pathlib import Path
from typing import Final

from aqven.check import CheckReport, check_project
from aqven.codegen import generate_types
from aqven.loader import LoadedExperiment, LoadedProject
from aqven.spec import ExperimentId, VariantSpec
from aqven.testing import copy_project

FIXTURE: Final = Path(__file__).parent / "fixtures" / "fixture_shop"

AGENTS: Final = "experiments/triage_agents/experiment.yaml"
PROMPTS: Final = "experiments/triage_prompts/experiment.yaml"
ROUTES: Final = "experiments/triage_routes/experiment.yaml"
DESK: Final = "experiments/desk_flows/experiment.yaml"
SHORT_PROMPT: Final = "experiments/triage_prompts/prompts/short.md"
ROUTE_DIRECT: Final = "experiments/triage_routes/nodes/route_direct.node.yaml"
ROUTE_REVIEW: Final = "experiments/triage_routes/nodes/route_review.node.yaml"
REVIEW: Final = "experiments/triage_routes/nodes/review.node.yaml"
FAST_FLOW: Final = "experiments/desk_flows/flows/triage_fast/flow.yaml"
FAST_CLASSIFY: Final = "experiments/desk_flows/flows/triage_fast/classify.node.yaml"

MINI_AGENT: Final = """apiVersion: "aqven/v1"
kind: "Agent"
description: "The writer model at temperature zero"
model: "openai:gpt-5.4-mini"
settings:
  temperature: 0.0
"""

TRIAGE_CASES: Final = """apiVersion: "aqven/v1"
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
  expected_output:
    category: "delivery"
    summary: "The parcel is late"
"""

DESK_CASES: Final = TRIAGE_CASES.replace('flow: "triage"', 'flow: "desk"')

DESK_FLOW: Final = """apiVersion: "aqven/v1"
kind: "Flow"
description: "The help desk hands a ticket to sorting"
input: "TriageTicket"
output: "TriageResult"
returns:
- name: "category"
  from: "$sort.out.category"
- name: "summary"
  from: "$sort.out.summary"
order:
- "sort"
"""

DESK_SORT: Final = """apiVersion: "aqven/v1"
kind: "Node"
node: "call"
description: "Sorts the ticket"
flow: "triage"
in:
- name: "subject"
  from: "$input.subject"
- name: "body"
  from: "$input.body"
- name: "customer"
  from: "$input.customer"
- name: "photo"
  from: "$input.photo"
"""

AGENTS_EXPERIMENT: Final = """apiVersion: "aqven/v1"
kind: "Experiment"
description: "The writer at temperature zero sorts as well as the writer"
subject:
  flow: "triage"
varies:
  what: "agent"
  nodes:
  - "classify"
cases:
  dataset: "triage_cases"
variants:
- id: "writer"
- id: "mini"
  nodes:
    classify: "mini"
question:
  kind: "look"
"""

PROMPTS_EXPERIMENT: Final = """apiVersion: "aqven/v1"
kind: "Experiment"
description: "A short prompt sorts as well as the written one"
subject:
  flow: "triage"
varies:
  what: "prompt"
  nodes:
  - "classify"
cases:
  dataset: "triage_cases"
variants:
- id: "as_is"
- id: "short"
  nodes:
    classify: "short"
question:
  kind: "look"
"""

SHORT_PROMPT_TEXT: Final = """{% message system %}
Sort the ticket into a queue and give a one sentence rationale.
{{ output_format }}
{% endmessage %}
{% message user %}
{{ ticket.subject }}: {{ ticket.body }}
{% endmessage %}
"""

ROUTES_EXPERIMENT: Final = """apiVersion: "aqven/v1"
kind: "Experiment"
description: "Routing without the operator keeps the queues right"
subject:
  flow: "triage"
varies:
  what: "use"
  nodes:
  - "route"
cases:
  dataset: "triage_cases"
variants:
- id: "operator"
- id: "direct"
  nodes:
    route: "route_direct"
- id: "senior"
  nodes:
    route: "route_review"
question:
  kind: "look"
"""

ROUTE_DIRECT_NODE: Final = """apiVersion: "aqven/v1"
kind: "Node"
node: "switch"
description: "Every queue goes straight on"
on: "$classify.out.category"
cases:
  billing:
    bind:
    - name: "category"
      from: "$classify.out.category"
  delivery:
    bind:
    - name: "category"
      from: "$classify.out.category"
out:
- name: "category"
  type: "TriageCategory"
  description: "Final queue"
"""

ROUTE_REVIEW_NODE: Final = """apiVersion: "aqven/v1"
kind: "Node"
node: "switch"
description: "A senior operator reviews delivery tickets"
on: "$classify.out.category"
cases:
  billing:
    bind:
    - name: "category"
      from: "$classify.out.category"
  delivery:
    node: "review"
out:
- name: "category"
  type: "TriageCategory"
  description: "Final queue"
"""

REVIEW_NODE: Final = """apiVersion: "aqven/v1"
kind: "Node"
node: "human"
description: "A senior operator confirms the delivery queue"
form: "TriageReview"
assignee: "senior_operator"
timeout_seconds: 600
on_timeout:
  policy: "default"
  value:
    category: "delivery"
in:
- name: "ticket"
  type: "TriageTicket"
  description: "The ticket"
  from: "$input"
"""

DESK_EXPERIMENT: Final = """apiVersion: "aqven/v1"
kind: "Experiment"
description: "Fast sorting matches full sorting at the help desk"
subject:
  flow: "desk"
varies:
  what: "flow"
  nodes:
  - "sort"
cases:
  dataset: "desk_cases"
variants:
- id: "full"
- id: "fast"
  nodes:
    sort: "triage_fast"
question:
  kind: "look"
"""

FAST_FLOW_YAML: Final = """apiVersion: "aqven/v1"
kind: "Flow"
description: "Sorting without the operator"
input: "TriageTicket"
output: "TriageResult"
returns:
- name: "category"
  from: "$classify.out.category"
- name: "summary"
  from: "$summarize.out.summary"
order:
- "classify"
- "summarize"
"""

FAST_CLASSIFY_NODE: Final = """apiVersion: "aqven/v1"
kind: "Node"
node: "llm"
description: "Picks the queue"
inference: "classify"
agent: "writer"
in:
- name: "ticket"
  from: "$input"
"""

FAST_SUMMARIZE_NODE: Final = """apiVersion: "aqven/v1"
kind: "Node"
node: "code"
description: "Summarizes the ticket"
run: "fixture_shop.triage.code:summarize"
in:
- name: "ticket"
  type: "TriageTicket"
  description: "The ticket"
  from: "$input"
- name: "category"
  type: "TriageCategory"
  description: "The queue"
  from: "$classify.out.category"
out:
- name: "summary"
  type: "Text"
  description: "Short summary"
  maxLength: 200
"""

LAB_FILES: Final = {
    "shared/mini.yaml": MINI_AGENT,
    "datasets/triage_cases.yaml": TRIAGE_CASES,
    "datasets/desk_cases.yaml": DESK_CASES,
    "desk/flow.yaml": DESK_FLOW,
    "desk/sort.node.yaml": DESK_SORT,
    AGENTS: AGENTS_EXPERIMENT,
    PROMPTS: PROMPTS_EXPERIMENT,
    SHORT_PROMPT: SHORT_PROMPT_TEXT,
    ROUTES: ROUTES_EXPERIMENT,
    ROUTE_DIRECT: ROUTE_DIRECT_NODE,
    ROUTE_REVIEW: ROUTE_REVIEW_NODE,
    REVIEW: REVIEW_NODE,
    DESK: DESK_EXPERIMENT,
    FAST_FLOW: FAST_FLOW_YAML,
    FAST_CLASSIFY: FAST_CLASSIFY_NODE,
    "experiments/desk_flows/flows/triage_fast/summarize.node.yaml": FAST_SUMMARIZE_NODE,
}


def write(root: Path, relative: str, text: str) -> None:
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def replace(root: Path, relative: str, old: str, new: str) -> None:
    target = root / relative
    source = target.read_text(encoding="utf-8")
    assert source.count(old) == 1, old
    target.write_text(source.replace(old, new), encoding="utf-8")


def factor_lab(destination: Path) -> Path:
    root = copy_project(FIXTURE, destination)
    for relative, text in LAB_FILES.items():
        write(root, relative, text)
    generate_types(root)
    return root


def checked(root: Path) -> tuple[CheckReport, LoadedProject]:
    report = check_project(root)
    assert report.project is not None
    return report, report.project


def experiment(project: LoadedProject, name: str) -> LoadedExperiment:
    return project.experiments[ExperimentId(name)]


def variant(loaded: LoadedExperiment, variant_id: str) -> VariantSpec:
    return next(item for item in loaded.source.spec.variants if item.id == variant_id)
