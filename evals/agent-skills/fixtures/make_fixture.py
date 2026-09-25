import argparse
import shutil
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Final

FIXTURES: Final = Path(__file__).resolve().parent
REPO_ROOT: Final = FIXTURES.parents[2]
SOURCE: Final = REPO_ROOT / "examples" / "lumen"
TARGET: Final = FIXTURES / "lumen_trimmed" / "lumen"
DROPPED_NAMES: Final = frozenset(
    {
        "__pycache__",
        ".aqven",
        ".pytest_cache",
        ".ruff_cache",
        ".DS_Store",
        ".env",
        ".env.example",
        ".gitignore",
        "app.py",
        "__main__.py",
        "samples",
    }
)
EXIT_OK: Final = 0
EXIT_FAILED: Final = 1


def dropped(folder: str, names: list[str]) -> set[str]:
    return {name for name in names if name in DROPPED_NAMES}


def copied_files(target: Path) -> int:
    return sum(1 for path in target.rglob("*") if path.is_file())


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="copy examples/lumen into the trimmed eval fixture")
    parser.add_argument("--out", default=str(TARGET), help="package folder that receives the copy")
    arguments = parser.parse_args(argv)
    target = Path(arguments.out).resolve()
    if not (SOURCE / "aqven.yaml").is_file():
        print(f"{SOURCE} has no aqven.yaml", file=sys.stderr)
        return EXIT_FAILED
    shutil.rmtree(target, ignore_errors=True)
    shutil.copytree(SOURCE, target, ignore=dropped)
    print(f"{target}: {copied_files(target)} files from examples/lumen")
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
