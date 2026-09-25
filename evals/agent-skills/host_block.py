import argparse
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Final

from aqven.chat.host_block import HostFacts, host_block

PACKAGE: Final = "lumen"
STAND_IN_ROOT: Final = Path("/aqven-eval-project") / PACKAGE
ROOT_PLACEHOLDER: Final = "<project_root>"
DEFAULT_MCP_URL: Final = "http://127.0.0.1:5180/mcp"
EXIT_OK: Final = 0


def rendered(mcp_url: str) -> str:
    text = host_block("claude", HostFacts.of(STAND_IN_ROOT, mcp_url))
    return text.replace(str(STAND_IN_ROOT), ROOT_PLACEHOLDER) + "\n"


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="write the Studio host block for Claude that the eval wrappers carry")
    parser.add_argument("--out", required=True, help="file that receives the host block")
    parser.add_argument("--mcp-url", default=DEFAULT_MCP_URL, help="MCP URL of the project server")
    arguments = parser.parse_args(argv)
    target = Path(arguments.out)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(rendered(str(arguments.mcp_url)), encoding="utf-8")
    print(f"{target}: Claude host block, project root left as {ROOT_PLACEHOLDER}")
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
