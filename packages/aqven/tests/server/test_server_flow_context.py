import time
from collections.abc import Iterator
from pathlib import Path
from typing import Final

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from server_fakes import AUTH, SERVER_BASE, SERVER_TOKEN, FakeEngine, MemorySettings, copy_fixture

from aqven.app.composition import ReportCompiler
from aqven.ports.engine import EngineError
from aqven.runtime.address import Problem
from aqven.server import ServerOptions, create_app
from aqven.server.errors import translate

CONFIRM: Final = "triage/confirm.yaml"
DATE_INPUT: Final = '- name: "today"\n  type: "Date"\n  description: "Run date"\n  from: "$run.context.date"\n'
TICKET: Final = {
    "subject": "Lamp",
    "body": "The lamp does not turn on",
    "customer": {"name": "Ann", "email": None},
    "photo": None,
}


@pytest.fixture
def context_project(tmp_path: Path) -> Path:
    root = copy_fixture("fixture_shop", tmp_path)
    target = root / CONFIRM
    target.write_text(target.read_text(encoding="utf-8") + DATE_INPUT, encoding="utf-8")
    return root


@pytest.fixture
def context_client(context_project: Path, server_engine: FakeEngine, tmp_path: Path) -> Iterator[TestClient]:
    options = ServerOptions(
        access_token=SERVER_TOKEN,
        port=5181,
        watch=False,
        serve_studio=False,
        blob_directory=tmp_path / "blobs",
        compiler=ReportCompiler(),
    )
    app: FastAPI = create_app(context_project, server_engine, MemorySettings(), options=options)
    with TestClient(app, base_url=SERVER_BASE, headers=AUTH) as client:
        yield client


def test_flow_views_publish_the_context_keys_studio_must_ask_for(context_client: TestClient) -> None:
    detail = context_client.get("/api/flows/triage").json()
    listed = context_client.get("/api/flows").json()["items"]
    schemas = context_client.get("/api/flows/triage/schemas").json()

    assert detail["context"] == ["date"]
    assert [row["context"] for row in listed] == [["date"]]
    assert schemas["context"] == ["date"]


def test_run_start_carries_the_context_to_the_engine(context_client: TestClient, server_engine: FakeEngine) -> None:
    body = {
        "flow_id": "triage",
        "mode": "live",
        "input": TICKET,
        "context": {"date": "2026-09-18", "tenant_id": "lumen"},
    }

    response = context_client.post("/api/runs", json=body)
    [request] = server_engine.started

    assert response.status_code == 201, response.text
    assert request.context is not None
    assert (str(request.context.date), request.context.tenant_id) == ("2026-09-18", "lumen")


def test_dataset_draft_and_scope_preview_use_the_compiled_flow(context_client: TestClient) -> None:
    draft = context_client.post("/api/datasets/draft", json={"flow_id": "triage"})
    whole = context_client.post("/api/flows/triage/run-scope", json={"selected_nodes": None})
    focused = context_client.post("/api/flows/triage/run-scope", json={"selected_nodes": ["route"]})

    assert draft.status_code == 200, draft.text
    assert draft.json()["flow"] == "triage"
    assert draft.json()["cases"][0]["context"]["date"]
    assert whole.json()["order"] == ["classify", "route", "summarize"]
    assert focused.json()["order"] == ["classify", "route"]


def test_a_missing_context_key_becomes_a_422_naming_the_key() -> None:
    problem = Problem(path=("context", "date"), code="CONTEXT_KEY_MISSING", message="date is missing")
    error = EngineError("CONTEXT_MISSING", "flow triage needs run context keys: date", problems=(problem,))

    failure = translate(error)

    assert (failure.status, failure.code) == (422, "CONTEXT_MISSING")
    assert failure.error("run_start").problems == (problem,)


def test_dataset_range_preview_and_batch_use_case_output_fixture(
    context_client: TestClient, server_engine: FakeEngine
) -> None:
    created = context_client.post(
        "/api/datasets",
        json={
            "dataset_id": "slice_cases",
            "flow_id": "triage",
            "cases": [
                {
                    "name": "ready",
                    "inputs": TICKET,
                    "context": {"date": "2026-09-18"},
                    "node_outputs": {"classify": {"category": "billing"}},
                },
                {"name": "missing", "inputs": TICKET, "context": {"date": "2026-09-18"}},
            ],
        },
    )
    assert created.status_code == 200, created.text
    preview = context_client.post(
        "/api/flows/triage/dataset-range", json={"dataset_id": "slice_cases", "case_names": ["ready"]}
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["order"] == ["classify", "route", "summarize"]
    route_only = next(row for row in preview.json()["ranges"] if row["start_node"] == row["end_node"] == "route")
    assert route_only["available"] is True and route_only["missing"] == []

    unavailable = context_client.post(
        "/api/flows/triage/dataset-range", json={"dataset_id": "slice_cases", "case_names": ["ready", "missing"]}
    )
    route_only = next(row for row in unavailable.json()["ranges"] if row["start_node"] == row["end_node"] == "route")
    assert route_only["available"] is False
    assert any(item["case_name"] == "missing" and "classify" in item["reference"] for item in route_only["missing"])

    rejected = context_client.post(
        "/api/dataset-batches",
        json={
            "flow_id": "triage",
            "dataset_id": "slice_cases",
            "case_names": ["ready", "missing"],
            "start_node": "route",
            "end_node": "route",
        },
    )
    assert rejected.status_code == 422
    assert rejected.json()["code"] == "INPUT_INVALID"
    assert "$classify.out" in rejected.json()["message"]

    started = context_client.post(
        "/api/dataset-batches",
        json={
            "flow_id": "triage",
            "dataset_id": "slice_cases",
            "case_names": ["ready"],
            "start_node": "route",
            "end_node": "route",
            "mode": "dryrun",
        },
    )
    assert started.status_code == 202, started.text
    assert started.json()["start_node"] == "route"
    assert started.json()["end_node"] == "route"
    batch = context_client.get(f"/api/dataset-batches/{started.json()['batch_id']}").json()
    for _ in range(100):
        if batch["status"] != "running":
            break
        time.sleep(0.05)
        batch = context_client.get(f"/api/dataset-batches/{started.json()['batch_id']}").json()
    assert batch["status"] == "completed"
    assert server_engine.started[-1].node_outputs == {"classify": {"category": "billing"}}
    assert (server_engine.started[-1].start_node, server_engine.started[-1].end_node) == ("route", "route")

    full = context_client.post(
        "/api/runs",
        json={"flow_id": "triage", "mode": "dryrun", "dataset_item_id": "slice_cases/ready"},
    )
    assert full.status_code == 201, full.text
    assert server_engine.started[-1].node_outputs == {}
    assert server_engine.started[-1].start_node is None


def test_dataset_accepts_partial_input_but_rejects_wrong_field_type(context_client: TestClient) -> None:
    partial = context_client.post(
        "/api/datasets",
        json={
            "dataset_id": "partial_cases",
            "flow_id": "triage",
            "cases": [{"name": "partial", "inputs": {"subject": "Lamp"}}],
        },
    )
    invalid = context_client.post(
        "/api/datasets",
        json={
            "dataset_id": "invalid_cases",
            "flow_id": "triage",
            "cases": [{"name": "invalid", "inputs": {"subject": 5}}],
        },
    )
    assert partial.status_code == 200, partial.text
    assert invalid.status_code == 422 and invalid.json()["code"] == "INPUT_INVALID"


def test_dataset_range_can_omit_context_used_only_after_its_endpoint(context_client: TestClient) -> None:
    created = context_client.post(
        "/api/datasets",
        json={
            "dataset_id": "first_stage_cases",
            "flow_id": "triage",
            "cases": [{"name": "classify_only", "inputs": TICKET}],
        },
    )
    assert created.status_code == 200, created.text
    preview = context_client.post(
        "/api/flows/triage/dataset-range",
        json={"dataset_id": "first_stage_cases", "case_names": ["classify_only"]},
    )
    first = next(row for row in preview.json()["ranges"] if row["start_node"] == row["end_node"] == "classify")
    assert first["available"] is True, first


def test_manual_range_reports_inputs_needed_by_each_selected_stage(context_client: TestClient) -> None:
    preview = context_client.post("/api/flows/triage/manual-range", json={})

    assert preview.status_code == 200, preview.text
    assert preview.json()["order"] == ["classify", "route", "summarize"]
    classify = next(row for row in preview.json()["ranges"] if row["start_node"] == row["end_node"] == "classify")
    assert classify["input_paths"] == ["$input"]
    assert classify["context_keys"] == []
    assert classify["node_output_paths"] == []
    assert classify["available"] is False
    assert classify["missing"] == [{"reference": "$input", "reason": "flow input is empty"}]


def test_manual_range_resolves_switch_branch_using_draft_upstream_output(context_client: TestClient) -> None:
    billing = context_client.post(
        "/api/flows/triage/manual-range",
        json={"node_outputs": {"classify": {"category": "billing"}}},
    )
    delivery = context_client.post(
        "/api/flows/triage/manual-range",
        json={"node_outputs": {"classify": {"category": "delivery"}}},
    )

    assert billing.status_code == 200, billing.text
    assert delivery.status_code == 200, delivery.text
    billing_route = next(row for row in billing.json()["ranges"] if row["start_node"] == row["end_node"] == "route")
    delivery_route = next(row for row in delivery.json()["ranges"] if row["start_node"] == row["end_node"] == "route")
    assert billing_route["input_paths"] == []
    assert billing_route["context_keys"] == []
    assert billing_route["node_output_paths"] == ["$classify.out.category"]
    assert billing_route["available"] is True
    assert delivery_route["input_paths"] == ["$input"]
    assert delivery_route["context_keys"] == ["date"]
    assert delivery_route["node_output_paths"] == ["$classify.out.category"]
    assert {item["reference"] for item in delivery_route["missing"]} == {"$input", "$run.context.date"}
