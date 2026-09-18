from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Final
from urllib.parse import urlencode

from fastapi import FastAPI

from aqven import (
    LocalAppOptions,
    LocalTokenAccess,
    Project,
    RunOptions,
    RunResult,
    create_local_app,
    load_project_env,
    local_app_lifespan,
    runtime_settings,
)
from lumen.types import CaseOutcome, CaseRequest

MODULE_ROOT: Final = Path(__file__).parent
SAMPLES: Final = MODULE_ROOT / "samples"
FLOW_ID: Final = "support_case"
MOUNT_PREFIX: Final = "/aqven"

load_project_env(MODULE_ROOT)

SETTINGS: Final = runtime_settings()
ACCESS: Final = LocalTokenAccess(port=SETTINGS.port)


def build_app(options: LocalAppOptions | None = None) -> FastAPI:
    return create_local_app(MODULE_ROOT, options or LocalAppOptions(access=ACCESS))


app: Final = build_app()


def studio_url(token: str = ACCESS.token) -> str:
    return f"http://{SETTINGS.host}:{SETTINGS.port}/?{urlencode({'access_token': token})}"


def project() -> Project:
    return Project.load(MODULE_ROOT)


def sample_request() -> CaseRequest:
    return CaseRequest.model_validate_json((SAMPLES / "case_request.json").read_bytes())


async def handle_case(request: CaseRequest, options: RunOptions | None = None) -> RunResult[CaseOutcome]:
    flow = project().flow_typed(FLOW_ID, CaseRequest, CaseOutcome)
    return await flow.run(request, options)


@asynccontextmanager
async def aqven_lifespan(host: FastAPI) -> AsyncGenerator[None]:
    async with local_app_lifespan(app):
        yield


def host_application() -> FastAPI:
    host = FastAPI(lifespan=aqven_lifespan)
    host.mount(MOUNT_PREFIX, app)
    return host
