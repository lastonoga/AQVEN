from collections.abc import Iterable

from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic, format_text
from aqven.loader import YamlPath


class CompileError(Exception):
    def __init__(self, diagnostics: Iterable[Diagnostic]) -> None:
        self.diagnostics = tuple(diagnostics)
        super().__init__(format_text(self.diagnostics))


def compile_failure(code: DiagnosticCode, file: str, path: YamlPath, message: str) -> CompileError:
    return CompileError((diagnostic(code, file, path, message),))
