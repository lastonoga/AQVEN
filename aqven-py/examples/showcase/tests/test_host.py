import re
from collections.abc import AsyncGenerator, Callable, Mapping
from datetime import UTC, datetime, timedelta
from typing import Final

import httpx2
import pytest
from pydantic import BaseModel

from app.remote import answer, fork_at, inbox, open_form, read_answers, start_case, wait_for_forms
from app.settings import SAMPLES_DIR
from aqven.client import AqvenClient
from aqven.runtime import (
    ExecutionAddress,
    ExecutionDetail,
    ForkRequest,
    HumanWait,
    HumanWaitDetail,
    NodeSuspended,
    Page,
    ResumeRequest,
    ResumeResult,
    RunEvent,
    RunForked,
    RunId,
    RunSnapshot,
    RunStarted,
    RunStartedEvent,
    RunStartRequest,
    RunSummary,
    RunSuspended,
    SpecVersionInfo,
    node_address,
)
from lumen.types import CaseRequest, MediaApproval, ReplyApproval

pytestmark = pytest.mark.anyio

RUN_ID: Final = RunId("01999c2a-5e10-7b3c-9d4e-6f7a8b9c0d1e")
FORK_ID: Final = RunId("01999c2a-7f21-7c4d-8e5f-7a8b9c0d1e2f")
AT: Final = datetime(2026, 9, 17, 10, 0, tzinfo=UTC)
HASH: Final = "sha256-" + "5c" * 32
LEAD: Final = node_address("approvals__lead", branch_key="lead")
BRAND: Final = node_address("approvals__brand", branch_key="brand")
ULID: Final = re.compile(r"[0-9A-HJKMNP-TV-Z]{26}")


def resource[M: BaseModel](model: type[M], **values: object) -> M:
    blanks = {name: None for name, info in model.model_fields.items() if info.is_required()}
    return model.model_validate(blanks | values)


def form_wait(
    form: type[BaseModel], address: ExecutionAddress, assignee: str, hours: int, on_timeout: str
) -> HumanWait:
    return resource(
        HumanWait,
        address=address,
        wait_kind="form",
        attempt=1,
        state="waiting",
        assignee=assignee,
        waiting_since=AT,
        deadline_at=AT + timedelta(hours=hours),
        on_timeout=on_timeout,
        form_type_id=form.__name__,
    )


WAITS: Final = (
    form_wait(ReplyApproval, LEAD, "support_lead", 4, "escalate"),
    form_wait(MediaApproval, BRAND, "brand_editor", 24, "default"),
)
FORMS: Final[Mapping[str, type[BaseModel]]] = {"approvals__lead": ReplyApproval, "approvals__brand": MediaApproval}
EVENTS: Final[tuple[RunEvent, ...]] = (
    resource(
        RunStartedEvent, seq=1, at=AT, run_id=RUN_ID, flow_id="support_case", content_hash=HASH, mode="live", order=()
    ),
    *(
        resource(NodeSuspended, seq=2 + index, at=AT, run_id=RUN_ID, **wait.model_dump())
        for index, wait in enumerate(WAITS)
    ),
    resource(RunSuspended, seq=4, at=AT, run_id=RUN_ID, address=BRAND),
)
SNAPSHOT: Final = resource(
    RunSnapshot,
    run_id=RUN_ID,
    flow_id="support_case",
    status="suspended",
    mode="live",
    started_at=AT,
    cost_usd="0.0184",
    tokens_in=0,
    tokens_out=0,
    node_counts=dict.fromkeys(("pending", "running", "ok", "failed", "skipped", "suspended", "cancelled"), 0),
    content_hash=HASH,
    definition_changed=False,
    waits=WAITS,
    execution_id=RUN_ID,
    spec_version=resource(SpecVersionInfo, id="spv_1", content_hash=HASH, origin="working_copy", sources={}),
    effective_config={},
    config_hash=HASH,
    order=(),
    executions=(),
    human_answers=(),
    last_seq=len(EVENTS),
)


def sse(event: RunEvent) -> str:
    return f"event: {event.type}\ndata: {event.model_dump_json()}\nid: {event.seq}\n\n"


def json_response(status_code: int, model: BaseModel) -> httpx2.Response:
    return httpx2.Response(status_code, json=model.model_dump(mode="json", by_alias=True))


def run_started(request: httpx2.Request) -> httpx2.Response:
    started = RunStarted(
        run_id=RUN_ID, status="running", content_hash=HASH, spec_version_id="spv_1", last_seq=0, ui_url="/runs/1"
    )
    return json_response(201, started)


def run_events(request: httpx2.Request) -> httpx2.Response:
    body = "".join(sse(event) for event in EVENTS)
    return httpx2.Response(200, headers={"content-type": "text/event-stream"}, text=body)


def run_snapshot(request: httpx2.Request) -> httpx2.Response:
    return json_response(200, SNAPSHOT)


def execution_detail(request: httpx2.Request) -> httpx2.Response:
    node_id = request.url.params["node_id"]
    wait = next(wait for wait in WAITS if wait.address.node_id == node_id)
    human = wait.model_dump() | {
        "form_schema": FORMS[node_id].model_json_schema(),
        "attempts": (),
        "ignored_answers": (),
    }
    detail = resource(
        ExecutionDetail,
        address=wait.address,
        kind="human",
        status="suspended",
        attempts_count=1,
        cost_usd="0",
        tokens_in=0,
        tokens_out=0,
        cache_hit=False,
        degraded=False,
        provenance={},
        attempts=(),
        checks=(),
        rule_firings=(),
        human=resource(HumanWaitDetail, **human),
    )
    return json_response(200, detail)


def resumed(request: httpx2.Request) -> httpx2.Response:
    body = ResumeRequest.model_validate_json(request.content)
    result = ResumeResult(outcome="accepted", status="running", address=body.address, attempt=body.attempt)
    return json_response(200, result)


def forked(request: httpx2.Request) -> httpx2.Response:
    return json_response(201, RunForked(run_id=FORK_ID, lineage_parent=RUN_ID))


def suspended_runs(request: httpx2.Request) -> httpx2.Response:
    return json_response(200, Page[RunSummary](items=(SNAPSHOT,), next_cursor=None, total_estimate=1))


type Handler = Callable[[httpx2.Request], httpx2.Response]

ROUTES: Final[Mapping[tuple[str, str], Handler]] = {
    ("POST", "/api/runs"): run_started,
    ("GET", "/api/runs"): suspended_runs,
    ("GET", "/api/runs/{run_id}"): run_snapshot,
    ("GET", "/api/runs/{run_id}/events"): run_events,
    ("GET", "/api/runs/{run_id}/executions/detail"): execution_detail,
    ("POST", "/api/runs/{run_id}/resume"): resumed,
    ("POST", "/api/runs/{run_id}/fork"): forked,
}


def fake_serve(sent: list[httpx2.Request]) -> Handler:
    def serve(request: httpx2.Request) -> httpx2.Response:
        sent.append(request)
        return ROUTES[(request.method, request.url.path.replace(RUN_ID, "{run_id}"))](request)

    return serve


@pytest.fixture
def sent() -> list[httpx2.Request]:
    return []


@pytest.fixture
async def client(sent: list[httpx2.Request]) -> AsyncGenerator[AqvenClient]:
    async with httpx2.AsyncClient(transport=httpx2.MockTransport(fake_serve(sent))) as http:
        yield AqvenClient(http=http)


async def test_start_case_sends_flow_and_scripted_answers(
    client: AqvenClient, sent: list[httpx2.Request], case_request: CaseRequest
) -> None:
    answers = read_answers(SAMPLES_DIR / "answers.json")
    started = await start_case(client, case_request, answers)
    body = RunStartRequest.model_validate_json(sent[-1].content)
    assert (started.run_id, body.flow_id, body.human_answers) == (RUN_ID, "support_case", answers)
    assert CaseRequest.model_validate(body.input) == case_request


async def test_wait_for_forms_stops_at_suspension(client: AqvenClient, sent: list[httpx2.Request]) -> None:
    waits = await wait_for_forms(client, RUN_ID, 0)
    assert [wait.address for wait in waits] == [LEAD, BRAND]
    assert [request.url.path for request in sent] == [f"/api/runs/{RUN_ID}/events", f"/api/runs/{RUN_ID}"]


async def test_open_form_returns_form_schema(client: AqvenClient) -> None:
    detail = await open_form(client, RUN_ID, WAITS[0])
    assert detail.form_schema == ReplyApproval.model_json_schema()


async def test_answer_sends_client_op_id_and_attempt(client: AqvenClient, sent: list[httpx2.Request]) -> None:
    payload = MediaApproval(use_image=True, use_voice=True, use_clip=False).model_dump(mode="json")
    result = await answer(client, RUN_ID, WAITS[1], payload)
    body = ResumeRequest.model_validate_json(sent[-1].content)
    assert ULID.fullmatch(body.client_op_id)
    assert (body.address, body.attempt, body.payload, result.outcome) == (BRAND, 1, payload, "accepted")


async def test_fork_at_sends_from_address(client: AqvenClient, sent: list[httpx2.Request]) -> None:
    result = await fork_at(client, RUN_ID, LEAD)
    body = ForkRequest.model_validate_json(sent[-1].content)
    assert (body.from_, result.run_id) == (LEAD, FORK_ID)


async def test_inbox_filters_suspended_runs_by_assignee(client: AqvenClient, sent: list[httpx2.Request]) -> None:
    page = await inbox(client, "support_lead")
    params = sent[-1].url.params
    assert (params["status"], params["assignee"], page.items[0].waits) == ("suspended", "support_lead", WAITS)
