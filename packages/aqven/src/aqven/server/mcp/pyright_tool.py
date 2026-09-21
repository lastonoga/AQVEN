from dataclasses import dataclass
from typing import Annotated, Final, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from aqven.runtime.address import RequestModel, ResourceModel
from aqven.server.mcp.catalog import Operation, ToolHints, ToolRegistration
from aqven.server.mcp.check_tools import (
    DEFAULT_DIAGNOSTICS,
    MAX_DIAGNOSTICS,
    OUTPUT_TAIL,
    RunnerSettings,
)
from aqven.server.mcp.paths import ProjectPaths
from aqven.server.mcp.processes import ProcessOutcome, tail

PYRIGHT_EXIT_CODES: Final = frozenset({0, 1})
MAX_PYRIGHT_SECONDS: Final = 900
DEFAULT_PYRIGHT_SECONDS: Final = 180
TIMEOUT_MESSAGE: Final = "pyright exceeded timeout_seconds and was stopped"

type PyrightSeverity = Literal["error", "warning", "information"]


class PyrightInput(RequestModel):
    paths: tuple[str, ...] = ()
    limit: Annotated[int, Field(ge=1, le=MAX_DIAGNOSTICS)] = DEFAULT_DIAGNOSTICS
    timeout_seconds: Annotated[int, Field(ge=1, le=MAX_PYRIGHT_SECONDS)] = DEFAULT_PYRIGHT_SECONDS


class PyrightDiagnostic(ResourceModel):
    file: str
    severity: PyrightSeverity
    rule: str | None
    message: str
    line: Annotated[int, Field(ge=1)]
    column: Annotated[int, Field(ge=1)]
    end_line: Annotated[int, Field(ge=1)]
    end_column: Annotated[int, Field(ge=1)]


class PyrightResult(ResourceModel):
    ok: bool
    exit_code: int | None
    timed_out: bool
    version: str | None
    files_analyzed: Annotated[int, Field(ge=0)]
    errors: Annotated[int, Field(ge=0)]
    warnings: Annotated[int, Field(ge=0)]
    informations: Annotated[int, Field(ge=0)]
    diagnostics: tuple[PyrightDiagnostic, ...]
    omitted: Annotated[int, Field(ge=0)]
    duration_ms: Annotated[int, Field(ge=0)]
    failure: str | None


class _Wire(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)


class _Position(_Wire):
    line: int
    character: int


class _Range(_Wire):
    start: _Position
    end: _Position


ORIGIN: Final = _Range(start=_Position(line=0, character=0), end=_Position(line=0, character=0))


class _Report(_Wire):
    file: str = ""
    severity: PyrightSeverity
    message: str
    range: _Range = ORIGIN
    rule: str | None = None


class _Summary(_Wire):
    files_analyzed: int = Field(default=0, alias="filesAnalyzed")
    error_count: int = Field(default=0, alias="errorCount")
    warning_count: int = Field(default=0, alias="warningCount")
    information_count: int = Field(default=0, alias="informationCount")


class _Document(_Wire):
    version: str | None = None
    general_diagnostics: tuple[_Report, ...] = Field(default=(), alias="generalDiagnostics")
    summary: _Summary = _Summary()


def pyright_command(settings: RunnerSettings, targets: tuple[str, ...]) -> tuple[str, ...]:
    return (settings.python, "-m", "pyright", "--outputjson", "--pythonpath", settings.python, *targets)


def diagnostic_view(report: _Report, paths: ProjectPaths) -> PyrightDiagnostic:
    return PyrightDiagnostic(
        file=paths.workspace_relative(report.file),
        severity=report.severity,
        rule=report.rule,
        message=report.message,
        line=report.range.start.line + 1,
        column=report.range.start.character + 1,
        end_line=report.range.end.line + 1,
        end_column=report.range.end.character + 1,
    )


def parse_pyright(outcome: ProcessOutcome) -> _Document | str:
    if outcome.timed_out:
        return TIMEOUT_MESSAGE
    failure = tail(f"exit code {outcome.exit_code}\n{outcome.stderr}\n{outcome.stdout}".strip(), OUTPUT_TAIL)
    if outcome.exit_code not in PYRIGHT_EXIT_CODES:
        return failure
    try:
        return _Document.model_validate_json(outcome.stdout)
    except ValidationError:
        return failure


def failed_result(outcome: ProcessOutcome, failure: str) -> PyrightResult:
    return PyrightResult(
        ok=False,
        exit_code=outcome.exit_code,
        timed_out=outcome.timed_out,
        version=None,
        files_analyzed=0,
        errors=0,
        warnings=0,
        informations=0,
        diagnostics=(),
        omitted=0,
        duration_ms=outcome.duration_ms,
        failure=failure,
    )


def document_result(outcome: ProcessOutcome, document: _Document, paths: ProjectPaths, limit: int) -> PyrightResult:
    reports = document.general_diagnostics
    summary = document.summary
    return PyrightResult(
        ok=summary.error_count == 0,
        exit_code=outcome.exit_code,
        timed_out=False,
        version=document.version,
        files_analyzed=summary.files_analyzed,
        errors=summary.error_count,
        warnings=summary.warning_count,
        informations=summary.information_count,
        diagnostics=tuple(diagnostic_view(report, paths) for report in reports[:limit]),
        omitted=max(len(reports) - limit, 0),
        duration_ms=outcome.duration_ms,
        failure=None,
    )


@dataclass(frozen=True, slots=True)
class PyrightTool:
    settings: RunnerSettings

    async def check(self, request: PyrightInput) -> PyrightResult:
        targets = self.settings.paths.workspace_targets(request.paths)
        outcome = await self.settings.runner.run(
            pyright_command(self.settings, targets),
            cwd=self.settings.paths.workspace,
            timeout_seconds=request.timeout_seconds,
        )
        parsed = parse_pyright(outcome)
        if isinstance(parsed, str):
            return failed_result(outcome, parsed)
        return document_result(outcome, parsed, self.settings.paths, request.limit)

    def operations(self) -> tuple[ToolRegistration, ...]:
        return (
            Operation(
                name="pyright_check",
                description=(
                    "pyright type check in the project folder with the interpreter of the project environment. "
                    "paths are files or folders relative to the project root; without paths, the whole folder per "
                    "pyrightconfig or [tool.pyright]. Lines and columns start at 1."
                ),
                input_model=PyrightInput,
                output_model=PyrightResult,
                surface="mcp_only",
                hints=ToolHints(title="pyright", read_only=True, idempotent=True),
                use_case=self.check,
            ),
        )
