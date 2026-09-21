import sys
import tomllib
from collections.abc import Iterable, Mapping, Sequence
from pathlib import Path
from typing import Final, NotRequired, TypedDict, cast


class LockedDependency(TypedDict):
    name: str


type DependencyGroups = dict[str, list[LockedDependency]]

LockedPackage = TypedDict(
    "LockedPackage",
    {
        "name": str,
        "dependencies": NotRequired[list[LockedDependency]],
        "optional-dependencies": NotRequired[DependencyGroups],
        "dev-dependencies": NotRequired[DependencyGroups],
    },
)


class LockFile(TypedDict):
    package: NotRequired[list[LockedPackage]]


DEFAULT_LOCK: Final = Path(__file__).resolve().parents[1] / "uv.lock"
OK_MESSAGE: Final = "uv.lock: ok"
EXIT_OK: Final = 0
EXIT_VIOLATIONS: Final = 1

ALLOWED_CONSUMERS: Final[Mapping[str, frozenset[str]]] = {
    "httpx": frozenset(
        {
            "aqven",
            "cohere",
            "google-genai",
            "groq",
            "huggingface-hub",
            "mistralai",
        }
    ),
    "requests": frozenset(
        {
            "cohere",
            "google-auth",
            "google-genai",
            "opentelemetry-exporter-otlp-proto-http",
            "tiktoken",
            "xai-sdk",
        }
    ),
}


def declared_names(package: LockedPackage) -> frozenset[str]:
    groups: Iterable[list[LockedDependency]] = (
        package.get("dependencies", []),
        *package.get("optional-dependencies", {}).values(),
        *package.get("dev-dependencies", {}).values(),
    )
    return frozenset(entry["name"] for group in groups for entry in group)


def consumers(packages: Sequence[LockedPackage], dependency: str) -> frozenset[str]:
    return frozenset(package["name"] for package in packages if dependency in declared_names(package))


def violations(
    packages: Sequence[LockedPackage], allowed: Mapping[str, frozenset[str]] = ALLOWED_CONSUMERS
) -> list[str]:
    return [
        f"{dependency} <- {name}"
        for dependency, permitted in allowed.items()
        for name in sorted(consumers(packages, dependency) - permitted)
    ]


def read_packages(lock_path: Path) -> list[LockedPackage]:
    document = cast(LockFile, tomllib.loads(lock_path.read_text(encoding="utf-8")))
    return document.get("package", [])


def main(argv: Sequence[str] | None = None) -> int:
    arguments = sys.argv[1:] if argv is None else list(argv)
    lock_path = Path(arguments[0]) if arguments else DEFAULT_LOCK
    found = violations(read_packages(lock_path))
    print("\n".join(found) or OK_MESSAGE)
    return EXIT_VIOLATIONS if found else EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
