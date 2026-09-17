import tempfile
import xml.etree.ElementTree as ElementTree
from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Final, Literal

from pydantic import Field

from aqven.runtime.address import RequestModel, ResourceModel
from aqven.server.mcp.catalog import Operation, ToolHints, ToolRegistration
from aqven.server.mcp.check_tools import OUTPUT_TAIL, RunnerSettings
from aqven.server.mcp.processes import ProcessOutcome, tail

REPORT_FILE: Final = "report.xml"
MAX_PYTEST_SECONDS: Final = 1800
DEFAULT_PYTEST_SECONDS: Final = 300
MAX_FAILURES: Final = 200
DEFAULT_FAILURES: Final = 50
DETAILS_LIMIT: Final = 2000
KEYWORD_PATTERN: Final = r"^[^-]"
CASE_SEPARATOR: Final = "::"

type PytestOutcome = Literal[
    "passed",
    "failed",
    "interrupted",
    "internal_error",
    "usage_error",
    "no_tests",
    "timed_out",
    "unknown",
]
type FailureKind = Literal["failure", "error"]

OUTCOMES: Final[Mapping[int, PytestOutcome]] = {
    0: "passed",
    1: "failed",
    2: "interrupted",
    3: "internal_error",
    4: "usage_error",
    5: "no_tests",
}
FAILURE_KINDS: Final[tuple[FailureKind, ...]] = ("failure", "error")


class PytestInput(RequestModel):
    paths: tuple[str, ...] = ()
    keyword: Annotated[str, Field(min_length=1, pattern=KEYWORD_PATTERN)] | None = None
    max_failures: Annotated[int, Field(ge=1)] | None = None
    limit: Annotated[int, Field(ge=1, le=MAX_FAILURES)] = DEFAULT_FAILURES
    timeout_seconds: Annotated[int, Field(ge=1, le=MAX_PYTEST_SECONDS)] = DEFAULT_PYTEST_SECONDS


class FailedTest(ResourceModel):
    test: str
    kind: FailureKind
    message: str
    details: str


class PytestResult(ResourceModel):
    outcome: PytestOutcome
    exit_code: int | None
    total: Annotated[int, Field(ge=0)]
    passed: Annotated[int, Field(ge=0)]
    failed: Annotated[int, Field(ge=0)]
    errors: Annotated[int, Field(ge=0)]
    skipped: Annotated[int, Field(ge=0)]
    failures: tuple[FailedTest, ...]
    omitted: Annotated[int, Field(ge=0)]
    duration_ms: Annotated[int, Field(ge=0)]
    output_tail: str


@dataclass(frozen=True, slots=True)
class JunitCounts:
    total: int
    failed: int
    errors: int
    skipped: int
    failures: tuple[FailedTest, ...]


EMPTY_COUNTS: Final = JunitCounts(total=0, failed=0, errors=0, skipped=0, failures=())


def pytest_command(settings: RunnerSettings, request: PytestInput, report: Path) -> tuple[str, ...]:
    keyword = ("-k", request.keyword) if request.keyword is not None else ()
    max_failures = (f"--maxfail={request.max_failures}",) if request.max_failures is not None else ()
    targets = settings.paths.workspace_test_targets(request.paths)
    return (
        settings.python,
        "-m",
        "pytest",
        "-q",
        "--no-header",
        "--color=no",
        "-p",
        "no:cacheprovider",
        f"--junitxml={report.as_posix()}",
        *keyword,
        *max_failures,
        *targets,
    )


def case_name(case: ElementTree.Element) -> str:
    owner = case.get("classname", "")
    name = case.get("name", "")
    return f"{owner}{CASE_SEPARATOR}{name}" if owner else name


def case_failures(case: ElementTree.Element) -> Iterator[FailedTest]:
    for kind in FAILURE_KINDS:
        for element in case.findall(kind):
            yield FailedTest(
                test=case_name(case),
                kind=kind,
                message=element.get("message", ""),
                details=tail(element.text or "", DETAILS_LIMIT),
            )


def junit_counts(report: Path) -> JunitCounts:
    if not report.is_file():
        return EMPTY_COUNTS
    try:
        cases = tuple(ElementTree.parse(report).getroot().iter("testcase"))
    except ElementTree.ParseError:
        return EMPTY_COUNTS
    failures = tuple(failure for case in cases for failure in case_failures(case))
    return JunitCounts(
        total=len(cases),
        failed=sum(1 for case in cases if case.find("failure") is not None),
        errors=sum(1 for case in cases if case.find("error") is not None),
        skipped=sum(1 for case in cases if case.find("skipped") is not None),
        failures=failures,
    )


def pytest_outcome(outcome: ProcessOutcome) -> PytestOutcome:
    if outcome.timed_out or outcome.exit_code is None:
        return "timed_out"
    return OUTCOMES.get(outcome.exit_code, "unknown")


def pytest_result(outcome: ProcessOutcome, counts: JunitCounts, limit: int) -> PytestResult:
    return PytestResult(
        outcome=pytest_outcome(outcome),
        exit_code=outcome.exit_code,
        total=counts.total,
        passed=max(counts.total - counts.failed - counts.errors - counts.skipped, 0),
        failed=counts.failed,
        errors=counts.errors,
        skipped=counts.skipped,
        failures=counts.failures[:limit],
        omitted=max(len(counts.failures) - limit, 0),
        duration_ms=outcome.duration_ms,
        output_tail=tail(f"{outcome.stdout}{outcome.stderr}", OUTPUT_TAIL),
    )


@dataclass(frozen=True, slots=True)
class PytestTool:
    settings: RunnerSettings

    async def run(self, request: PytestInput) -> PytestResult:
        with tempfile.TemporaryDirectory(prefix="aqven-pytest-") as folder:
            report = Path(folder) / REPORT_FILE
            outcome = await self.settings.runner.run(
                pytest_command(self.settings, request, report),
                cwd=self.settings.paths.workspace,
                timeout_seconds=request.timeout_seconds,
            )
            counts = junit_counts(report)
        return pytest_result(outcome, counts, request.limit)

    def operations(self) -> tuple[ToolRegistration, ...]:
        return (
            Operation(
                name="pytest_run",
                description=(
                    "Runs pytest in the project folder with the interpreter of the project environment. paths are "
                    "files, folders or node ids (tests/test_x.py::test_y) relative to the project root; keyword is a "
                    "-k expression; max_failures is --maxfail. Returns the outcome, counters, failed tests with "
                    "their messages and the output tail."
                ),
                input_model=PytestInput,
                output_model=PytestResult,
                surface="mcp_only",
                hints=ToolHints(title="pytest", read_only=False, idempotent=False),
                use_case=self.run,
            ),
        )
