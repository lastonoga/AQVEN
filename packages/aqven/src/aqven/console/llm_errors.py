from collections.abc import Iterator
from typing import Final

from aqven.runtime import AttemptCause, ModelErrorDetails, RunError

INDENT: Final = "    "
PATH_SEPARATOR: Final = "."


def error_lines(error: RunError) -> tuple[str, ...]:
    return tuple(_explanation(error.hint, error.details))


def cause_lines(cause: AttemptCause) -> tuple[str, ...]:
    return tuple(_explanation(cause.hint, cause.details))


def _explanation(hint: str | None, details: ModelErrorDetails | None) -> Iterator[str]:
    if hint is not None:
        yield f"{INDENT}hint: {hint}"
    if details is None:
        return
    context = [
        f"{label}: {value}"
        for label, value in (
            ("agent", details.agent),
            ("model", details.model),
            ("output mode", details.output_mode),
            ("attempt", details.attempt),
            ("provider", details.provider),
            ("HTTP status", details.status_code),
            ("provider code", details.provider_code),
        )
        if value is not None
    ]
    if context:
        yield f"{INDENT}{', '.join(context)}"
    for violation in details.violations:
        path = PATH_SEPARATOR.join(str(segment) for segment in violation.path) or "output"
        yield f"{INDENT}violation {path}: {violation.message}"
    if details.raw_excerpt:
        yield f"{INDENT}model output: {details.raw_excerpt}"
