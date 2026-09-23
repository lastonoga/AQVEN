from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from server_fakes import AUTH, SERVER_BASE, FakeEngine, MemorySettings, copy_fixture

from aqven.server import ServerOptions, create_app


@pytest.fixture
def dataset_project(tmp_path: Path) -> Path:
    return copy_fixture("dataset_shop", tmp_path)


@pytest.fixture
def dataset_client(
    dataset_project: Path,
    server_engine: FakeEngine,
    server_settings: MemorySettings,
    server_options: ServerOptions,
) -> Iterator[TestClient]:
    app: FastAPI = create_app(dataset_project, server_engine, server_settings, options=server_options)
    with TestClient(app, base_url=SERVER_BASE, headers=AUTH) as client:
        yield client


def test_datasets_carry_case_counts_and_splits(dataset_client: TestClient) -> None:
    body = dataset_client.get("/api/datasets").json()
    (row,) = body["items"]

    assert (row["dataset_id"], row["cases"]) == ("reply_cases", 3)
    assert row["path"] == "datasets/reply_cases.yaml"
    assert row["splits"] == {"dev": 2, "holdout": 1}
    assert dataset_client.get("/api/datasets/reply_cases").json() == row
    assert dataset_client.get("/api/datasets/nothing").status_code == 404


def test_dataset_case_pages_do_not_skip_file_ordered_cases(dataset_client: TestClient) -> None:
    names: list[str] = []
    cursor: str | None = None
    while True:
        response = dataset_client.get("/api/datasets/reply_cases/cases", params={"limit": 1, "cursor": cursor})
        assert response.status_code == 200
        page = response.json()
        names.extend(case["name"] for case in page["items"])
        cursor = page["next_cursor"]
        if cursor is None:
            break
    assert names == ["refund", "shipping", "warranty"]


def test_flow_dataset_can_be_created_and_started_from_a_case(
    dataset_client: TestClient, server_engine: FakeEngine
) -> None:
    created = dataset_client.post(
        "/api/datasets",
        json={
            "dataset_id": "intake_cases",
            "flow_id": "intake",
            "cases": [{"name": "question", "inputs": {"text": "Where is my order?"}, "metadata": {"split": "dev"}}],
        },
    )
    assert created.status_code == 200
    assert created.json()["flow_id"] == "intake"
    cases = dataset_client.get("/api/datasets/intake_cases/cases").json()["items"]
    assert cases[0]["inputs"] == {"text": "Where is my order?"}

    started = dataset_client.post(
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


def test_dataset_cases_filter_by_the_server_split_and_name(dataset_client: TestClient) -> None:
    created = dataset_client.post(
        "/api/datasets",
        json={
            "dataset_id": "split_cases",
            "flow_id": "intake",
            "cases": [
                {"name": "first", "inputs": {"text": "first input"}, "metadata": {"split": "dev"}},
                {"name": "second", "inputs": {"text": "second input"}, "metadata": {"split": "test"}},
                {"name": "third", "inputs": {"text": "third input"}, "metadata": {"split": "test"}},
            ],
        },
    )
    assert created.status_code == 200
    assert created.json()["splits"] == {"dev": 2, "holdout": 1}
    filtered = dataset_client.get("/api/datasets/split_cases/cases", params={"split": "dev", "search": "ir"}).json()
    assert [case["name"] for case in filtered["items"]] == ["first", "third"]
    names = dataset_client.get("/api/datasets/split_cases/case-names", params={"split": "holdout"}).json()
    assert names["items"] == ["second"]
    ignored = dataset_client.get("/api/datasets/split_cases/case-names", params={"split": "test"}).json()
    assert ignored["items"] == []
    assert dataset_client.get("/api/datasets/split_cases/cases/second").json()["inputs"] == {"text": "second input"}
    assert dataset_client.get("/api/datasets/split_cases/cases/nothing").status_code == 404


def test_inference_dataset_cannot_be_used_as_flow_input(dataset_client: TestClient) -> None:
    response = dataset_client.post(
        "/api/runs",
        json={"flow_id": "intake", "mode": "live", "dataset_item_id": "reply_cases/case_a"},
    )
    assert response.status_code == 409
    assert response.json()["code"] == "NOT_RUNNABLE"
