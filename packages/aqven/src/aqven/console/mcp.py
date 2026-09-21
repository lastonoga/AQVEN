import asyncio
from collections.abc import Sequence
from pathlib import Path
from typing import Final

from aqven.app.background import BackgroundServer
from aqven.server.mcp.bridge import bridge_to

EXIT_OK: Final = 0


async def bridge_project(root: Path, server_arguments: Sequence[str]) -> None:
    record = await BackgroundServer().ensure(root, server_arguments)
    await bridge_to(record)


def run_mcp_bridge(root: Path, server_arguments: Sequence[str] = ()) -> int:
    asyncio.run(bridge_project(root, server_arguments))
    return EXIT_OK
