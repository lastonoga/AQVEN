from typing import Final

from anyio import to_thread
from fastapi import APIRouter

from aqven.server.context import ServerContext, rest_only
from aqven.server.errors import ERROR_RESPONSES
from aqven.server.views.experiment_authoring import (
    AuthoringOptionsView,
    CaseCountRequest,
    CaseCountView,
    authoring_options,
    case_count,
)
from aqven.server.views.experiment_writes import (
    ExperimentCasesWrite,
    ExperimentCreated,
    ExperimentCreateRequest,
    ExperimentFileWritten,
    cases_written,
    create_experiment,
    experiment_created,
    experiment_spec_path,
    write_cases,
)
from aqven.spec import FlowId

AUTHORING_OPTIONS: Final = "Studio experiment form: flows, agents, datasets, checks and question kinds of the project"
CASE_COUNT: Final = "Studio live count of the cases a dataset and tags select"
CASES_WRITE: Final = "a person picks the experiment cases in Studio; an agent edits experiment.yaml itself"
EXPERIMENT_CREATE: Final = "a person creates an experiment in Studio; an agent writes the experiment files itself"


def build_authoring_router(context: ServerContext) -> APIRouter:
    router = APIRouter(prefix="/api", responses=ERROR_RESPONSES)

    @router.get("/research/authoring", operation_id="research_authoring", openapi_extra=rest_only(AUTHORING_OPTIONS))
    async def get_authoring_options(flow: FlowId | None = None) -> AuthoringOptionsView:
        return authoring_options(await context.workspace.state(), flow)

    @router.post("/research/authoring/count", operation_id="research_case_count", openapi_extra=rest_only(CASE_COUNT))
    async def count_cases(body: CaseCountRequest) -> CaseCountView:
        return case_count(await context.workspace.state(), body)

    @router.put(
        "/experiments/{experiment_id}/cases", operation_id="experiment_cases_put", openapi_extra=rest_only(CASES_WRITE)
    )
    async def put_experiment_cases(experiment_id: str, body: ExperimentCasesWrite) -> ExperimentFileWritten:
        state = await context.workspace.state()
        path = experiment_spec_path(state, experiment_id)
        actor = await context.human()
        result = await to_thread.run_sync(write_cases, state, context.writer, path, body, actor)
        return cases_written(await context.workspace.state(), path, result)

    @router.post(
        "/experiments", status_code=201, operation_id="experiment_create", openapi_extra=rest_only(EXPERIMENT_CREATE)
    )
    async def post_experiment(body: ExperimentCreateRequest) -> ExperimentCreated:
        state = await context.workspace.state()
        actor = await context.human()
        result = await to_thread.run_sync(create_experiment, state, context.writer, body, actor)
        return experiment_created(await context.workspace.state(), body.experiment_id, result)

    return router
