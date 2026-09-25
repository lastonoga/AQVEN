import json
import os
from collections.abc import Iterator
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Final

import pytest
from fastapi.testclient import TestClient
from series_fakes import DONE_ID, MOMENT, SERIES_ID, FakeSeriesJobs, detail
from server_fakes import AUTH, RUN_ID, SERVER_BASE, FakeEngine, MemorySettings, copy_fixture, node_execution
from sse_frames import parse_frames

from aqven.runtime.address import node_address
from aqven.runtime.values import InlineValue
from aqven.series.model import SeriesStatus
from aqven.series.split import splits_of
from aqven.server import ServerOptions, create_app
from aqven.spec import DatasetId, SeriesSplit

EXPERIMENT: Final = "reply_quality"
DATASET: Final = "intake_cases"
CASE_NAMES: Final = ("question", "refund", "warranty", "delay")

INTAKE_CASES: Final = """apiVersion: "aqven/v1"
kind: "Dataset"
flow: "intake"
cases:
- name: "question"
  inputs:
    text: "Where is my order?"
  tags:
    topic: "orders"
- name: "refund"
  inputs:
    text: "How do I get a refund?"
  tags:
    topic: "money"
- name: "warranty"
  inputs:
    text: "Is the lamp under warranty?"
  tags:
    topic: "orders"
- name: "delay"
  inputs:
    text: "Why is my parcel late?"
  tags:
    topic: "orders"
"""

WRITER_ALT: Final = """apiVersion: "aqven/v1"
kind: "Agent"
description: "Answers customer questions in two short sentences"
model: "openai:gpt-5.4-nano"
"""

EXPERIMENT_YAML: Final = """apiVersion: "aqven/v1"
kind: "Experiment"
description: "the nano writer answers as often as the mini writer and costs less"
failure_mode: "reply_quality"
subject:
  flow: "intake"
cases:
  dataset: "intake_cases"
  tags:
    topic: "orders"
varies:
  what: "agent"
  nodes:
  - "reply"
variants:
- id: "base"
- id: "alt"
  nodes:
    reply: "writer_alt"
checks:
- id: "short"
  kind: "binary"
  use: "max_words"
  with:
    field: "$out.text"
    max: 30
- id: "tone"
  kind: "continuous"
  inference: "reply"
  agent: "writer"
question:
  kind: "compare"
  baseline: "base"
  candidate: "alt"
  primary: "success_rate"
  margin: 0.05
  guardrails:
  - metric: "cost_usd"
    margin: 0.2
    relative: true
plan:
  cases: 2
  repeats: 2
"""


LOCAL_FLOW: Final = "brief"
REPLY_NODE: Final = "flows/intake/nodes/reply/reply.node.yaml"
REPLY_INFERENCE: Final = "flows/intake/nodes/reply/reply.inference.yaml"
REPLY_PROMPT: Final = "flows/intake/nodes/reply/reply.prompt.md"

LOCAL_FLOW_YAML: Final = """apiVersion: "aqven/v1"
kind: "Flow"
description: "Draft an answer, then polish it"
input: "Note"
output: "Note"
returns:
- name: "text"
  from: "$polish.out.answer"
order:
- "draft"
- "polish"
"""

LOCAL_DRAFT: Final = """apiVersion: "aqven/v1"
kind: "Node"
node: "llm"
description: "Draft the answer"
inference: "reply"
agent: "writer"
in:
- name: "question"
  from: "$input.text"
"""

LOCAL_POLISH: Final = """apiVersion: "aqven/v1"
kind: "Node"
node: "llm"
description: "Polish the draft"
inference: "reply"
agent: "writer_alt"
in:
- name: "question"
  from: "$draft.out.answer"
"""

SHORT_REPLY: Final = """apiVersion: "aqven/v1"
kind: "Node"
node: "llm"
description: "Answer in one sentence with the nano writer"
inference: "reply"
agent: "writer_alt"
in:
- name: "question"
  from: "$input.text"
"""

TERSE_PROMPT: Final = "Answer in one sentence: {{ question }}\n{{ output_format }}\n"

EXPERIMENT_FILES: Final = {
    f"flows/{LOCAL_FLOW}/flow.yaml": LOCAL_FLOW_YAML,
    f"flows/{LOCAL_FLOW}/nodes/draft.node.yaml": LOCAL_DRAFT,
    f"flows/{LOCAL_FLOW}/nodes/polish.node.yaml": LOCAL_POLISH,
    "nodes/reply_short.node.yaml": SHORT_REPLY,
    "prompts/terse.md": TERSE_PROMPT,
}


@pytest.fixture
def research_project(tmp_path: Path) -> Path:
    root = copy_fixture("dataset_shop", tmp_path)
    (root / "datasets" / "intake_cases.yaml").write_text(INTAKE_CASES, encoding="utf-8")
    (root / "agents" / "writer_alt.yaml").write_text(WRITER_ALT, encoding="utf-8")
    folder = root / "experiments" / EXPERIMENT
    folder.mkdir(parents=True)
    (folder / "experiment.yaml").write_text(EXPERIMENT_YAML, encoding="utf-8")
    (folder / "experiment.md").write_text("Why the nano writer might be enough.\n", encoding="utf-8")
    for relative, text in EXPERIMENT_FILES.items():
        target = folder / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
    return root


@pytest.fixture
def series_jobs() -> FakeSeriesJobs:
    return FakeSeriesJobs()


@pytest.fixture
def research_client(
    research_project: Path,
    server_engine: FakeEngine,
    server_settings: MemorySettings,
    server_options: ServerOptions,
    series_jobs: FakeSeriesJobs,
) -> Iterator[TestClient]:
    app = create_app(research_project, server_engine, server_settings, options=server_options, series=series_jobs)
    with TestClient(app, base_url=SERVER_BASE, headers=AUTH) as client:
        yield client


@pytest.fixture
def bare_client(
    research_project: Path, server_engine: FakeEngine, server_settings: MemorySettings, server_options: ServerOptions
) -> Iterator[TestClient]:
    app = create_app(research_project, server_engine, server_settings, options=server_options)
    with TestClient(app, base_url=SERVER_BASE, headers=AUTH) as client:
        yield client


def test_experiment_list_carries_the_question_and_the_series_history(research_client: TestClient) -> None:
    body = research_client.get("/api/experiments").json()
    [row] = body["items"]

    assert (row["experiment_id"], row["question"], row["flow_id"]) == (EXPERIMENT, "compare", "intake")
    assert (row["baseline"], row["candidate"], row["variants"]) == ("base", "alt", ["base", "alt"])
    assert row["subject"] == {
        "kind": "flow",
        "flow_id": "intake",
        "local_flow": False,
        "from_node": None,
        "to_node": None,
    }
    assert (row["series_count"], Decimal(row["spent_usd"])) == (2, Decimal("0.14"))
    assert row["latest"]["series_id"] == DONE_ID
    assert research_client.get("/api/experiments", params={"question": "threshold"}).json()["items"] == []
    assert len(research_client.get("/api/experiments", params={"flow_id": "intake"}).json()["items"]) == 1


FILES_TIME: Final = datetime(2026, 9, 24, 12, 0, tzinfo=UTC)
NOTES_TIME: Final = datetime(2026, 9, 24, 13, 0, tzinfo=UTC)
CREATED_TIME: Final = datetime(2026, 9, 24, 9, 0, tzinfo=UTC)


def set_mtime(path: Path, moment: datetime) -> None:
    os.utime(path, (moment.timestamp(), moment.timestamp()))


def age_experiment(root: Path) -> Path:
    folder = root / "experiments" / EXPERIMENT
    for path in folder.rglob("*"):
        set_mtime(path, FILES_TIME)
    set_mtime(folder / "prompts" / "terse.md", CREATED_TIME)
    set_mtime(folder / "experiment.md", NOTES_TIME)
    return folder


def listed_row(root: Path, engine: FakeEngine, settings: MemorySettings, options: ServerOptions) -> dict[str, object]:
    app = create_app(root, engine, settings, options=options, series=FakeSeriesJobs())
    with TestClient(app, base_url=SERVER_BASE, headers=AUTH) as client:
        [row] = client.get("/api/experiments").json()["items"]
        detail_body = client.get(f"/api/experiments/{EXPERIMENT}").json()
    assert {key: detail_body[key] for key in row} == row
    return row


def moment(value: object) -> datetime:
    assert isinstance(value, str)
    return datetime.fromisoformat(value)


def test_experiment_list_says_when_an_experiment_moved_and_why_it_needs_the_owner(
    research_project: Path, server_engine: FakeEngine, server_settings: MemorySettings, server_options: ServerOptions
) -> None:
    age_experiment(research_project)

    row = listed_row(research_project, server_engine, server_settings, server_options)

    assert (moment(row["created"]), moment(row["last_activity"]), row["activity_source"]) == (
        CREATED_TIME,
        NOTES_TIME,
        "files",
    )
    assert FILES_TIME > MOMENT
    assert (row["running"], row["archived"]) == (True, False)
    assert row["attention"] == ["results_stale", "check_errors"]


def test_an_archived_experiment_still_lists_with_its_series_and_reasons(
    research_project: Path, server_engine: FakeEngine, server_settings: MemorySettings, server_options: ServerOptions
) -> None:
    folder = research_project / "experiments" / EXPERIMENT
    archived = EXPERIMENT_YAML.replace('failure_mode: "reply_quality"', 'failure_mode: "reply_quality"\narchived: true')
    (folder / "experiment.yaml").write_text(archived, encoding="utf-8")
    for path in folder.rglob("*"):
        set_mtime(path, CREATED_TIME)

    row = listed_row(research_project, server_engine, server_settings, server_options)

    assert (row["archived"], row["attention"]) == (True, ["check_errors"])
    assert (moment(row["last_activity"]), row["activity_source"]) == (MOMENT, "series")


def test_experiment_detail_resolves_variants_checks_columns_and_cases(research_client: TestClient) -> None:
    body = research_client.get(f"/api/experiments/{EXPERIMENT}").json()

    assert body["question_detail"]["kind"] == "compare"
    assert body["question_detail"]["direction"] == "higher_is_better"
    assert body["question_detail"]["guardrails"] == [
        {"metric": "cost_usd", "direction": "lower_is_better", "margin": 0.2, "relative": True}
    ]
    columns = [(column["metric"], column["role"], column["unit"]) for column in body["metrics"]]
    assert columns[:4] == [
        ("success_rate", "primary", "rate"),
        ("cost_usd", "guardrail", "usd"),
        ("short", "check", "rate"),
        ("tone", "check", "score"),
    ]
    assert [metric for metric, role, _ in columns if role == "builtin"] == [
        "cost_of_pass",
        "latency_p50_ms",
        "latency_p95_ms",
        "schema_valid_first_try",
        "infra_error_rate",
    ]
    base, alt = body["variant_details"]
    assert (alt["variant_id"], alt["role"]) == ("alt", "candidate")
    assert body["varies"] == {"what": "agent", "nodes": ["reply"]}
    assert (base["changes"], alt["changes"]) == ([], [{"node_id": "reply", "what": "agent", "value": "writer_alt"}])
    assert alt["assignments"] == [
        {"node_id": "reply", "agent": {"agent_id": "writer_alt", "model": "openai:gpt-5.4-nano"}, "overridden": True}
    ]
    assert base["assignments"] == [
        {"node_id": "reply", "agent": {"agent_id": "writer", "model": "openai:gpt-5.4-mini"}, "overridden": False}
    ]
    sources = {check["check_id"]: check["source"] for check in body["checks"]}
    assert (sources["short"]["kind"], sources["short"]["use"]) == ("builtin", "max_words")
    assert (sources["tone"]["kind"], sources["tone"]["agent"]["agent_id"]) == ("judge", "writer")
    ordered = ("question", "warranty", "delay")
    expected = splits_of("dataset_shop", DatasetId(DATASET), list(ordered))
    counts = {split.value: sum(1 for value in expected.values() if value is split) for split in SeriesSplit}
    assert body["cases"] == {
        "dataset_id": DATASET,
        "flow_id": "intake",
        "tags": {"topic": "orders"},
        "selected": 3,
        "total": 4,
        "splits": counts,
    }
    assert body["files"] == {
        "spec": f"experiments/{EXPERIMENT}/experiment.yaml",
        "notes": f"experiments/{EXPERIMENT}/experiment.md",
    }
    assert body["notes"] == "Why the nano writer might be enough.\n"
    assert body["plan"] == {"cases": 2, "repeats": 2}


def test_the_detail_lists_the_local_flows_alternatives_and_prompts_of_the_experiment(
    research_client: TestClient,
) -> None:
    body = research_client.get(f"/api/experiments/{EXPERIMENT}").json()
    folder = f"experiments/{EXPERIMENT}"

    assert body["flows"] == [
        {
            "flow_id": LOCAL_FLOW,
            "description": "Draft an answer, then polish it",
            "file": f"{folder}/flows/{LOCAL_FLOW}/flow.yaml",
            "steps": [
                {
                    "node_id": "draft",
                    "kind": "llm",
                    "agent": {"agent_id": "writer", "model": "openai:gpt-5.4-mini"},
                    "description": "Draft the answer",
                },
                {
                    "node_id": "polish",
                    "kind": "llm",
                    "agent": {"agent_id": "writer_alt", "model": "openai:gpt-5.4-nano"},
                    "description": "Polish the draft",
                },
            ],
        }
    ]
    assert body["alternatives"] == [
        {
            "alternative_id": "reply_short",
            "kind": "llm",
            "description": "Answer in one sentence with the nano writer",
            "file": f"{folder}/nodes/reply_short.node.yaml",
            "files": [
                {"role": "node", "path": f"{folder}/nodes/reply_short.node.yaml"},
                {"role": "inference", "path": REPLY_INFERENCE},
                {"role": "prompt", "path": REPLY_PROMPT},
            ],
        }
    ]
    assert body["prompts"] == [{"name": "terse", "file": f"{folder}/prompts/terse.md"}]
    assert "arms" not in body


def test_a_local_flow_serves_its_nodes_and_schemas_for_the_run_view(research_client: TestClient) -> None:
    body = research_client.get(f"/api/experiments/{EXPERIMENT}/flows/{LOCAL_FLOW}").json()

    assert (body["experiment_id"], body["flow_id"]) == (EXPERIMENT, LOCAL_FLOW)
    assert "arm_id" not in body
    assert (body["description"], body["order"]) == ("Draft an answer, then polish it", ["draft", "polish"])
    nodes = {node["node_id"]: node for node in body["nodes"]}
    assert list(nodes) == ["draft", "polish"]
    assert (nodes["draft"]["kind"], nodes["draft"]["agent"], nodes["draft"]["inference"]) == ("llm", "writer", "reply")
    assert nodes["polish"]["path"] == f"experiments/{EXPERIMENT}/flows/{LOCAL_FLOW}/nodes/polish.node.yaml"
    assert (nodes["draft"]["downstream"], nodes["polish"]["upstream"]) == (["polish"], ["draft"])
    schemas = body["schemas"]
    assert schemas["flow_id"] == LOCAL_FLOW
    assert schemas["input"]["required"] == ["text"]
    assert sorted(schemas["nodes"]) == ["draft", "polish"]
    assert "answer" in schemas["nodes"]["draft"]["out"]["properties"]


def test_a_local_flow_serves_the_prompt_of_each_llm_step(research_client: TestClient) -> None:
    prompts = research_client.get(f"/api/experiments/{EXPERIMENT}/flows/{LOCAL_FLOW}").json()["prompts"]

    assert sorted(prompts) == ["draft", "polish"]
    draft = prompts["draft"]
    assert (draft["flow_id"], draft["node_id"], draft["inference_id"]) == (LOCAL_FLOW, "draft", "reply")
    assert draft["source"]["text"] == research_client.get(f"/api/raw/{draft['path']}").text
    assert [slot["name"] for slot in draft["slots"]] == ["question"]


def test_the_detail_tells_the_slot_as_written_and_the_agents_the_factor_names(research_client: TestClient) -> None:
    body = research_client.get(f"/api/experiments/{EXPERIMENT}").json()

    assert body["slots"] == [
        {
            "node_id": "reply",
            "kind": "llm",
            "written": "writer",
            "files": [
                {"role": "node", "path": REPLY_NODE},
                {"role": "inference", "path": REPLY_INFERENCE},
                {"role": "prompt", "path": REPLY_PROMPT},
            ],
        }
    ]
    agents = {agent["agent_id"]: agent for agent in body["agents"]}
    assert list(agents) == ["writer", "writer_alt"]
    assert (agents["writer_alt"]["file"], agents["writer_alt"]["spec"]["model"]) == (
        "agents/writer_alt.yaml",
        "openai:gpt-5.4-nano",
    )
    assert agents["writer"]["spec"]["description"] == "Answers customer questions in one short sentence"
    assert agents["writer"]["instructions"] is None


def test_every_file_the_detail_names_is_served_raw(research_client: TestClient) -> None:
    body = research_client.get(f"/api/experiments/{EXPERIMENT}").json()
    named = [
        *(file["path"] for slot in body["slots"] for file in slot["files"]),
        *(file["path"] for alternative in body["alternatives"] for file in alternative["files"]),
        *(prompt["file"] for prompt in body["prompts"]),
        *(agent["file"] for agent in body["agents"]),
    ]

    assert {research_client.get(f"/api/raw/{path}").status_code for path in named} == {200}
    assert research_client.get(f"/api/raw/{body['prompts'][0]['file']}").text == TERSE_PROMPT


@pytest.mark.parametrize(
    "path",
    [
        f"/api/experiments/{EXPERIMENT}/flows/nothing",
        f"/api/experiments/nothing/flows/{LOCAL_FLOW}",
        f"/api/experiments/{EXPERIMENT}/arms/{LOCAL_FLOW}",
    ],
)
def test_an_unknown_local_flow_is_not_found(research_client: TestClient, path: str) -> None:
    response = research_client.get(path)

    assert response.status_code == 404


def test_the_file_list_knows_the_local_flows_alternatives_and_prompts_of_an_experiment(
    research_client: TestClient,
) -> None:
    folder = f"experiments/{EXPERIMENT}"
    listed = research_client.get("/api/files", params={"prefix": folder, "limit": 200}).json()["items"]
    kinds = {entry["path"]: entry["kind"] for entry in listed}

    assert kinds[f"{folder}/flows/{LOCAL_FLOW}/flow.yaml"] == "Flow"
    assert kinds[f"{folder}/flows/{LOCAL_FLOW}/nodes/draft.node.yaml"] == "Node"
    assert kinds[f"{folder}/nodes/reply_short.node.yaml"] == "Node"
    assert kinds[f"{folder}/prompts/terse.md"] == "prompt"


def test_an_unknown_experiment_is_not_found(research_client: TestClient) -> None:
    response = research_client.get("/api/experiments/nothing")

    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"


def test_the_launch_plan_and_start_go_through_the_series_service(
    research_client: TestClient, series_jobs: FakeSeriesJobs
) -> None:
    plan = research_client.post(f"/api/experiments/{EXPERIMENT}/launch-plan", json={"on": "holdout", "cases": 3})
    started = research_client.post("/api/series", json={"experiment_id": EXPERIMENT, "repeats": 2})

    assert plan.status_code == 200
    assert plan.json()["on"] == "holdout"
    assert plan.json()["recommended"]["cases"] == 60
    assert "usd" not in plan.json()
    assert series_jobs.plans[0][1].cases == 3
    assert started.status_code == 201
    assert started.json()["series_id"] == SERIES_ID
    assert started.json()["launch"]["attempts"] == 16
    request, actor = series_jobs.starts[0]
    assert (request.repeats, actor.kind) == (2, "human")


def test_start_requires_exactly_one_origin(research_client: TestClient) -> None:
    response = research_client.post("/api/series", json={"on": "dev"})

    assert response.status_code == 422
    assert response.json()["code"] == "REQUEST_INVALID"


def test_series_get_passes_the_wait_and_the_case_rows(research_client: TestClient, series_jobs: FakeSeriesJobs) -> None:
    body = research_client.get(f"/api/series/{SERIES_ID}", params={"wait_seconds": 5, "include_cases": True}).json()
    too_long = research_client.get(f"/api/series/{SERIES_ID}", params={"wait_seconds": 51})

    assert body["series"]["progress"] == {"done": 4, "total": 16}
    assert body["cases"] == []
    assert (series_jobs.gets[0].wait_seconds, series_jobs.gets[0].include_cases) == (5, True)
    assert too_long.status_code == 422
    assert research_client.get("/api/series/missing").status_code == 404


def test_series_list_and_cases(research_client: TestClient, series_jobs: FakeSeriesJobs) -> None:
    listed = research_client.get("/api/series", params={"status": "done", "experiment_id": EXPERIMENT}).json()
    cases = research_client.get(f"/api/series/{SERIES_ID}/cases", params={"failures": True})

    assert [row["series_id"] for row in listed["items"]] == [DONE_ID]
    assert series_jobs.queries[-1].status == "done"
    assert (cases.status_code, cases.json()) == (200, [])


def test_series_events_stream_until_the_series_finishes(research_client: TestClient) -> None:
    with research_client.stream("GET", f"/api/series/{SERIES_ID}/events") as response:
        text = response.read().decode()
        content_type = response.headers["content-type"]
    frames = parse_frames(text)

    assert content_type.startswith("text/event-stream")
    assert [frame.id for frame in frames] == ["1", "2", "3"]
    assert [frame.event for frame in frames] == ["series_status", "attempt_finished", "series_finished"]
    assert json.loads(frames[1].data or "{}")["spend_usd"] == "0.004"


def test_series_events_resume_from_the_cursor(research_client: TestClient, series_jobs: FakeSeriesJobs) -> None:
    resumed = parse_frames(
        research_client.get(
            f"/api/series/{SERIES_ID}/events", params={"after_seq": 0}, headers={"Last-Event-ID": "2"}
        ).text
    )
    missing = research_client.get("/api/series/missing/events")

    assert [frame.id for frame in resumed] == ["3"]
    assert series_jobs.event_reads == [2]
    assert (missing.status_code, missing.json()["code"]) == (404, "NOT_FOUND")


def test_approve_and_cancel_follow_the_series_state(research_client: TestClient, series_jobs: FakeSeriesJobs) -> None:
    approve = research_client.post(f"/api/series/{SERIES_ID}/approve")
    cancel = research_client.post(f"/api/series/{SERIES_ID}/cancel", json={"reason": "wrong cases"})
    bare_cancel = research_client.post(f"/api/series/{SERIES_ID}/cancel")
    finished = research_client.post(f"/api/series/{DONE_ID}/cancel", json={})

    assert (approve.status_code, approve.json()["code"]) == (409, "SERIES_STATE_CONFLICT")
    assert (cancel.status_code, cancel.json()["status"]) == (200, "cancelled")
    assert bare_cancel.status_code == 200
    assert [request.reason for request in series_jobs.cancels] == ["wrong cases", None]
    assert (finished.status_code, finished.json()["code"]) == (409, "SERIES_STATE_CONFLICT")


def test_approve_passes_the_new_cap_of_a_paused_series(
    research_client: TestClient, series_jobs: FakeSeriesJobs
) -> None:
    series_jobs.views[SERIES_ID] = detail(SERIES_ID, SeriesStatus.AWAITING_APPROVAL, done=4, spend=Decimal("0.91"))

    raised = research_client.post(f"/api/series/{SERIES_ID}/approve", json={"cap_usd": "2.00"})
    doubled = research_client.post(f"/api/series/{SERIES_ID}/approve")
    refused = research_client.post(f"/api/series/{SERIES_ID}/approve", json={"cap_usd": "0"})

    assert (raised.status_code, doubled.status_code, refused.status_code) == (200, 200, 422)
    assert [cap for _, _, cap in series_jobs.approvals] == [Decimal("2.00"), None]


def test_without_the_series_service_the_catalogue_reads_and_series_are_not_runnable(bare_client: TestClient) -> None:
    [row] = bare_client.get("/api/experiments").json()["items"]
    started = bare_client.post("/api/series", json={"experiment_id": EXPERIMENT})

    assert (row["series_count"], row["latest"]) == (0, None)
    assert (started.status_code, started.json()["code"]) == (409, "NOT_RUNNABLE")


def test_case_from_run_drafts_a_case_without_writing_the_dataset(
    research_client: TestClient, server_engine: FakeEngine, research_project: Path
) -> None:
    reply = node_execution(node_address("reply")).model_copy(
        update={"output_ref": InlineValue(value={"answer": "Tomorrow.", "mood": "calm"})}
    )
    server_engine.runs[RUN_ID] = server_engine.runs[RUN_ID].model_copy(
        update={"input_ref": InlineValue(value={"text": "Where is it?"}), "executions": (reply,), "order": ("reply",)}
    )
    before = (research_project / "datasets" / "intake_cases.yaml").read_bytes()

    body = research_client.post(f"/api/datasets/{DATASET}/cases/from-run", json={"run_id": RUN_ID}).json()

    assert body["case"]["name"] == f"intake_{RUN_ID[:8]}"
    assert body["case"]["inputs"] == {"text": "Where is it?"}
    assert body["case"]["node_outputs"] == {"reply": {"answer": "Tomorrow.", "mood": "calm"}}
    assert body["case"]["expected_output"] is None
    assert body["yaml"].startswith('name: "intake_')
    assert "{}" not in body["yaml"]
    assert (research_project / "datasets" / "intake_cases.yaml").read_bytes() == before


def test_case_from_run_refuses_another_flow_and_unknown_runs(
    research_client: TestClient, server_engine: FakeEngine
) -> None:
    server_engine.runs[RUN_ID] = server_engine.runs[RUN_ID].model_copy(
        update={"input_ref": InlineValue(value={"text": "a"})}
    )
    other_flow = research_client.post("/api/datasets/reply_cases/cases/from-run", json={"run_id": RUN_ID})
    unknown = research_client.post(f"/api/datasets/{DATASET}/cases/from-run", json={"run_id": "missing"})
    named = research_client.post(f"/api/datasets/{DATASET}/cases/from-run", json={"run_id": RUN_ID, "name": "mine"})

    assert (other_flow.status_code, other_flow.json()["code"]) == (422, "INPUT_INVALID")
    assert (unknown.status_code, unknown.json()["code"]) == (404, "NOT_FOUND")
    assert named.json()["case"]["name"] == "mine"
