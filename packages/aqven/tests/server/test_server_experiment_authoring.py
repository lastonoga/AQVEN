from collections.abc import Iterator
from pathlib import Path
from typing import Final

import pytest
from fastapi.testclient import TestClient
from pydantic import JsonValue
from server_fakes import AUTH, SERVER_BASE, FakeEngine, MemorySettings, copy_fixture

from aqven.check import check_project
from aqven.client.ids import new_client_op_id
from aqven.loader import NODE_ID_SEPARATOR, file_hash
from aqven.policies import BUILTINS, Slot
from aqven.series.split import splits_of
from aqven.server import ServerOptions, create_app
from aqven.server.views.evaluator_options import EVALUATOR_TEXTS
from aqven.spec import DatasetId, ExperimentId, ExperimentSpec, SeriesSplit

PACKAGE: Final = "dataset_shop"
DATASET: Final = "intake_cases"
EXPERIMENT: Final = "reply_agents"
EXPERIMENT_PATH: Final = f"experiments/{EXPERIMENT}/experiment.yaml"
NEW_EXPERIMENT: Final = "terse_replies"
STALE_HASH: Final = f"sha256-{'0' * 64}"

INTAKE_CASES: Final = """apiVersion: "aqven/v1"
kind: "Dataset"
flow: "intake"
cases:
- name: "question"
  inputs:
    text: "Where is my order?"
  expected_output:
    text: "It ships today."
  tags:
    topic: "orders"
    tone: "calm"
- name: "refund"
  inputs:
    text: "How do I get a refund?"
  expected_output:
    text: "Reply to the receipt."
  tags:
    topic: "money"
    tone: "calm"
- name: "warranty"
  inputs:
    text: "Is the lamp under warranty?"
  expected_output:
    text: "Yes, for two years."
  tags:
    topic: "orders"
    tone: "angry"
- name: "delay"
  inputs:
    text: "Why is my parcel late?"
  expected_output:
    text: "The courier is delayed."
  tags:
    topic: "orders"
    tone: "angry"
"""

WRITER_ALT: Final = """apiVersion: "aqven/v1"
kind: "Agent"
description: "Answers customer questions in two short sentences"
model: "openai:gpt-5.4-nano"
"""

WRAPPER_FLOW: Final = """apiVersion: "aqven/v1"
kind: "Flow"
description: "Answer through the intake flow"
input: "Note"
output: "Note"
returns:
- name: "text"
  from: "$inner.out.text"
order:
- "inner"
"""

INNER_CALL: Final = """apiVersion: "aqven/v1"
kind: "Node"
node: "call"
description: "Run the intake flow"
flow: "intake"
in:
- name: "text"
  from: "$input.text"
"""

EXPERIMENT_YAML: Final = """apiVersion: "aqven/v1"
kind: "Experiment"
description: "the nano writer answers as well as the mini writer"
subject:
  flow: "intake"
varies:
  what: "agent"
  nodes:
  - "reply"
cases:
  dataset: "intake_cases"
  tags:
    topic: "orders"
variants:
- id: "base"
- id: "alt"
  nodes:
    reply: "writer_alt"
question:
  kind: "look"
"""

TERSE_PROMPT: Final = "Answer in one sentence: {{ question }}\n{{ output_format }}\n"

NEW_SPEC: Final[dict[str, JsonValue]] = {
    "apiVersion": "aqven/v1",
    "kind": "Experiment",
    "description": "a one-sentence prompt answers as often as the written prompt",
    "subject": {"flow": "intake"},
    "varies": {"what": "prompt", "nodes": ["reply"]},
    "cases": {"dataset": DATASET, "tags": {"topic": "orders"}},
    "variants": [{"id": "as_written"}, {"id": "terse", "nodes": {"reply": "terse"}}],
    "checks": [{"id": "matches", "kind": "binary", "use": "expected", "with": {"fields": ["text"]}}],
    "question": {
        "kind": "compare",
        "baseline": "as_written",
        "candidate": "terse",
        "primary": "success_rate",
        "margin": 0.05,
    },
    "plan": {"cases": 3, "repeats": 2},
}


@pytest.fixture
def authoring_project(tmp_path: Path) -> Path:
    root = copy_fixture("dataset_shop", tmp_path)
    files = {
        f"datasets/{DATASET}.yaml": INTAKE_CASES,
        "agents/writer_alt.yaml": WRITER_ALT,
        "flows/wrapper/flow.yaml": WRAPPER_FLOW,
        "flows/wrapper/nodes/inner.node.yaml": INNER_CALL,
        EXPERIMENT_PATH: EXPERIMENT_YAML,
    }
    for relative, text in files.items():
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
    return root


@pytest.fixture
def authoring_client(
    authoring_project: Path, server_engine: FakeEngine, server_settings: MemorySettings, server_options: ServerOptions
) -> Iterator[TestClient]:
    app = create_app(authoring_project, server_engine, server_settings, options=server_options)
    with TestClient(app, base_url=SERVER_BASE, headers=AUTH) as client:
        yield client


def split_counts(names: tuple[str, ...]) -> dict[str, int]:
    splits = splits_of(PACKAGE, DatasetId(DATASET), list(names)).values()
    return {split.value: sum(1 for value in splits if value is split) for split in SeriesSplit}


def disk_hash(root: Path, relative: str) -> str:
    return file_hash((root / relative).read_bytes())


def cases_body(file_hash_value: str, tags: dict[str, str] | None, dataset: str = DATASET) -> dict[str, JsonValue]:
    selection: dict[str, JsonValue] = {"dataset": dataset, "tags": None if tags is None else {**tags}}
    return {"cases": selection, "expects": {"file_hash": file_hash_value}, "client_op_id": new_client_op_id()}


def create_body(
    spec: dict[str, JsonValue], prompts: dict[str, str], experiment_id: str = NEW_EXPERIMENT
) -> dict[str, JsonValue]:
    written: dict[str, JsonValue] = {**prompts}
    return {"experiment_id": experiment_id, "spec": spec, "prompts": written, "client_op_id": new_client_op_id()}


def loaded_spec(root: Path, experiment_id: str) -> ExperimentSpec:
    project = check_project(root).project
    assert project is not None
    return project.experiments[ExperimentId(experiment_id)].source.spec


def test_authoring_nodes_name_nested_nodes_by_their_own_id_and_by_their_id_in_the_flow(
    server_client: TestClient,
) -> None:
    body = server_client.get("/api/research/authoring").json()

    nodes = [node for flow in body["flows"] for node in flow["nodes"]]
    nested = [node for node in nodes if node["flow_node_id"] != node["node_id"]]
    assert nested
    assert all(node["flow_node_id"].endswith(f"{NODE_ID_SEPARATOR}{node['node_id']}") for node in nested)
    assert all(NODE_ID_SEPARATOR not in node["node_id"] for node in nodes)


def test_authoring_options_list_flows_agents_datasets_checks_and_questions(authoring_client: TestClient) -> None:
    body = authoring_client.get("/api/research/authoring").json()

    flows = {flow["flow_id"]: flow for flow in body["flows"]}
    assert set(flows) == {"intake", "wrapper"}
    assert (flows["intake"]["input_type"], flows["intake"]["output_type"]) == ("Note", "Note")
    assert flows["intake"]["nodes"] == [
        {
            "node_id": "reply",
            "flow_node_id": "reply",
            "kind": "llm",
            "description": "Answer the question with this node inference",
            "agent_id": "writer",
            "inference_id": "reply",
            "calls": None,
        }
    ]
    [inner] = flows["wrapper"]["nodes"]
    assert (inner["node_id"], inner["kind"], inner["calls"], inner["agent_id"]) == ("inner", "call", "intake", None)
    assert body["agents"] == [
        {"agent_id": "writer", "model": "openai:gpt-5.4-mini"},
        {"agent_id": "writer_alt", "model": "openai:gpt-5.4-nano"},
    ]
    datasets = {dataset["dataset_id"]: dataset for dataset in body["datasets"]}
    assert set(datasets) == {DATASET, "reply_cases"}
    intake = datasets[DATASET]
    assert (intake["flow_id"], intake["total"]) == ("intake", 4)
    assert intake["splits"] == split_counts(("question", "refund", "warranty", "delay"))
    assert intake["tags"] == {
        "tone": [{"value": "angry", "count": 2}, {"value": "calm", "count": 2}],
        "topic": [{"value": "orders", "count": 3}, {"value": "money", "count": 1}],
    }
    assert (datasets["reply_cases"]["flow_id"], datasets["reply_cases"]["tags"]) == (None, {})
    assert body["question_kinds"] == ["look", "threshold", "compare", "noninferior"]
    assert body["metrics"][:2] == ["success_rate", "cost_usd"]


def test_authoring_options_offer_every_built_in_check_with_its_parameters(authoring_client: TestClient) -> None:
    evaluators = authoring_client.get("/api/research/authoring").json()["evaluators"]
    by_use = {item["use"]: item for item in evaluators}

    assert evaluators[0]["use"] == "expected"
    assert set(by_use) == set(BUILTINS[Slot.EVALUATOR]) == set(EVALUATOR_TEXTS)
    assert by_use["expected"]["needs_params"] is False
    assert by_use["expected"]["params"] == [{"name": "fields", "required": False}]
    assert by_use["expected"]["kind"] == "binary"
    assert by_use["max_words"]["needs_params"] is True
    assert by_use["max_words"]["params"] == [{"name": "field", "required": True}, {"name": "max", "required": True}]
    assert (by_use["cost_usd"]["kind"], by_use["cost_usd"]["params"]) == ("continuous", [])
    assert all(item["description"] for item in evaluators)


def test_authoring_options_narrow_datasets_to_the_subject_flow(authoring_client: TestClient) -> None:
    body = authoring_client.get("/api/research/authoring", params={"flow": "intake"}).json()

    assert [dataset["dataset_id"] for dataset in body["datasets"]] == [DATASET]
    assert {flow["flow_id"] for flow in body["flows"]} == {"intake", "wrapper"}


def test_case_count_follows_the_tags(authoring_client: TestClient) -> None:
    counted = authoring_client.post(
        "/api/research/authoring/count", json={"dataset_id": DATASET, "tags": {"topic": "orders", "tone": "angry"}}
    )
    everything = authoring_client.post("/api/research/authoring/count", json={"dataset_id": DATASET})

    assert counted.status_code == 200
    assert counted.json() == {"selected": 2, "total": 4, "splits": split_counts(("warranty", "delay"))}
    assert everything.json()["selected"] == 4
    missing = authoring_client.post("/api/research/authoring/count", json={"dataset_id": "absent"})
    assert (missing.status_code, missing.json()["code"]) == (404, "NOT_FOUND")


def test_the_file_route_gives_the_hash_the_cases_write_expects(
    authoring_client: TestClient, authoring_project: Path
) -> None:
    detail = authoring_client.get(f"/api/experiments/{EXPERIMENT}").json()

    listed = authoring_client.get(f"/api/files/{detail['files']['spec']}").json()

    assert listed["file_hash"] == disk_hash(authoring_project, EXPERIMENT_PATH)


def test_cases_put_rewrites_the_selection_canonically_and_keeps_the_rest(
    authoring_client: TestClient, authoring_project: Path
) -> None:
    before = loaded_spec(authoring_project, EXPERIMENT)
    body = cases_body(disk_hash(authoring_project, EXPERIMENT_PATH), {"topic": "money"})

    response = authoring_client.put(f"/api/experiments/{EXPERIMENT}/cases", json=body)

    assert response.status_code == 200
    written = response.json()
    assert (written["file"], written["file_hash"]) == (EXPERIMENT_PATH, disk_hash(authoring_project, EXPERIMENT_PATH))
    assert written["diagnostics"] == []
    text = (authoring_project / EXPERIMENT_PATH).read_text(encoding="utf-8")
    assert 'cases:\n  dataset: "intake_cases"\n  tags:\n    topic: "money"\n' in text
    after = loaded_spec(authoring_project, EXPERIMENT)
    assert after.cases.tags == {"topic": "money"}
    assert after.model_copy(update={"cases": before.cases}) == before
    detail = authoring_client.get(f"/api/experiments/{EXPERIMENT}").json()
    assert detail["cases"]["selected"] == 1
    assert authoring_client.get(f"/api/files/{EXPERIMENT_PATH}").json()["file_hash"] == written["file_hash"]


def test_cases_put_without_tags_drops_the_filter_and_replays_by_operation_id(
    authoring_client: TestClient, authoring_project: Path
) -> None:
    body = cases_body(disk_hash(authoring_project, EXPERIMENT_PATH), None)

    first = authoring_client.put(f"/api/experiments/{EXPERIMENT}/cases", json=body)
    again = authoring_client.put(f"/api/experiments/{EXPERIMENT}/cases", json=body)

    assert (first.status_code, again.status_code) == (200, 200)
    assert again.json()["file_hash"] == first.json()["file_hash"]
    assert "tags" not in (authoring_project / EXPERIMENT_PATH).read_text(encoding="utf-8")
    assert loaded_spec(authoring_project, EXPERIMENT).cases.tags is None


def test_cases_put_on_a_changed_file_is_stale_and_writes_nothing(
    authoring_client: TestClient, authoring_project: Path
) -> None:
    original = (authoring_project / EXPERIMENT_PATH).read_bytes()

    response = authoring_client.put(f"/api/experiments/{EXPERIMENT}/cases", json=cases_body(STALE_HASH, None))

    assert response.status_code == 412
    error = response.json()
    assert error["code"] == "STALE_FILE"
    assert error["conflict"] == {
        "path": EXPERIMENT_PATH,
        "your_hash": STALE_HASH,
        "current_hash": file_hash(original),
    }
    assert (authoring_project / EXPERIMENT_PATH).read_bytes() == original


def test_cases_put_to_an_unknown_experiment_is_not_found(authoring_client: TestClient) -> None:
    response = authoring_client.put("/api/experiments/absent/cases", json=cases_body(STALE_HASH, None))

    assert (response.status_code, response.json()["code"]) == (404, "NOT_FOUND")


def test_cases_put_naming_an_unknown_dataset_is_refused_with_its_diagnostics(
    authoring_client: TestClient, authoring_project: Path
) -> None:
    original = (authoring_project / EXPERIMENT_PATH).read_bytes()
    body = cases_body(file_hash(original), None, dataset="absent")

    response = authoring_client.put(f"/api/experiments/{EXPERIMENT}/cases", json=body)

    assert response.status_code == 422
    error = response.json()
    assert error["code"] == "BLOCKING_PROBLEMS"
    assert error["problems"]
    assert all(problem["path"][0] == EXPERIMENT_PATH for problem in error["problems"])
    assert (authoring_project / EXPERIMENT_PATH).read_bytes() == original


def test_experiment_create_writes_the_spec_and_its_prompts(
    authoring_client: TestClient, authoring_project: Path
) -> None:
    response = authoring_client.post("/api/experiments", json=create_body(NEW_SPEC, {"terse": TERSE_PROMPT}))

    assert response.status_code == 201
    created = response.json()
    spec_path = f"experiments/{NEW_EXPERIMENT}/experiment.yaml"
    assert (created["experiment_id"], created["file"]) == (NEW_EXPERIMENT, spec_path)
    assert created["file_hash"] == disk_hash(authoring_project, spec_path)
    assert all(item["severity"] != "error" for item in created["diagnostics"])
    prompt = authoring_project / "experiments" / NEW_EXPERIMENT / "prompts" / "terse.md"
    assert prompt.read_text(encoding="utf-8") == TERSE_PROMPT
    assert loaded_spec(authoring_project, NEW_EXPERIMENT) == ExperimentSpec.model_validate(NEW_SPEC)
    detail = authoring_client.get(f"/api/experiments/{NEW_EXPERIMENT}")
    assert detail.status_code == 200
    assert [prompt["name"] for prompt in detail.json()["prompts"]] == ["terse"]


def test_experiment_create_writes_block_style_yaml_with_double_quotes(
    authoring_client: TestClient, authoring_project: Path
) -> None:
    authoring_client.post("/api/experiments", json=create_body(NEW_SPEC, {"terse": TERSE_PROMPT}))

    text = (authoring_project / "experiments" / NEW_EXPERIMENT / "experiment.yaml").read_text(encoding="utf-8")

    assert text.startswith('apiVersion: "aqven/v1"\nkind: "Experiment"\ndescription: ')
    assert 'variants:\n- id: "as_written"\n- id: "terse"\n  nodes:\n    reply: "terse"\n' in text
    assert "{" not in text
    assert "archived" not in text


def test_experiment_create_replays_by_operation_id(authoring_client: TestClient) -> None:
    body = create_body(NEW_SPEC, {"terse": TERSE_PROMPT})

    first = authoring_client.post("/api/experiments", json=body)
    again = authoring_client.post("/api/experiments", json=body)

    assert (first.status_code, again.status_code) == (201, 201)
    assert again.json()["file_hash"] == first.json()["file_hash"]


def test_experiment_create_refuses_an_existing_experiment(
    authoring_client: TestClient, authoring_project: Path
) -> None:
    original = (authoring_project / EXPERIMENT_PATH).read_bytes()

    response = authoring_client.post("/api/experiments", json=create_body(NEW_SPEC, {}, experiment_id=EXPERIMENT))

    assert response.status_code == 412
    error = response.json()
    assert (error["code"], error["conflict"]) == ("FILE_EXISTS", {"path": f"experiments/{EXPERIMENT}"})
    assert (authoring_project / EXPERIMENT_PATH).read_bytes() == original


def test_experiment_create_refuses_a_folder_already_on_disk(
    authoring_client: TestClient, authoring_project: Path
) -> None:
    (authoring_project / "experiments" / NEW_EXPERIMENT).mkdir(parents=True)

    response = authoring_client.post("/api/experiments", json=create_body(NEW_SPEC, {"terse": TERSE_PROMPT}))

    assert (response.status_code, response.json()["code"]) == (412, "FILE_EXISTS")
    assert not (authoring_project / "experiments" / NEW_EXPERIMENT / "experiment.yaml").exists()


def test_experiment_create_rejects_a_spec_the_loader_would_reject(
    authoring_client: TestClient, authoring_project: Path
) -> None:
    question: dict[str, JsonValue] = {
        "kind": "compare",
        "baseline": "terse",
        "candidate": "terse",
        "primary": "cost_usd",
    }
    spec: dict[str, JsonValue] = {**NEW_SPEC, "question": question, "arm": "old"}

    response = authoring_client.post("/api/experiments", json=create_body(spec, {"terse": TERSE_PROMPT}))

    assert response.status_code == 422
    error = response.json()
    assert error["code"] == "REQUEST_INVALID"
    paths = [problem["path"] for problem in error["problems"]]
    assert ["body", "spec", "arm"] in paths
    assert any(path[:3] == ["body", "spec", "question"] for path in paths)
    assert not (authoring_project / "experiments" / NEW_EXPERIMENT).exists()


def test_experiment_create_is_refused_when_the_project_check_breaks(
    authoring_client: TestClient, authoring_project: Path
) -> None:
    response = authoring_client.post("/api/experiments", json=create_body(NEW_SPEC, {}))

    assert response.status_code == 422
    error = response.json()
    assert error["code"] == "BLOCKING_PROBLEMS"
    assert {problem["code"] for problem in error["problems"]} == {"E_PROMPT_MISSING"}
    assert not (authoring_project / "experiments" / NEW_EXPERIMENT).exists()


def test_experiment_create_rejects_a_prompt_name_that_is_not_an_id(authoring_client: TestClient) -> None:
    response = authoring_client.post("/api/experiments", json=create_body(NEW_SPEC, {"Terse Prompt": TERSE_PROMPT}))

    assert (response.status_code, response.json()["code"]) == (422, "REQUEST_INVALID")
