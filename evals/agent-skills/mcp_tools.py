import argparse
import asyncio
import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Final
from unittest.mock import create_autospec

from mcp.server import MCPServer
from pydantic import BaseModel, JsonValue

from aqven.ports.engine import EngineFacade
from aqven.series.ports import SeriesJobs
from aqven.server.mcp import (
    McpPorts,
    Operation,
    ProjectPaths,
    ToolRegistration,
    WriterPatchFlow,
    build_catalog,
    build_mcp_server,
)
from aqven.write import WriteService

EVALS: Final = Path(__file__).resolve().parent
REPO_ROOT: Final = EVALS.parents[1]
WORKSPACE: Final = REPO_ROOT / "examples"
PACKAGE: Final = WORKSPACE / "lumen"
LISTING: Final = EVALS / "mocks" / "aqven" / "_tools.json"
ENCODING: Final = "utf-8"
EXIT_OK: Final = 0
EXIT_STALE: Final = 1

type AnyOperation = Operation[BaseModel, BaseModel]


def full_catalog() -> tuple[ToolRegistration, ...]:
    ports = McpPorts(
        paths=ProjectPaths.of(WORKSPACE, PACKAGE),
        engine=create_autospec(EngineFacade, instance=True),
        patch_flow=WriterPatchFlow(WriteService(PACKAGE)),
        series=create_autospec(SeriesJobs, instance=True),
    )
    return build_catalog(ports)


def operations() -> dict[str, AnyOperation]:
    return {entry.name: entry for entry in full_catalog() if isinstance(entry, Operation)}


def full_surface() -> MCPServer:
    return build_mcp_server(full_catalog())


async def listing() -> str:
    tools = await full_surface().list_tools()
    entries: list[JsonValue] = [
        {"name": tool.name, "description": tool.description or "", "inputSchema": tool.input_schema}
        for tool in sorted(tools, key=lambda tool: tool.name)
    ]
    return json.dumps({"tools": entries}, indent=2, ensure_ascii=False) + "\n"


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="write the aqven MCP tool listing that the eval mocks serve")
    parser.add_argument("--check", action="store_true", help="fail when the listing differs from the tools")
    arguments = parser.parse_args(argv)
    text = asyncio.run(listing())
    if not arguments.check:
        LISTING.parent.mkdir(parents=True, exist_ok=True)
        LISTING.write_text(text, encoding=ENCODING)
        print(f"{LISTING.relative_to(EVALS)}: {text.count('"inputSchema"')} tools")
        return EXIT_OK
    current = LISTING.read_text(encoding=ENCODING) if LISTING.is_file() else ""
    if current == text:
        print("the MCP tool listing is current")
        return EXIT_OK
    print(f"{LISTING} is stale: run uv run --frozen python evals/agent-skills/mcp_tools.py", file=sys.stderr)
    return EXIT_STALE


if __name__ == "__main__":
    sys.exit(main())
