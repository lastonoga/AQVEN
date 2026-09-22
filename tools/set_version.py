import argparse
import re
import sys
import tomllib
from collections.abc import Sequence
from pathlib import Path
from typing import Final

REPO_ROOT: Final = Path(__file__).resolve().parents[1]
ENGINE: Final = REPO_ROOT / "packages" / "aqven" / "pyproject.toml"
PROVIDERS: Final = REPO_ROOT / "packages" / "aqven-llm" / "pyproject.toml"
VERSION_LINE: Final = re.compile(r'^version = "[^"]*"$', re.MULTILINE)
SIBLING_PIN: Final = re.compile(r'"aqven-llm(?P<extra>\[[a-z]+\])?==(?P<version>[^"]*)"')
RELEASE: Final = re.compile(r"^\d+\.\d+\.\d+(?:(?:a|b|rc|\.post|\.dev)\d+)?$")
EXIT_OK: Final = 0
EXIT_MISMATCH: Final = 1


def declared(path: Path) -> str:
    return str(tomllib.loads(path.read_text(encoding="utf-8"))["project"]["version"])


def sibling_pins(path: Path) -> list[str]:
    return [match.group("version") for match in SIBLING_PIN.finditer(path.read_text(encoding="utf-8"))]


def disagreements(expected: str, engine: Path, providers: Path) -> list[str]:
    found = [
        f"{path.parent.name} declares {declared(path)}, expected {expected}"
        for path in (engine, providers)
        if declared(path) != expected
    ]
    found.extend(
        f"aqven depends on aqven-llm=={pin}, expected {expected}"
        for pin in sorted(set(sibling_pins(engine)))
        if pin != expected
    )
    return found


def write_declared(path: Path, version: str) -> None:
    text = path.read_text(encoding="utf-8")
    path.write_text(VERSION_LINE.sub(f'version = "{version}"', text, count=1), encoding="utf-8")


def write_sibling_pins(path: Path, version: str) -> None:
    text = path.read_text(encoding="utf-8")
    replaced = SIBLING_PIN.sub(lambda match: f'"aqven-llm{match.group("extra") or ""}=={version}"', text)
    path.write_text(replaced, encoding="utf-8")


def apply(version: str, engine: Path, providers: Path) -> None:
    write_declared(engine, version)
    write_declared(providers, version)
    write_sibling_pins(engine, version)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="one version across aqven and aqven-llm, including the pin between them"
    )
    parser.add_argument("version", nargs="?", default=None, help="version to write; omit to print the current one")
    parser.add_argument("--check", action="store_true", help="verify agreement instead of writing")
    arguments = parser.parse_args(argv)

    if arguments.check:
        expected = arguments.version or declared(ENGINE)
        found = disagreements(expected, ENGINE, PROVIDERS)
        if found:
            print("\n".join(found), file=sys.stderr)
            return EXIT_MISMATCH
        print(f"aqven and aqven-llm agree on {expected}")
        return EXIT_OK

    if arguments.version is None:
        print(declared(ENGINE))
        return EXIT_OK

    if not RELEASE.match(arguments.version):
        print(f"not a release version: {arguments.version}", file=sys.stderr)
        return EXIT_MISMATCH

    apply(arguments.version, ENGINE, PROVIDERS)
    print(f"aqven and aqven-llm set to {arguments.version}; run uv lock")
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
