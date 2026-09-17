import contextlib
import json
import os
import shutil
import signal
import sys
from collections.abc import Generator
from pathlib import Path
from typing import Final

from mcp.client.stdio import StdioServerParameters
from mcp_types import CallToolResult
from pydantic import JsonValue, TypeAdapter

from aqven.app.locations import ProjectState
from aqven.app.runtime_file import ServerRecord, read_server_record

FIXTURES: Final = Path(__file__).resolve().parents[1] / "fixtures"
JSON_OBJECT: Final[TypeAdapter[dict[str, JsonValue]]] = TypeAdapter(dict[str, JsonValue])


def copy_fixture(name: str, target: Path) -> Path:
    destination = target / name
    shutil.copytree(FIXTURES / name, destination, ignore=shutil.ignore_patterns("__pycache__", ".aqven"))
    return destination.resolve()


def aqven_command(*arguments: str) -> tuple[str, ...]:
    return (sys.executable, "-m", "aqven", *arguments)


def bridge_parameters(root: Path, data_dir: Path) -> StdioServerParameters:
    environment = {**os.environ, "PYDANTIC_AI_NO_BANNER": "1"}
    return StdioServerParameters(
        command=sys.executable,
        args=["-m", "aqven", "mcp", str(root), "--data-dir", str(data_dir)],
        env=environment,
        cwd=str(root),
    )


def structured(result: CallToolResult) -> dict[str, JsonValue]:
    return JSON_OBJECT.validate_python(result.structured_content or {})


def server_record(root: Path) -> ServerRecord | None:
    return read_server_record(ProjectState(root))


@contextlib.contextmanager
def stopping_background_server(root: Path) -> Generator[None]:
    try:
        yield
    finally:
        record = server_record(root)
        if record is not None:
            with contextlib.suppress(ProcessLookupError):
                os.kill(record.pid, signal.SIGTERM)


def json_lines(text: str) -> list[dict[str, JsonValue]]:
    return [JSON_OBJECT.validate_python(json.loads(line)) for line in text.splitlines() if line.startswith("{")]
