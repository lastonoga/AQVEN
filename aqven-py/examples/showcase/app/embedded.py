from collections.abc import Mapping
from pathlib import Path
from typing import Final

from pydantic import BaseModel

from app.settings import HostSettings
from aqven.client import new_client_op_id
from aqven.runtime import FlowHandle, HumanWait, Project, ResumeRequest, RunContext, RunOptions, RunResult
from lumen.types import CaseOutcome, CaseRequest

FLOW_ID: Final = "support_case"


def open_project(settings: HostSettings) -> Project:
    return Project.from_package(settings.project_package)


def case_flow(project: Project) -> FlowHandle[CaseRequest, CaseOutcome]:
    return project.flow_typed(FLOW_ID, CaseRequest, CaseOutcome)


def read_request(path: Path) -> CaseRequest:
    return CaseRequest.model_validate_json(path.read_bytes())


async def handle_case(
    flow: FlowHandle[CaseRequest, CaseOutcome],
    request: CaseRequest,
    options: RunOptions,
) -> RunResult[CaseOutcome]:
    return await flow.run(request, options)


def resume_request(wait: HumanWait, answer: BaseModel) -> ResumeRequest:
    return ResumeRequest(
        address=wait.address,
        attempt=wait.attempt,
        payload=answer.model_dump(mode="json", by_alias=True),
        client_op_id=new_client_op_id(),
    )


async def handle_with_answers(
    flow: FlowHandle[CaseRequest, CaseOutcome],
    request: CaseRequest,
    answers: Mapping[str, BaseModel],
    context: RunContext,
) -> RunResult[CaseOutcome]:
    run = await flow.start(request, RunOptions(context=context))
    waits = await run.waits()
    while waits:
        for wait in waits:
            await run.resume(resume_request(wait, answers[wait.address.node_id]))
        waits = await run.waits()
    return await run.result()
