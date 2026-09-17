import json
import os
from collections.abc import AsyncGenerator, Iterator, Mapping
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import date
from typing import Final

import anyio
import httpx2
import pytest
from pydantic import SecretStr
from pydantic_ai import BinaryImage, models
from pydantic_ai import RunContext as ModelRunContext
from pydantic_ai.messages import FilePart, ModelMessage, ModelResponse
from pydantic_ai.models import CompletedStreamedResponse, Model, ModelRequestParameters, StreamedResponse
from pydantic_ai.models.function import AgentInfo, FunctionModel
from pydantic_ai.profiles import ModelProfile
from pydantic_ai.settings import ModelSettings

from app.embedded import case_flow, resume_request
from app.settings import SAMPLES_DIR
from aqven.engine import configure_local_engines, shutdown_local_engines
from aqven.engine.assembly import ProjectModelFactories, standard_engine_setup
from aqven.ir import AgentModel, CompiledProject
from aqven.ports.models import ModelFactory
from aqven.runtime import (
    CassetteConfig,
    CassetteMode,
    ExecutionAddress,
    FlowHandle,
    HumanWait,
    McpToolStub,
    ModelRoute,
    NodeFinished,
    Project,
    ProviderFault,
    Run,
    RunContext,
    RunOptions,
    RunResult,
    node_address,
)
from aqven.spec import McpServerId, TenantId
from aqven.testing import MemoryBlobStore, ScriptedHuman, cassette_mode, offline_options, provider_fault
from lumen.types import (
    CaseOriginStorefront,
    CaseOutcome,
    CaseRequest,
    IssueStoreCreditOut,
    LookupOrderOut,
    MediaApproval,
    ProductRef,
    ReplyApproval,
    SearchKbOut,
)

pytestmark = [pytest.mark.aqven_engine, pytest.mark.anyio]

PHOTO: Final = (SAMPLES_DIR / "flow_strip_controller.jpg").read_bytes()
INVOICE: Final = (SAMPLES_DIR / "invoice_LUM-20260903.pdf").read_bytes()
CASSETTE_MODE: Final = cassette_mode(os.environ)
LIVE: Final = CASSETTE_MODE == CassetteMode.RECORD_NEW
CLIP_URL: Final = "https://cdn.together.example/videos/vid_7h3k9m2p.mp4"
LEAD: Final = node_address("approvals__lead", branch_key="lead")
PAINTER: Final = "openrouter:google/gemini-3.1-flash-lite-image"
PAINTER_FALLBACK: Final = "openrouter:openai/gpt-5-image-mini"
CREDIT_DENIAL: Final = (
    "Руководитель поддержки отказал в начислении: кредит не начислен, выбери решение без кредита магазина"
)
REPLY_APPROVAL: Final = ReplyApproval(decision="approve", edited_text=None, note=None)
MEDIA_APPROVAL: Final = MediaApproval(use_image=True, use_voice=True, use_clip=False)
WAIT_SECONDS: Final = 120
POLL_SECONDS: Final = 0.05
CONTEXT: Final = RunContext(date=date(2026, 9, 17), tenant_id=TenantId("marketplace_eu"))

KB: Final = SearchKbOut.model_validate(
    {
        "chunks": [
            {
                "chunk_id": "kb_strip0flck",
                "title": "Мерцание ленты Flow",
                "text": "Если лента Flow мерцает у контроллера, отключите питание и проверьте штекер контроллера. "
                "Если мерцание повторяется, контроллер подлежит гарантийной замене.",
            },
            {
                "chunk_id": "kb_ctrlheat01",
                "title": "Нагрев контроллера",
                "text": "Если корпус контроллера горячий на ощупь, сразу отключите ленту от сети и не включайте её "
                "до проверки.",
            },
        ],
        "policies": [
            {
                "policy_id": "3f6c2a1e-8b4d-4c7a-9e21-5d0f7b8a6c34",
                "title": "Кредит магазина по гарантии",
                "text": "Покупатели Lumen Plus получают кредит магазина до 20 € за неисправный товар "
                "в гарантийный срок.",
            }
        ],
    }
)
ORDER: Final = LookupOrderOut.model_validate(
    {
        "order_id": "LUM-20260903",
        "placed_on": "2026-09-03",
        "delivered_on": "2026-09-06",
        "total": {"amount_minor": 5990, "currency": "eur"},
        "items": [
            {
                "sku": "SKU-LS5M01",
                "name": "Lumen Flow Strip 5 м",
                "category": "light_strip",
                "lamp_kind": "smart_wifi",
            }
        ],
    }
)
CREDIT: Final = IssueStoreCreditOut.model_validate(
    {"credit_id": "cr_4t8w2n6q9r1s", "amount": {"amount_minor": 1500, "currency": "eur"}}
)
JOB_QUEUED: Final = {"id": "vid_7h3k9m2p", "status": "queued"}
JOB_COMPLETED: Final = {"id": "vid_7h3k9m2p", "status": "completed", "outputs": {"video_url": CLIP_URL}}

TOOL_API: Final[Mapping[tuple[str, str], tuple[str, bytes]]] = {
    ("GET", "kb.lumen.example/v1/search"): ("application/json", KB.model_dump_json().encode()),
    ("GET", "orders.lumen.example/v1/orders/LUM-20260903"): ("application/json", ORDER.model_dump_json().encode()),
    ("POST", "orders.lumen.example/v1/orders/LUM-20260903/store-credits"): (
        "application/json",
        CREDIT.model_dump_json().encode(),
    ),
    ("POST", "api.openai.com/v1/audio/speech"): ("audio/wav", b"RIFF\x24\x00\x00\x00WAVEfmt "),
    ("POST", "api.together.xyz/v2/videos"): ("application/json", json.dumps(JOB_QUEUED).encode()),
    ("GET", "api.together.xyz/v2/videos/vid_7h3k9m2p"): ("application/json", json.dumps(JOB_COMPLETED).encode()),
    ("GET", "cdn.together.example/videos/vid_7h3k9m2p.mp4"): ("video/mp4", b"\x00\x00\x00\x18ftypmp42"),
}

MCP_STUBS: Final = (
    McpToolStub(
        server=McpServerId("helpdesk"),
        tool="search_tickets",
        result={"tickets": [{"ticket_id": "HD-48213", "subject": "Контроллер Flow греется", "status": "closed"}]},
    ),
    McpToolStub(
        server=McpServerId("helpdesk"),
        tool="search_macros",
        result={"macros": [{"macro_id": "warranty_credit", "title": "Кредит по гарантии Lumen Plus"}]},
    ),
)

QUESTION: Final = {
    "origin": CaseOriginStorefront(kind="storefront", page="/help/glow-e27"),
    "message": "Подскажите, лампа Glow E27 работает с Wi-Fi 5 ГГц? Хочу поставить её в спальню.",
    "order_id": None,
    "product": ProductRef.model_validate(
        {"sku": "SKU-GL27E1", "name": "Lumen Glow E27", "category": "smart_bulb", "lamp_kind": "smart_wifi"}
    ),
    "tags": ["wifi"],
    "urgent": False,
    "photo": None,
    "invoice": None,
}


def tool_api(request: httpx2.Request) -> httpx2.Response:
    content_type, body = TOOL_API[(request.method, f"{request.url.host}{request.url.path}")]
    return httpx2.Response(200, headers={"content-type": content_type}, content=body)


def media_approved() -> ScriptedHuman:
    return ScriptedHuman().answer("approvals__brand", MEDIA_APPROVAL, branch_key="brand")


def approvals() -> ScriptedHuman:
    return media_approved().answer("approvals__lead", REPLY_APPROVAL, branch_key="lead")


def credit_approved(human: ScriptedHuman) -> ScriptedHuman:
    return human.approve_tools("route__resolve", approve=True, branch_key="defect")


def credit_denied(human: ScriptedHuman) -> ScriptedHuman:
    return human.approve_tools("route__resolve", approve=False, message=CREDIT_DENIAL, branch_key="defect")


async def scripted_illustration(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
    return ModelResponse(parts=[FilePart(content=BinaryImage(data=PHOTO, media_type="image/jpeg"))])


class StreamedFunctionModel(FunctionModel):
    @asynccontextmanager
    async def request_stream(
        self,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
        run_context: ModelRunContext[object] | None = None,
    ) -> AsyncGenerator[StreamedResponse]:
        response = await self.request(messages, model_settings, model_request_parameters)
        yield CompletedStreamedResponse(response, model_request_parameters=model_request_parameters, replay_events=True)


@dataclass(frozen=True, slots=True)
class FixedModel:
    model: Model

    def build(self, model: str, *, settings: ModelSettings | None, api_key: SecretStr) -> Model:
        return self.model


@dataclass(frozen=True, slots=True)
class ScriptedModels:
    scripted: Mapping[str, Model]
    project: ProjectModelFactories = field(default_factory=ProjectModelFactories)

    def factory(self, project: CompiledProject, route: ModelRoute | None, choice: AgentModel) -> ModelFactory:
        model = self.scripted.get(choice.model)
        if model is None:
            return self.project.factory(project, route, choice)
        return FixedModel(model)


def offline(
    cassettes: CassetteConfig,
    scenario: str,
    blobs: MemoryBlobStore,
    human: ScriptedHuman,
    *faults: ProviderFault,
) -> RunOptions:
    return offline_options(
        cassettes=CassetteConfig(directory=cassettes.directory / scenario, mode=CASSETTE_MODE),
        human=human,
        context=CONTEXT,
        tool_http=httpx2.MockTransport(tool_api),
        mcp_stubs=MCP_STUBS,
        blobs=blobs,
        faults=faults,
    )


async def wait_at(run: Run[CaseOutcome], address: ExecutionAddress) -> HumanWait:
    with anyio.fail_after(WAIT_SECONDS):
        while True:
            found = next((wait for wait in await run.waits() if wait.address == address), None)
            if found is not None:
                return found
            await anyio.sleep(POLL_SECONDS)


async def finished_nodes(
    flow: FlowHandle[CaseRequest, CaseOutcome], request: CaseRequest, options: RunOptions
) -> tuple[RunResult[CaseOutcome], tuple[NodeFinished, ...]]:
    run = await flow.start(request, options)
    result = await run.result()
    return result, tuple([event async for event in run.events() if isinstance(event, NodeFinished)])


@pytest.fixture(autouse=True)
def model_requests() -> Iterator[None]:
    with models.override_allow_model_requests(LIVE):
        yield


@pytest.fixture(autouse=True)
def local_engine() -> Iterator[None]:
    yield
    shutdown_local_engines()


@pytest.fixture
def scripted_painter() -> Iterator[None]:
    painter = StreamedFunctionModel(
        scripted_illustration, model_name="scripted-painter", profile=ModelProfile(supports_image_output=True)
    )
    shutdown_local_engines()
    configure_local_engines(standard_engine_setup(factories=ScriptedModels({PAINTER: painter})))
    yield
    shutdown_local_engines()
    configure_local_engines(standard_engine_setup())


@pytest.fixture
def flow(aqven_project: Project) -> FlowHandle[CaseRequest, CaseOutcome]:
    return case_flow(aqven_project)


@pytest.fixture
async def blobs() -> MemoryBlobStore:
    store = MemoryBlobStore()
    await store.put(PHOTO, "image/jpeg", "flow_strip_controller.jpg")
    await store.put(INVOICE, "application/pdf", "invoice_LUM-20260903.pdf")
    return store


async def test_question_agreed_stays_on_cheap_tier(
    flow: FlowHandle[CaseRequest, CaseOutcome],
    case_request: CaseRequest,
    cassette_config: CassetteConfig,
    blobs: MemoryBlobStore,
) -> None:
    request = case_request.model_copy(update=QUESTION)
    result = await flow.run(request, offline(cassette_config, "question_agreed", blobs, approvals()))
    outcome = result.output
    assert outcome is not None, result.error
    assert (outcome.tier, outcome.record.kind, outcome.resolution.action, outcome.status) == (
        "cheap",
        "question",
        "advice",
        "sent",
    )


async def test_defect_split_vote_escalates_and_repairs_record(
    flow: FlowHandle[CaseRequest, CaseOutcome],
    case_request: CaseRequest,
    cassette_config: CassetteConfig,
    blobs: MemoryBlobStore,
) -> None:
    options = offline(cassette_config, "defect_split_vote", blobs, credit_approved(approvals()))
    result, finished = await finished_nodes(flow, case_request, options)
    passes = {event.address.iteration for event in finished if event.address.node_id == "record__extract"}
    assert result.output is not None, result.error
    assert (result.output.tier, result.output.resolution.action, len(passes)) == ("strong", "store_credit", 2)


async def test_denied_tool_approval_withholds_credit_with_scripted_painter(
    scripted_painter: None,
    flow: FlowHandle[CaseRequest, CaseOutcome],
    case_request: CaseRequest,
    cassette_config: CassetteConfig,
    blobs: MemoryBlobStore,
) -> None:
    result = await flow.run(
        case_request, offline(cassette_config, "tool_approval_denied", blobs, credit_denied(approvals()))
    )
    assert result.output is not None, result.error
    assert result.output.resolution.action != "store_credit"


async def test_painter_falls_back_to_second_model(
    flow: FlowHandle[CaseRequest, CaseOutcome],
    case_request: CaseRequest,
    cassette_config: CassetteConfig,
    blobs: MemoryBlobStore,
) -> None:
    fault = provider_fault("illustrate", model=PAINTER)
    options = offline(cassette_config, "painter_fallback", blobs, credit_approved(approvals()), fault)
    _, finished = await finished_nodes(flow, case_request, options)
    models = {event.model for event in finished if event.address.node_id == "illustrate"}
    assert models == {PAINTER_FALLBACK}


async def test_fork_at_lead_approval_rejects_reply(
    flow: FlowHandle[CaseRequest, CaseOutcome],
    case_request: CaseRequest,
    cassette_config: CassetteConfig,
    blobs: MemoryBlobStore,
) -> None:
    human = credit_approved(media_approved())
    run = await flow.start(case_request, offline(cassette_config, "fork_lead_reject", blobs, human))
    await run.resume(resume_request(await wait_at(run, LEAD), REPLY_APPROVAL))
    await run.result()
    fork = await run.fork(LEAD)
    rejection = ReplyApproval(decision="reject", edited_text=None, note="Ответ обещает больше политики")
    await fork.resume(resume_request(await wait_at(fork, LEAD), rejection))
    result = await fork.result()
    assert result.output is not None, result.error
    assert (result.output.status, result.output.reply) == ("rejected", None)
