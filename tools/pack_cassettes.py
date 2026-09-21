import argparse
import sys
from collections.abc import Sequence
from pathlib import Path

from aqven.models.cassette_blobs import blob_root, pack_directory


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Move large cassette payloads into a shared blobs folder")
    parser.add_argument("directory", type=Path, help="cassette directory, for example examples/tests/cassettes")
    arguments = parser.parse_args(argv)
    directory: Path = arguments.directory
    if not directory.is_dir():
        print(f"pack_cassettes: {directory} is not a directory", file=sys.stderr)
        return 2
    report = pack_directory(directory)
    print(f"{directory}: {report.line()}, blobs in {blob_root(directory)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
