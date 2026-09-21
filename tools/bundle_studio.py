import argparse
import hashlib
import shutil
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Final

REPO_ROOT: Final = Path(__file__).resolve().parents[1]
STUDIO_DIST: Final = REPO_ROOT / "apps" / "studio" / "dist"
BUNDLE: Final = REPO_ROOT / "packages" / "aqven" / "src" / "aqven" / "server" / "static"
INDEX: Final = "index.html"
BUILD_HINT: Final = "pnpm --filter @aqven/studio build"
EXIT_OK: Final = 0
EXIT_STALE: Final = 1


def digest(root: Path) -> dict[str, str]:
    if not root.is_dir():
        return {}
    return {
        path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


def differences(built: dict[str, str], bundled: dict[str, str]) -> list[str]:
    missing = sorted(f"missing from the package: {name}" for name in built.keys() - bundled.keys())
    extra = sorted(f"left over in the package: {name}" for name in bundled.keys() - built.keys())
    changed = sorted(
        f"differs from the build: {name}" for name in built.keys() & bundled.keys() if built[name] != bundled[name]
    )
    return missing + extra + changed


def replace(source: Path, target: Path) -> None:
    if target.is_dir():
        shutil.rmtree(target)
    shutil.copytree(source, target)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="copy the built Studio into the aqven package so the wheel serves it")
    parser.add_argument("--check", action="store_true", help="fail when the packaged Studio differs from the build")
    arguments = parser.parse_args(argv)

    if not (STUDIO_DIST / INDEX).is_file():
        print(f"Studio is not built: {STUDIO_DIST} has no {INDEX}. Run {BUILD_HINT}", file=sys.stderr)
        return EXIT_STALE

    built = digest(STUDIO_DIST)
    if not arguments.check:
        replace(STUDIO_DIST, BUNDLE)
        print(f"Studio packaged: {len(built)} files in {BUNDLE.relative_to(REPO_ROOT)}")
        return EXIT_OK

    found = differences(built, digest(BUNDLE))
    if not found:
        print(f"Studio in the package matches the build: {len(built)} files")
        return EXIT_OK

    print("\n".join(found), file=sys.stderr)
    print(f"Run {BUILD_HINT} and then python tools/bundle_studio.py", file=sys.stderr)
    return EXIT_STALE


if __name__ == "__main__":
    sys.exit(main())
