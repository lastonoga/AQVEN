import argparse
import asyncio
import sys
from pathlib import Path

from local_stubs import EchoApplicationFactory, RecordingEngineHost

from aqven.app.options import add_server_arguments, server_options
from aqven.app.runtime import LocalServer, Reused, Started


async def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="local-server-harness")
    add_server_arguments(parser)
    options = server_options(parser.parse_args(argv), Path.cwd())
    server = LocalServer(application=EchoApplicationFactory(), engine=RecordingEngineHost())
    outcome = await server.serve(options)
    match outcome:
        case Started(record=record):
            print(f"started {record.pid}", flush=True)
        case Reused(record=record):
            print(f"reused {record.pid}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1:])))
