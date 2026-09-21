import time
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from server_fakes import AUTH, SERVER_BASE, FakeEngine, MemorySettings, copy_fixture

from aqven.server import ServerOptions, create_app
from aqven.server.views.dataset_batches import SqliteDatasetBatchStore


@pytest.fixture
def eval_project(tmp_path: Path) -> Path:
    return copy_fixture("evals/eval_shop", tmp_path)


@pytest.fixture
def eval_client(
    eval_project: Path,
    server_engine: FakeEngine,
    server_settings: MemorySettings,
    server_options: ServerOptions,
) -> Iterator[TestClient]:
    app: FastAPI = create_app(eval_project, server_engine, server_settings, options=server_options)
    with TestClient(app, base_url=SERVER_BASE, headers=AUTH) as client:
        yield client


def test_evals_are_listed_from_the_project_files(eval_client: TestClient) -> None:
    body = eval_client.get("/api/evals").json()
    (row,) = body["items"]

    assert row["eval_id"] == "reply_quality"
    assert row["path"] == "evals/intake/reply_quality.yaml"
    assert (row["inference"], row["agent"], row["dataset"]) == ("reply", "writer", "reply_cases")
    assert row["scorers"] == ["filled", "brief", "grade", "cost_usd"]
    assert (row["has_gate"], row["has_optimization"]) == (True, False)


def test_a_single_eval_and_an_unknown_one(eval_client: TestClient) -> None:
    found = eval_client.get("/api/evals/reply_quality")
    missing = eval_client.get("/api/evals/nothing")

    assert found.status_code == 200 and found.json()["eval_id"] == "reply_quality"
    assert missing.status_code == 404 and missing.json()["code"] == "NOT_FOUND"


def test_datasets_carry_case_counts_splits_and_users(eval_client: TestClient) -> None:
    body = eval_client.get("/api/datasets").json()
    (row,) = body["items"]

    assert (row["dataset_id"], row["cases"]) == ("reply_cases", 3)
    assert row["splits"] == {"test": 3}
    assert row["used_by"] == ["reply_quality"]
    assert eval_client.get("/api/datasets/reply_cases").json() == row
    assert eval_client.get("/api/datasets/nothing").status_code == 404


def test_dataset_case_pages_do_not_skip_file_ordered_cases(eval_client: TestClient) -> None:
    names: list[str] = []
    cursor: str | None = None
    while True:
        response = eval_client.get("/api/datasets/reply_cases/cases", params={"limit": 1, "cursor": cursor})
        assert response.status_code == 200
        page = response.json()
        names.extend(case["name"] for case in page["items"])
        cursor = page["next_cursor"]
        if cursor is None:
            break
    assert names == ["refund", "shipping", "warranty"]


def test_flow_dataset_can_be_created_and_started_from_a_case(
    eval_client: TestClient, server_engine: FakeEngine
) -> None:
    created = eval_client.post(
        "/api/datasets",
        json={
            "dataset_id": "intake_cases",
            "flow_id": "intake",
            "cases": [{"name": "question", "inputs": {"text": "Where is my order?"}, "metadata": {"split": "dev"}}],
        },
    )
    assert created.status_code == 200
    assert created.json()["flow_id"] == "intake"
    cases = eval_client.get("/api/datasets/intake_cases/cases").json()["items"]
    assert cases[0]["inputs"] == {"text": "Where is my order?"}

    started = eval_client.post(
        "/api/runs",
        json={
            "flow_id": "intake",
            "mode": "live",
            "dataset_item_id": "intake_cases/question",
            "selected_nodes": ["reply"],
        },
    )
    assert started.status_code == 201
    assert server_engine.started[-1].input == {"text": "Where is my order?"}
    assert server_engine.started[-1].selected_nodes == ("reply",)
    assert server_engine.started_dataset_items[-1] == "intake_cases/question"


def test_dataset_batch_keeps_selected_cases_and_run_links(
    eval_client: TestClient, server_engine: FakeEngine, eval_project: Path
) -> None:
    created = eval_client.post(
        "/api/datasets",
        json={
            "dataset_id": "batch_cases",
            "flow_id": "intake",
            "cases": [
                {"name": "first", "inputs": {"text": "first input"}, "metadata": {"split": "dev"}},
                {"name": "second", "inputs": {"text": "second input"}, "metadata": {"split": "test"}},
                {"name": "third", "inputs": {"text": "third input"}, "metadata": {"split": "test"}},
            ],
        },
    )
    assert created.status_code == 200
    filtered = eval_client.get("/api/datasets/batch_cases/cases", params={"split": "test", "search": "sec"}).json()
    assert [case["name"] for case in filtered["items"]] == ["second"]
    names = eval_client.get("/api/datasets/batch_cases/case-names", params={"split": "test"}).json()
    assert names["items"] == ["second", "third"]
    assert eval_client.get("/api/datasets/batch_cases/cases/second").json()["inputs"] == {"text": "second input"}

    accepted = eval_client.post(
        "/api/dataset-batches",
        json={
            "flow_id": "intake",
            "dataset_id": "batch_cases",
            "case_names": ["first", "third"],
            "selected_nodes": ["reply"],
            "mode": "dryrun",
        },
    )
    assert accepted.status_code == 202
    batch_id = accepted.json()["batch_id"]
    stored = settled(eval_client, f"/api/dataset-batches/{batch_id}")
    assert stored["status"] == "completed"
    assert (stored["cases_total"], stored["cases_completed"], stored["cases_failed"]) == (2, 2, 0)
    assert stored["dataset_file_hash"] == created.json()["file_hash"]
    reopened = SqliteDatasetBatchStore.open(eval_project)
    assert reopened.batch(batch_id) is not None
    assert {case.case_name for case in reopened.cases(batch_id)} == {"first", "third"}
    assert [request.input for request in server_engine.started[-2:]] == [
        {"text": "first input"},
        {"text": "third input"},
    ]
    assert server_engine.started_dataset_items[-2:] == ["batch_cases/first", "batch_cases/third"]
    cases = eval_client.get(f"/api/dataset-batches/{batch_id}/cases", params={"limit": 1}).json()
    assert cases["total_estimate"] == 2
    assert cases["items"][0]["case_name"] == "first"
    assert cases["items"][0]["run_id"] is not None
    assert "request" not in cases["items"][0]
    assert (
        eval_client.get("/api/dataset-batches", params={"flow_id": "intake", "dataset_id": "batch_cases"}).json()[
            "items"
        ][0]["batch_id"]
        == batch_id
    )


def test_inference_dataset_cannot_be_used_as_flow_input(eval_client: TestClient) -> None:
    response = eval_client.post(
        "/api/runs",
        json={"flow_id": "intake", "mode": "live", "dataset_item_id": "reply_cases/case_a"},
    )
    assert response.status_code == 409
    assert response.json()["code"] == "NOT_RUNNABLE"


def settled(client: TestClient, poll: str, attempts: int = 100) -> dict[str, object]:
    for _ in range(attempts):
        stored = client.get(poll).json()
        if stored["status"] != "running":
            return stored
        time.sleep(0.05)
    return client.get(poll).json()


def test_an_unknown_eval_run_is_not_found(eval_client: TestClient) -> None:
    response = eval_client.get("/api/eval-runs/01a0aa21-0000-0000-0000-000000000000")

    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"


def test_starting_a_run_is_accepted_and_recorded(eval_client: TestClient) -> None:
    accepted = eval_client.post("/api/eval-runs", json={"eval_id": "reply_quality"})
    body = accepted.json()

    assert accepted.status_code == 202
    assert body["eval_id"] == "reply_quality" and body["status"] == "running"
    assert body["poll"] == f"/api/eval-runs/{body['eval_run_id']}"
    stored = eval_client.get(body["poll"]).json()
    assert stored["eval_run_id"] == body["eval_run_id"]
    assert stored["dataset_id"] == "reply_cases"
    listed = eval_client.get("/api/eval-runs", params={"eval_id": "reply_quality"}).json()
    assert body["eval_run_id"] in [item["eval_run_id"] for item in listed["items"]]


def test_a_run_that_cannot_launch_is_recorded_as_failed(eval_client: TestClient) -> None:
    body = eval_client.post("/api/eval-runs", json={"eval_id": "reply_quality"}).json()

    stored = settled(eval_client, body["poll"])

    assert stored["status"] == "failed"
    assert "cannot run evals" in str(stored["error"])
    assert eval_client.get(f"{body['poll']}/gate").status_code == 404
    assert eval_client.get(f"{body['poll']}/cases").json()["items"] == []


def test_starting_an_unknown_eval_is_not_found(eval_client: TestClient) -> None:
    response = eval_client.post("/api/eval-runs", json={"eval_id": "nothing"})

    assert response.status_code == 404
    assert "eval nothing is not in the project" in response.json()["message"]
