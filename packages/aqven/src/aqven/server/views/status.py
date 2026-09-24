import asyncio
from collections.abc import Awaitable, Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Annotated, Final, Literal

from pydantic import AwareDatetime, Field

from aqven.app.secret_names import ProjectSecretNames
from aqven.runtime.address import ResourceModel
from aqven.server.context import ServerContext
from aqven.server.probes import StatusProbe
from aqven.server.resources import Count, ProjectInfo
from aqven.server.views.files import project_info
from aqven.server.views.secrets import ProviderKeyStatus, provider_key_statuses
from aqven.server.workspace import utc_now

MAX_STATUS_NAMES: Final = 20

type StatusCheckId = Literal["database", "engine", "project", "model_keys"]
type StatusState = Literal["ok", "warning", "error"]
type StatusNames = Annotated[tuple[str, ...], Field(max_length=MAX_STATUS_NAMES)]


class StatusCheck(ResourceModel):
    id: StatusCheckId
    state: StatusState
    counts: dict[str, Count]
    names: StatusNames


class ServerStatus(ResourceModel):
    checked_at: AwareDatetime
    checks: tuple[StatusCheck, ...]


@dataclass(frozen=True, slots=True)
class StatusSources:
    context: ServerContext
    names: ProjectSecretNames


type StatusChecker = Callable[[StatusSources], Awaitable[StatusCheck]]


def capped(names: Iterable[str]) -> tuple[str, ...]:
    return tuple(names)[:MAX_STATUS_NAMES]


def failed_check(check_id: StatusCheckId) -> StatusCheck:
    return StatusCheck(id=check_id, state="error", counts={}, names=())


async def probe_check(check_id: StatusCheckId, probe: StatusProbe, timeout_seconds: float) -> StatusCheck:
    async with asyncio.timeout(timeout_seconds):
        await probe.ping()
    return StatusCheck(id=check_id, state="ok", counts={}, names=())


async def database_check(sources: StatusSources) -> StatusCheck:
    probes = sources.context.probes
    return await probe_check("database", probes.database, probes.timeout_seconds)


async def engine_check(sources: StatusSources) -> StatusCheck:
    probes = sources.context.probes
    return await probe_check("engine", probes.engine, probes.timeout_seconds)


def project_state(info: ProjectInfo) -> StatusState:
    if info.problems.error > 0 or info.quarantined_files:
        return "error"
    if info.problems.warning > 0 or info.index.status != "ready" or info.index.pending_files > 0:
        return "warning"
    return "ok"


def project_verdict(info: ProjectInfo) -> StatusCheck:
    counts = {
        "errors": info.problems.error,
        "warnings": info.problems.warning,
        "quarantined": len(info.quarantined_files),
        "pending": info.index.pending_files,
    }
    return StatusCheck(id="project", state=project_state(info), counts=counts, names=capped(info.quarantined_files))


async def project_check(sources: StatusSources) -> StatusCheck:
    context = sources.context
    state = await context.workspace.state()
    return project_verdict(project_info(state, context.engine_version, context.hub.seq, context.mcp_url))


def model_keys_verdict(statuses: Sequence[ProviderKeyStatus]) -> StatusCheck:
    declared = tuple(item for item in statuses if item.declared)
    missing = sorted(item.provider for item in declared if item.source is None)
    counts = {"declared": len(declared), "missing": len(missing)}
    return StatusCheck(id="model_keys", state="warning" if missing else "ok", counts=counts, names=capped(missing))


async def model_keys_check(sources: StatusSources) -> StatusCheck:
    context = sources.context
    return model_keys_verdict(await provider_key_statuses(context.settings, context.environ, sources.names))


STATUS_CHECKERS: Final[Mapping[StatusCheckId, StatusChecker]] = {
    "database": database_check,
    "engine": engine_check,
    "project": project_check,
    "model_keys": model_keys_check,
}


async def guarded_check(check_id: StatusCheckId, checker: StatusChecker, sources: StatusSources) -> StatusCheck:
    try:
        return await checker(sources)
    except Exception:
        return failed_check(check_id)


async def server_status(
    sources: StatusSources,
    checkers: Mapping[StatusCheckId, StatusChecker] = STATUS_CHECKERS,
    clock: Callable[[], datetime] = utc_now,
) -> ServerStatus:
    checks = await asyncio.gather(*(guarded_check(key, checker, sources) for key, checker in checkers.items()))
    return ServerStatus(checked_at=clock(), checks=tuple(checks))
