from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from importlib.metadata import PackageNotFoundError, version
from typing import Final, Literal

from pydantic import AwareDatetime, Field, JsonValue
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from aqven.runtime.address import ResourceModel

HEALTH_PATH: Final = "/api/health"
READY_PATH: Final = "/api/ready"
ENGINE_DISTRIBUTION: Final = "aqven"
UNKNOWN_VERSION: Final = "0.0.0+unknown"
NO_STORE: Final = {"Cache-Control": "no-store"}
HEALTH_METHODS: Final = frozenset({"GET", "HEAD"})

type ServerPhase = Literal["starting", "ready", "stopping"]

PHASE_STATUS: Final[dict[ServerPhase, int]] = {"starting": 503, "ready": 200, "stopping": 503}


def aqven_version() -> str:
    try:
        return version(ENGINE_DISTRIBUTION)
    except PackageNotFoundError:
        return UNKNOWN_VERSION


class HealthReport(ResourceModel):
    status: ServerPhase
    pid: int = Field(ge=1)
    project_root: str
    version: str
    headless: bool
    started_at: AwareDatetime


@dataclass(frozen=True, slots=True)
class ServerIdentity:
    pid: int
    project_root: str
    headless: bool
    version: str = field(default_factory=aqven_version)
    started_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass(slots=True)
class Readiness:
    phase: ServerPhase = "starting"

    @property
    def ready(self) -> bool:
        return self.phase == "ready"

    def mark_ready(self) -> None:
        self.phase = "ready"

    def mark_stopping(self) -> None:
        self.phase = "stopping"


def health_report(readiness: Readiness, identity: ServerIdentity) -> HealthReport:
    return HealthReport(
        status=readiness.phase,
        pid=identity.pid,
        project_root=identity.project_root,
        version=identity.version,
        headless=identity.headless,
        started_at=identity.started_at,
    )


type HealthBody = Callable[[Readiness, ServerIdentity], dict[str, JsonValue]]


def full_health_body(readiness: Readiness, identity: ServerIdentity) -> dict[str, JsonValue]:
    return health_report(readiness, identity).model_dump(mode="json")


def ready_body(readiness: Readiness, identity: ServerIdentity) -> dict[str, JsonValue]:
    return {"status": readiness.phase, "engine_version": identity.version}


HEALTH_ROUTES: Final[Mapping[str, HealthBody]] = {
    HEALTH_PATH: full_health_body,
    READY_PATH: ready_body,
}


class HealthEndpoint:
    def __init__(self, app: ASGIApp, readiness: Readiness, identity: ServerIdentity) -> None:
        self.app = app
        self.readiness = readiness
        self.identity = identity

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        body = self._route(scope)
        if body is None:
            await self.app(scope, receive, send)
            return
        response = JSONResponse(
            body(self.readiness, self.identity),
            status_code=PHASE_STATUS[self.readiness.phase],
            headers=NO_STORE,
        )
        await response(scope, receive, send)

    def _route(self, scope: Scope) -> HealthBody | None:
        if scope["type"] != "http" or str(scope.get("method", "GET")).upper() not in HEALTH_METHODS:
            return None
        return HEALTH_ROUTES.get(str(scope.get("path", "")))
