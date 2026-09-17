from dataclasses import dataclass

from aqven.diagnostics import Diagnostic, Severity
from aqven.loader import LoadedProject


@dataclass(frozen=True, slots=True)
class CheckReport:
    diagnostics: tuple[Diagnostic, ...]
    project: LoadedProject | None

    @property
    def errors(self) -> tuple[Diagnostic, ...]:
        return tuple(item for item in self.diagnostics if item.severity is Severity.ERROR)

    @property
    def warnings(self) -> tuple[Diagnostic, ...]:
        return tuple(item for item in self.diagnostics if item.severity is Severity.WARNING)

    @property
    def ok(self) -> bool:
        return not self.errors
