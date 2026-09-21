import asyncio
import os
import socket
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final, Protocol, Self

import httpx2
from pydantic import ValidationError

from aqven.app.health import HEALTH_PATH, HealthReport
from aqven.app.host_os import (
    OWNER_ONLY_FILE,
    PORT_BUSY_ERRNOS,
    ensure_private_file,
    process_alive,
    reserve_port_option,
    try_lock,
    unlock,
)
from aqven.app.locations import ProjectState
from aqven.app.runtime_file import ServerRecord, read_server_record

PROBE_TIMEOUT_SECONDS: Final = 1.0
PORT_ATTEMPTS: Final = 50
HIGHEST_PORT: Final = 65535
EPHEMERAL_PORT: Final = 0
HTTP_OK: Final = 200


class InstanceBusy(RuntimeError):
    def __init__(self, root: Path) -> None:
        super().__init__(f"aqven server for {root} is being started by another process and was not ready in time")
        self.root = root


class NoFreePort(OSError):
    def __init__(self, host: str, port: int, attempts: int) -> None:
        super().__init__(f"no free port on {host} in range {port}..{port + attempts - 1}")
        self.host = host
        self.port = port
        self.attempts = attempts


@dataclass(slots=True)
class InstanceLock:
    path: Path
    descriptor: int | None = field(default=None, init=False)

    def acquire(self) -> bool:
        if self.descriptor is not None:
            return True
        ensure_private_file(self.path)
        descriptor = os.open(self.path, os.O_RDWR | os.O_CREAT, OWNER_ONLY_FILE)
        if not try_lock(descriptor):
            os.close(descriptor)
            return False
        self.descriptor = descriptor
        return True

    def release(self) -> None:
        descriptor = self.descriptor
        if descriptor is None:
            return
        self.descriptor = None
        unlock(descriptor)
        os.close(descriptor)

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.release()


class ServerProbe(Protocol):
    async def health(self, record: ServerRecord) -> HealthReport | None: ...


@dataclass(frozen=True, slots=True)
class HttpServerProbe:
    timeout_seconds: float = PROBE_TIMEOUT_SECONDS
    transport: httpx2.AsyncBaseTransport | None = None

    async def health(self, record: ServerRecord) -> HealthReport | None:
        url = f"{record.url.rstrip('/')}{HEALTH_PATH}"
        try:
            async with httpx2.AsyncClient(
                timeout=self.timeout_seconds,
                transport=self.transport,
                trust_env=False,
            ) as client:
                response = await client.get(url, headers=record.authorization())
        except httpx2.HTTPError:
            return None
        return parse_health(response)


def parse_health(response: httpx2.Response) -> HealthReport | None:
    if response.status_code != HTTP_OK:
        return None
    try:
        return HealthReport.model_validate_json(response.content)
    except ValidationError:
        return None


def serves_project(report: HealthReport | None, record: ServerRecord, state: ProjectState) -> bool:
    if report is None or report.status != "ready" or report.pid != record.pid:
        return False
    return Path(report.project_root) == state.root


async def live_server(state: ProjectState, probe: ServerProbe) -> ServerRecord | None:
    record = read_server_record(state)
    if record is None or not process_alive(record.pid):
        return None
    report = await probe.health(record)
    return record if serves_project(report, record, state) else None


async def await_live_server(
    state: ProjectState,
    probe: ServerProbe,
    *,
    timeout_seconds: float,
    poll_seconds: float,
) -> ServerRecord | None:
    try:
        async with asyncio.timeout(timeout_seconds):
            return await _poll_live_server(state, probe, poll_seconds)
    except TimeoutError:
        return None


async def _poll_live_server(state: ProjectState, probe: ServerProbe, poll_seconds: float) -> ServerRecord:
    while (record := await live_server(state, probe)) is None:
        await asyncio.sleep(poll_seconds)
    return record


def bind_loopback(host: str, port: int, attempts: int = PORT_ATTEMPTS) -> socket.socket:
    candidates = (EPHEMERAL_PORT,) if port == EPHEMERAL_PORT else range(port, min(port + attempts, HIGHEST_PORT + 1))
    bound = (listener for candidate in candidates if (listener := try_bind(host, candidate)) is not None)
    listener = next(bound, None)
    if listener is None:
        raise NoFreePort(host, port, attempts)
    return listener


def try_bind(host: str, port: int) -> socket.socket | None:
    family = socket.AF_INET6 if ":" in host else socket.AF_INET
    listener = socket.socket(family, socket.SOCK_STREAM)
    try:
        reserve_port_option(listener)
        listener.bind((host, port))
    except OSError as error:
        listener.close()
        if error.errno in PORT_BUSY_ERRNOS:
            return None
        raise
    return listener


def bound_port(listener: socket.socket) -> int:
    address: tuple[str, int] = listener.getsockname()[:2]
    return address[1]
