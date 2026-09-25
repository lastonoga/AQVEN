import argparse
import json
import re
import sys
import tomllib
from collections.abc import Sequence
from pathlib import Path
from typing import Final, cast

REPO_ROOT: Final = Path(__file__).resolve().parents[1]
ENGINE: Final = REPO_ROOT / "packages" / "aqven" / "pyproject.toml"
PROVIDERS: Final = REPO_ROOT / "packages" / "aqven-llm" / "pyproject.toml"
PLUGIN: Final = REPO_ROOT / "packages" / "aqven" / "src" / "aqven" / "agent_plugin" / ".claude-plugin" / "plugin.json"
VERSION_LINE: Final = re.compile(r'^version = "[^"]*"$', re.MULTILINE)
SIBLING_PIN: Final = re.compile(r'"aqven-llm(?P<extra>\[[a-z]+\])?==(?P<version>[^"]*)"')
RELEASE: Final = re.compile(r"^\d+\.\d+\.\d+(?:(?:a|b|rc|\.post|\.dev)\d+)?$")
EXIT_OK: Final = 0
EXIT_MISMATCH: Final = 1


def declared(path: Path) -> str:
    return str(tomllib.loads(path.read_text(encoding="utf-8"))["project"]["version"])


def plugin_manifest(path: Path) -> dict[str, object]:
    loaded: object = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(loaded, dict):
        raise ValueError(f"{path} is not a JSON object")
    return {str(key): value for key, value in cast(dict[object, object], loaded).items()}


def plugin_version(path: Path) -> str:
    return str(plugin_manifest(path).get("version"))


def sibling_pins(path: Path) -> list[str]:
    return [match.group("version") for match in SIBLING_PIN.finditer(path.read_text(encoding="utf-8"))]


def disagreements(expected: str, engine: Path, providers: Path, plugin: Path) -> list[str]:
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
    if plugin_version(plugin) != expected:
        found.append(f"agent plugin declares {plugin_version(plugin)}, expected {expected}")
    return found


def write_declared(path: Path, version: str) -> None:
    text = path.read_text(encoding="utf-8")
    path.write_text(VERSION_LINE.sub(f'version = "{version}"', text, count=1), encoding="utf-8")


def write_sibling_pins(path: Path, version: str) -> None:
    text = path.read_text(encoding="utf-8")
    replaced = SIBLING_PIN.sub(lambda match: f'"aqven-llm{match.group("extra") or ""}=={version}"', text)
    path.write_text(replaced, encoding="utf-8")


def write_plugin_version(path: Path, version: str) -> None:
    manifest = {**plugin_manifest(path), "version": version}
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def apply(version: str, engine: Path, providers: Path, plugin: Path) -> None:
    write_declared(engine, version)
    write_declared(providers, version)
    write_sibling_pins(engine, version)
    write_plugin_version(plugin, version)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="one version across aqven, aqven-llm, the pin between them and the agent plugin"
    )
    parser.add_argument("version", nargs="?", default=None, help="version to write; omit to print the current one")
    parser.add_argument("--check", action="store_true", help="verify agreement instead of writing")
    arguments = parser.parse_args(argv)

    if arguments.check:
        expected = arguments.version or declared(ENGINE)
        found = disagreements(expected, ENGINE, PROVIDERS, PLUGIN)
        if found:
            print("\n".join(found), file=sys.stderr)
            return EXIT_MISMATCH
        print(f"aqven, aqven-llm and the agent plugin agree on {expected}")
        return EXIT_OK

    if arguments.version is None:
        print(declared(ENGINE))
        return EXIT_OK

    if not RELEASE.match(arguments.version):
        print(f"not a release version: {arguments.version}", file=sys.stderr)
        return EXIT_MISMATCH

    apply(arguments.version, ENGINE, PROVIDERS, PLUGIN)
    print(f"aqven, aqven-llm and the agent plugin set to {arguments.version}; run uv lock")
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
