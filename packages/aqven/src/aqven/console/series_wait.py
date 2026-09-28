import asyncio
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Final

import httpx2

from aqven.client import UnexpectedResponse

EXIT_UNREACHABLE: Final = 5
RETRY_BUDGET_SECONDS: Final = 300.0
FIRST_PAUSE_SECONDS: Final = 1.0
LONGEST_PAUSE_SECONDS: Final = 15.0
SERVER_ERROR_STATUS: Final = 500

type Notice = Callable[[str], None]
type Clock = Callable[[], float]
type Sleep = Callable[[float], Awaitable[None]]


class ServerUnreachable(Exception):
    def __init__(self, reason: str, seconds: float, outcome: str) -> None:
        super().__init__(f"the project server did not answer for {seconds:.0f}s: {reason}; {outcome}")
        self.reason = reason
        self.seconds = seconds
        self.outcome = outcome


def failure_reason(error: BaseException) -> str:
    text = str(error).strip()
    name = type(error).__name__
    return f"{name}: {text}" if text else name


def transient(error: Exception) -> bool:
    if isinstance(error, httpx2.TransportError):
        return True
    return isinstance(error, UnexpectedResponse) and error.status_code >= SERVER_ERROR_STATUS


@dataclass(frozen=True, slots=True)
class RetryPolicy:
    budget_seconds: float = RETRY_BUDGET_SECONDS
    first_pause_seconds: float = FIRST_PAUSE_SECONDS
    longest_pause_seconds: float = LONGEST_PAUSE_SECONDS

    def pause(self, attempt: int) -> float:
        return min(self.longest_pause_seconds, self.first_pause_seconds * 2**attempt)


@dataclass(frozen=True, slots=True)
class PatientCalls:
    policy: RetryPolicy
    notice: Notice
    clock: Clock = time.monotonic
    sleep: Sleep = asyncio.sleep

    async def call[T](self, action: Callable[[], Awaitable[T]], outcome: str) -> T:
        started = self.clock()
        attempt = 0
        while True:
            try:
                return await action()
            except (httpx2.TransportError, UnexpectedResponse) as error:
                await self._recover(error, started, attempt, outcome)
            attempt += 1

    async def _recover(self, error: Exception, started: float, attempt: int, outcome: str) -> None:
        if not transient(error):
            raise error
        waited = self.clock() - started
        pause = self.policy.pause(attempt)
        if waited + pause > self.policy.budget_seconds:
            raise ServerUnreachable(failure_reason(error), waited, outcome) from error
        self.notice(f"lost contact with the project server ({failure_reason(error)}), retrying in {pause:g}s")
        await self.sleep(pause)
