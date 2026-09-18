import sys
from pathlib import Path

from contract_engine import ScriptedEngine

from aqven.app import create_mcp_server


def main(root: str) -> None:
    create_mcp_server(Path(root), engine=ScriptedEngine()).run()


if __name__ == "__main__":
    main(sys.argv[1])
