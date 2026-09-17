from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Annotated, Final

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from aqven.diagnostics import Diagnostic, Severity
from aqven.runtime.address import RequestModel, ResourceModel
from aqven.server.mcp.catalog import Operation, ToolHints, ToolRegistration
from aqven.server.mcp.paths import ProjectPaths
from aqven.server.mcp.processes import ProcessOutcome, ProcessRunner, tail

CHECK_EXIT_CODES: Final = frozenset({0, 1})
OUTPUT_TAIL: Final = 4000
MAX_DIAGNOSTICS: Final = 500
DEFAULT_DIAGNOSTICS: Final = 100
MAX_CHECK_SECONDS: Final = 600
DEFAULT_CHECK_SECONDS: Final = 120
TIMEOUT_MESSAGE: Final = "check exceeded timeout_seconds and was stopped"


@dataclass(frozen=True, slots=True)
class RunnerSettings:
    paths: ProjectPaths
    runner: ProcessRunner
    python: str


class AqvenCheckInput(RequestModel):
    paths: tuple[str, ...] = ()
    include_warnings: bool = True
    limit: Annotated[int, Field(ge=1, le=MAX_DIAGNOSTICS)] = DEFAULT_DIAGNOSTICS
    timeout_seconds: Annotated[int, Field(ge=1, le=MAX_CHECK_SECONDS)] = DEFAULT_CHECK_SECONDS


class AqvenCheckResult(ResourceModel):
    ok: bool
    timed_out: bool
    project_root: str
    errors: Annotated[int, Field(ge=0)]
    warnings: Annotated[int, Field(ge=0)]
    diagnostics: tuple[Diagnostic, ...]
    omitted: Annotated[int, Field(ge=0)]
    duration_ms: Annotated[int, Field(ge=0)]
    failure: str | None


class _CheckDocument(BaseModel):
    model_config = ConfigDict(extra="ignore")
    diagnostics: tuple[Diagnostic, ...]


def check_command(settings: RunnerSettings) -> tuple[str, ...]:
    return (settings.python, "-m", "aqven", "check", "--format", "json", settings.paths.module.as_posix())


def selected(items: Iterable[Diagnostic], prefixes: Sequence[str], include_warnings: bool) -> tuple[Diagnostic, ...]:
    return tuple(
        item for item in items if (include_warnings or item.severity is Severity.ERROR) and _under(item.file, prefixes)
    )


def _under(file: str, prefixes: Sequence[str]) -> bool:
    if not prefixes or "" in prefixes:
        return True
    return any(file == prefix or file.startswith(f"{prefix}/") for prefix in prefixes)


def _failure_text(outcome: ProcessOutcome) -> str:
    return tail(f"exit code {outcome.exit_code}\n{outcome.stderr}\n{outcome.stdout}".strip(), OUTPUT_TAIL)


@dataclass(frozen=True, slots=True)
class ParsedCheck:
    diagnostics: tuple[Diagnostic, ...]
    failure: str | None


def failed_check(failure: str) -> ParsedCheck:
    return ParsedCheck(diagnostics=(), failure=failure)


def parse_check(outcome: ProcessOutcome) -> ParsedCheck:
    if outcome.timed_out:
        return failed_check(TIMEOUT_MESSAGE)
    if outcome.exit_code not in CHECK_EXIT_CODES:
        return failed_check(_failure_text(outcome))
    try:
        return ParsedCheck(_CheckDocument.model_validate_json(outcome.stdout).diagnostics, None)
    except ValidationError:
        return failed_check(_failure_text(outcome))


@dataclass(frozen=True, slots=True)
class AqvenCheckTool:
    settings: RunnerSettings

    async def check(self, request: AqvenCheckInput) -> AqvenCheckResult:
        prefixes = self.settings.paths.module_prefixes(request.paths)
        outcome = await self.settings.runner.run(
            check_command(self.settings),
            cwd=self.settings.paths.module,
            timeout_seconds=request.timeout_seconds,
        )
        parsed = parse_check(outcome)
        found = selected(parsed.diagnostics, prefixes, request.include_warnings)
        errors = sum(1 for item in found if item.severity is Severity.ERROR)
        return AqvenCheckResult(
            ok=errors == 0 and parsed.failure is None,
            timed_out=outcome.timed_out,
            project_root=self.settings.paths.module.as_posix(),
            errors=errors,
            warnings=len(found) - errors,
            diagnostics=found[: request.limit],
            omitted=max(len(found) - request.limit, 0),
            duration_ms=outcome.duration_ms,
            failure=parsed.failure,
        )

    def operations(self) -> tuple[ToolRegistration, ...]:
        return (
            Operation(
                name="aqven_check",
                description=(
                    "Full project check with the same compiler as `aqven check`: regenerates the type models and "
                    "returns diagnostics (code, severity, file, path, line, column, message). paths filters by "
                    "path prefixes relative to the project root with aqven.yaml. Call it after every edit of "
                    "YAML, a prompt or code."
                ),
                input_model=AqvenCheckInput,
                output_model=AqvenCheckResult,
                surface="rest_and_mcp",
                hints=ToolHints(title="aqven check", read_only=False, idempotent=True),
                use_case=self.check,
            ),
        )
