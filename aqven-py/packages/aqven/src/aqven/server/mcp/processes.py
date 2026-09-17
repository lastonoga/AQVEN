import asyncio
import contextlib
import os
import signal
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Protocol

MILLISECONDS: Final = 1000
TEXT_ENCODING: Final = "utf-8"
POSIX: Final = "posix"


@dataclass(frozen=True, slots=True)
class ProcessOutcome:
    exit_code: int | None
    stdout: str
    stderr: str
    timed_out: bool
    duration_ms: int


class ProcessRunner(Protocol):
    async def run(self, argv: Sequence[str], *, cwd: Path, timeout_seconds: float) -> ProcessOutcome: ...


def tail(text: str, limit: int) -> str:
    return text[-limit:] if len(text) > limit else text


def _kill_group(process: asyncio.subprocess.Process) -> None:
    with contextlib.suppress(ProcessLookupError, PermissionError):
        os.killpg(process.pid, signal.SIGKILL)


def _kill_process(process: asyncio.subprocess.Process) -> None:
    with contextlib.suppress(ProcessLookupError):
        process.kill()


KILLERS: Final[Mapping[str, Callable[[asyncio.subprocess.Process], None]]] = {POSIX: _kill_group}


async def _read(stream: asyncio.StreamReader | None) -> bytes:
    if stream is None:
        return b""
    return await stream.read()


def _text(data: bytes) -> str:
    return data.decode(TEXT_ENCODING, errors="replace")


@dataclass(frozen=True, slots=True)
class SubprocessRunner:
    environment: Mapping[str, str] | None = None

    async def run(self, argv: Sequence[str], *, cwd: Path, timeout_seconds: float) -> ProcessOutcome:
        started = time.monotonic()
        process = await asyncio.create_subprocess_exec(
            *argv,
            cwd=cwd,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=None if self.environment is None else dict(self.environment),
            start_new_session=True,
        )
        output = asyncio.gather(_read(process.stdout), _read(process.stderr))
        timed_out = await _wait(process, timeout_seconds)
        stdout, stderr = await output
        elapsed = int((time.monotonic() - started) * MILLISECONDS)
        exit_code = None if timed_out else process.returncode
        return ProcessOutcome(exit_code, _text(stdout), _text(stderr), timed_out, elapsed)


async def _wait(process: asyncio.subprocess.Process, timeout_seconds: float) -> bool:
    try:
        async with asyncio.timeout(timeout_seconds):
            await process.wait()
    except TimeoutError:
        _kill(process)
        await process.wait()
        return True
    except asyncio.CancelledError:
        _kill(process)
        raise
    return False


def _kill(process: asyncio.subprocess.Process) -> None:
    KILLERS.get(os.name, _kill_process)(process)
