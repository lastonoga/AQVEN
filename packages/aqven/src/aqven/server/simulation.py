import asyncio
import sys
from asyncio.subprocess import DEVNULL, PIPE, Process
from contextlib import suppress
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Protocol

from pydantic import BaseModel, ConfigDict, ValidationError

from aqven.diagnostics import Diagnostic

CHECK_ARGUMENTS: Final = ("-P", "-m", "aqven", "check", "--simulation-only", "--format", "json")
DEFAULT_TIMEOUT_SECONDS: Final = 600.0
SUCCESS_CODES: Final = frozenset({0, 1})


class SimulationRun(Protocol):
    async def __call__(self) -> tuple[Diagnostic, ...]: ...


class CheckDocument(BaseModel):
    model_config = ConfigDict(extra="ignore")
    diagnostics: tuple[Diagnostic, ...] = ()


def parse_diagnostics(payload: bytes) -> tuple[Diagnostic, ...]:
    try:
        return CheckDocument.model_validate_json(payload).diagnostics
    except ValidationError:
        return ()


@dataclass(frozen=True, slots=True)
class SubprocessSimulation:
    root: Path
    python: str = sys.executable
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS

    async def __call__(self) -> tuple[Diagnostic, ...]:
        process = await asyncio.create_subprocess_exec(
            self.python, *CHECK_ARGUMENTS, str(self.root), cwd=self.root, stdout=PIPE, stderr=DEVNULL
        )
        try:
            stdout, _ = await asyncio.wait_for(process.communicate(), self.timeout_seconds)
        except TimeoutError:
            return ()
        finally:
            await reap(process)
        if process.returncode not in SUCCESS_CODES:
            return ()
        return parse_diagnostics(stdout)


async def reap(process: Process) -> None:
    if process.returncode is not None:
        return
    with suppress(ProcessLookupError):
        process.kill()
    await process.wait()
