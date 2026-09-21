import os
import subprocess
import sys
from collections.abc import Mapping
from pathlib import Path
from typing import Final

from pydantic import JsonValue, TypeAdapter

SHOWCASE_ROOT: Final = Path(__file__).resolve().parents[1]
PROBE: Final = Path(__file__).with_name("main_probe.py")
PROBE_SECONDS: Final = 300
PROBE_RESULT: Final = TypeAdapter(dict[str, JsonValue])


def probe_environment(home: Path, values: Mapping[str, str]) -> dict[str, str]:
    base = {name: value for name, value in os.environ.items() if not name.startswith("AQVEN_")}
    return {**base, "HOME": str(home), "PYTHONPATH": str(SHOWCASE_ROOT), **values}


def run_probe(home: Path, **values: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(PROBE)],
        cwd=SHOWCASE_ROOT,
        env=probe_environment(home, values),
        capture_output=True,
        text=True,
        timeout=PROBE_SECONDS,
        check=False,
    )


def probe(home: Path, **values: str) -> dict[str, JsonValue]:
    finished = run_probe(home, **values)
    assert finished.returncode == 0, finished.stderr
    return PROBE_RESULT.validate_json(finished.stdout)


def test_main_serves_studio_and_mcp_by_default(tmp_path: Path) -> None:
    result = probe(tmp_path)

    assert result["studio"] is True
    assert result["mounts"] == ["/mcp"]
    assert result["host_mounts"] == ["/aqven"]
    assert (result["host"], result["port"]) == ("127.0.0.1", 5180)
    assert isinstance(result["url"], str)
    assert result["url"].startswith("http://127.0.0.1:5180/?access_token=")
    assert result["flow"] == "support_case"
    assert result["sample"]


def test_env_switches_studio_off_and_moves_the_port(tmp_path: Path) -> None:
    result = probe(tmp_path, AQVEN_STUDIO="false", AQVEN_PORT="6123")

    assert result["studio"] is False
    assert result["mounts"] == ["/mcp"]
    assert result["port"] == 6123


def test_invalid_environment_value_stops_the_start(tmp_path: Path) -> None:
    finished = run_probe(tmp_path, AQVEN_PORT="many")

    assert finished.returncode != 0
    assert "AQVEN_PORT='many'" in finished.stderr
