from pathlib import Path

import pytest
from check_uv_lock import DEFAULT_LOCK, OK_MESSAGE, LockedPackage, consumers, main, violations

EXTRA_LOCK = """
version = 1

[[package]]
name = "aqven"
version = "0.0.0"
dependencies = [{ name = "httpx" }, { name = "httpx2" }]

[[package]]
name = "fastapi"
version = "0.141.1"

[package.optional-dependencies]
standard = [{ name = "httpx" }, { name = "uvicorn" }]

[[package]]
name = "workspace"
version = "0.0.0"

[package.dev-dependencies]
dev = [{ name = "requests" }]
"""


def package(name: str, *dependencies: str) -> LockedPackage:
    return {"name": name, "dependencies": [{"name": dependency} for dependency in dependencies]}


def test_allowed_consumers_pass() -> None:
    packages = [
        package("aqven", "httpx", "httpx2"),
        package("google-genai", "httpx", "requests"),
        package("groq", "httpx"),
        package("opentelemetry-exporter-otlp-proto-http", "requests"),
    ]

    assert violations(packages) == []


def test_unlisted_direct_consumer_fails() -> None:
    packages = [package("aqven", "httpx"), package("stray-sdk", "httpx", "requests")]

    assert violations(packages) == ["httpx <- stray-sdk", "requests <- stray-sdk"]


def test_optional_and_dev_dependencies_count(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    lock = tmp_path / "uv.lock"
    lock.write_text(EXTRA_LOCK, encoding="utf-8")

    code = main([str(lock)])

    assert code == 1
    assert capsys.readouterr().out.splitlines() == ["httpx <- fastapi", "requests <- workspace"]


def test_consumers_ignore_packages_without_dependencies() -> None:
    packages: list[LockedPackage] = [{"name": "leaf"}, package("aqven", "httpx")]

    assert consumers(packages, "httpx") == frozenset({"aqven"})


def test_workspace_lock_is_clean(capsys: pytest.CaptureFixture[str]) -> None:
    assert DEFAULT_LOCK.is_file()

    code = main([])

    assert (code, capsys.readouterr().out.strip()) == (0, OK_MESSAGE)
