import sys
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

import pytest
from mcp_support import ISOLATED_PYTEST, call, mcp_client, shop_copy, structured
from pydantic import JsonValue

from aqven.server.mcp import (
    AqvenCheckInput,
    AqvenCheckTool,
    ProcessOutcome,
    ProjectPaths,
    PyrightInput,
    PyrightTool,
    PytestInput,
    PytestTool,
    RunnerSettings,
    SubprocessRunner,
)

PASSING_TEST: Final = "def test_adds():\n    assert 1 + 1 == 2\n"
FAILING_TEST: Final = "def test_breaks():\n    assert 1 + 1 == 3, 'arithmetic is broken'\n"
SLEEPING_TEST: Final = "import time\n\n\ndef test_sleeps():\n    time.sleep(30)\n"
TYPED_MODULE: Final = "value: int = 1\n"
MISTYPED_MODULE: Final = "value: int = 1\nbroken: int = 'text'\n"


@dataclass(slots=True)
class ScriptedRunner:
    outcome: ProcessOutcome
    calls: list[tuple[tuple[str, ...], Path, float]] = field(default_factory=list[tuple[tuple[str, ...], Path, float]])

    async def run(self, argv: Sequence[str], *, cwd: Path, timeout_seconds: float) -> ProcessOutcome:
        self.calls.append((tuple(argv), cwd, timeout_seconds))
        return self.outcome


def settings(root: Path, runner: ScriptedRunner | SubprocessRunner) -> RunnerSettings:
    return RunnerSettings(paths=ProjectPaths.of(root, root), runner=runner, python=sys.executable)


def workspace(tmp_path: Path, files: dict[str, str]) -> Path:
    root = tmp_path / "workspace"
    for relative, text in files.items():
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
    return root


def codes(result: dict[str, JsonValue]) -> set[str]:
    items = result["diagnostics"]
    assert isinstance(items, list)
    return {str(item["code"]) for item in items if isinstance(item, dict)}


@pytest.mark.asyncio
async def test_aqven_check_on_clean_project_is_ok(tmp_path: Path) -> None:
    async with mcp_client(shop_copy(tmp_path)) as client:
        result = await call(client, "aqven_check", {})
    report = structured(result)
    assert result.is_error is False
    assert (report["ok"], report["errors"], report["failure"]) == (True, 0, None)


@pytest.mark.asyncio
async def test_aqven_check_reports_real_diagnostics_and_filters_paths(tmp_path: Path) -> None:
    root = shop_copy(tmp_path)
    flow = root / "flows" / "intake" / "flow.yaml"
    flow.write_text(flow.read_text(encoding="utf-8").replace('input: "Note"', 'input: "Nope"'), encoding="utf-8")
    async with mcp_client(root) as client:
        broken = structured(await call(client, "aqven_check", {}))
        elsewhere = structured(await call(client, "aqven_check", {"paths": ["agents"]}))
    assert broken["ok"] is False
    assert "E_TYPE_UNKNOWN" in codes(broken)
    items = broken["diagnostics"]
    assert isinstance(items, list)
    located = [item for item in items if isinstance(item, dict) and item["code"] == "E_TYPE_UNKNOWN"]
    assert located[0]["file"] == "flows/intake/flow.yaml"
    assert located[0]["line"] == 4
    assert (elsewhere["ok"], elsewhere["errors"], elsewhere["diagnostics"]) == (True, 0, [])


@pytest.mark.asyncio
async def test_aqven_check_rejects_paths_outside_project(tmp_path: Path) -> None:
    async with mcp_client(shop_copy(tmp_path)) as client:
        result = await call(client, "aqven_check", {"paths": ["../elsewhere"]})
    assert result.is_error is True
    error = structured(result)
    assert error["code"] == "REQUEST_INVALID"


@pytest.mark.asyncio
async def test_aqven_check_timeout_is_structured(tmp_path: Path) -> None:
    runner = ScriptedRunner(ProcessOutcome(None, "", "", timed_out=True, duration_ms=1000))
    result = await AqvenCheckTool(settings(tmp_path, runner)).check(AqvenCheckInput(timeout_seconds=1))
    assert (result.ok, result.timed_out) == (False, True)
    assert result.failure is not None
    assert runner.calls[0][0][1:6] == ("-P", "-m", "aqven", "check", "--format")
    assert runner.calls[0][2] == 1


@pytest.mark.asyncio
async def test_pyright_reports_type_errors_with_one_based_positions(tmp_path: Path) -> None:
    root = workspace(tmp_path, {"good.py": TYPED_MODULE, "bad.py": MISTYPED_MODULE})
    async with mcp_client(root) as client:
        broken = structured(await call(client, "pyright_check", {"paths": ["bad.py"]}))
        clean = structured(await call(client, "pyright_check", {"paths": ["good.py"]}))
    assert (broken["ok"], broken["errors"], broken["failure"]) == (False, 1, None)
    diagnostics = broken["diagnostics"]
    assert isinstance(diagnostics, list)
    first = diagnostics[0]
    assert isinstance(first, dict)
    assert (first["file"], first["line"], first["column"], first["rule"]) == ("bad.py", 2, 15, "reportAssignmentType")
    assert (clean["ok"], clean["errors"], clean["files_analyzed"]) == (True, 0, 1)


@pytest.mark.asyncio
async def test_pyright_missing_module_is_failure(tmp_path: Path) -> None:
    runner = ScriptedRunner(ProcessOutcome(1, "", "No module named pyright", timed_out=False, duration_ms=40))
    result = await PyrightTool(settings(tmp_path, runner)).check(PyrightInput())
    assert result.ok is False
    assert result.failure is not None
    assert "No module named pyright" in result.failure
    assert runner.calls[0][0][1:5] == ("-m", "pyright", "--outputjson", "--pythonpath")


@pytest.mark.asyncio
async def test_pytest_reports_failures_and_counts(tmp_path: Path) -> None:
    root = workspace(tmp_path, {"tests/test_math.py": PASSING_TEST + "\n\n" + FAILING_TEST})
    async with mcp_client(root, runner=SubprocessRunner(ISOLATED_PYTEST)) as client:
        failed = structured(await call(client, "pytest_run", {"paths": ["tests"]}))
        selected = structured(await call(client, "pytest_run", {"paths": ["tests/test_math.py::test_adds"]}))
        keyword = structured(await call(client, "pytest_run", {"keyword": "breaks"}))
    assert (failed["outcome"], failed["total"], failed["passed"], failed["failed"]) == ("failed", 2, 1, 1)
    failures = failed["failures"]
    assert isinstance(failures, list)
    failure = failures[0]
    assert isinstance(failure, dict)
    assert failure["test"] == "tests.test_math::test_breaks"
    assert "arithmetic is broken" in str(failure["message"])
    assert (selected["outcome"], selected["total"], selected["passed"]) == ("passed", 1, 1)
    assert (keyword["outcome"], keyword["total"], keyword["failed"]) == ("failed", 1, 1)


@pytest.mark.asyncio
async def test_pytest_without_tests_is_no_tests(tmp_path: Path) -> None:
    root = workspace(tmp_path, {"README.md": "empty\n"})
    result = await PytestTool(settings(root, SubprocessRunner(ISOLATED_PYTEST))).run(PytestInput())
    assert (result.outcome, result.total) == ("no_tests", 0)


@pytest.mark.asyncio
async def test_pytest_timeout_kills_run(tmp_path: Path) -> None:
    root = workspace(tmp_path, {"tests/test_slow.py": SLEEPING_TEST})
    result = await PytestTool(settings(root, SubprocessRunner(ISOLATED_PYTEST))).run(PytestInput(timeout_seconds=2))
    assert (result.outcome, result.exit_code) == ("timed_out", None)
    assert result.duration_ms < 15000


@pytest.mark.asyncio
async def test_pytest_rejects_keyword_options(tmp_path: Path) -> None:
    async with mcp_client(shop_copy(tmp_path)) as client:
        result = await call(client, "pytest_run", {"keyword": "--collect-only"})
    assert result.is_error is True


@pytest.mark.asyncio
async def test_subprocess_runner_kills_on_timeout(tmp_path: Path) -> None:
    outcome = await SubprocessRunner().run(
        (sys.executable, "-c", "import time; print('started', flush=True); time.sleep(30)"),
        cwd=tmp_path,
        timeout_seconds=1.5,
    )
    assert (outcome.timed_out, outcome.exit_code) == (True, None)
    assert outcome.duration_ms < 10000
