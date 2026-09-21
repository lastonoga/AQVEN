import os
from pathlib import Path
from typing import Final

TRACE_ENV: Final = "RELAY_TRACE"
GATE_ENV: Final = "RELAY_GATE"


def mark(entry: str) -> None:
    location = os.environ.get(TRACE_ENV)
    if not location:
        return
    with Path(location).open("a", encoding="utf-8") as stream:
        stream.write(f"{entry}\n")
        stream.flush()
        os.fsync(stream.fileno())


def gate_open() -> bool:
    location = os.environ.get(GATE_ENV)
    return not location or Path(location).exists()
