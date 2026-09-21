from collections.abc import Sequence
from dataclasses import dataclass

from aqven.check import CheckContext, RefResolver
from aqven.check.graph import ProjectGraph
from aqven.compiler.codes import absolute_code_ref
from aqven.compiler.errors import compile_failure
from aqven.compiler.schemas import ir_schema
from aqven.diagnostics import DiagnosticCode
from aqven.ir import JsonSchema
from aqven.loader import LoadedProject, YamlPath
from aqven.spec import CodeRef


@dataclass(frozen=True, slots=True)
class CompileContext:
    check: CheckContext

    @property
    def project(self) -> LoadedProject:
        return self.check.project

    @property
    def package(self) -> str:
        return self.check.spec.package

    @property
    def refs(self) -> RefResolver:
        return self.check.refs

    @property
    def graph(self) -> ProjectGraph:
        return self.check.graph

    def code(self, ref: str, file: str, path: YamlPath) -> CodeRef:
        absolute = absolute_code_ref(self.package, ref)
        if absolute is not None:
            return absolute
        message = f"reference {ref} does not resolve to module:function inside package {self.package}"
        raise compile_failure(DiagnosticCode.E_ALIAS_OUTSIDE_PACKAGE, file, path, message)

    def schema(self, annotation: object | None, file: str, path: YamlPath) -> JsonSchema:
        if annotation is None:
            message = "value shape cannot be built from the declared types: run aqven check first"
            raise compile_failure(DiagnosticCode.E_TYPE_UNKNOWN, file, path, message)
        return ir_schema(annotation)

    def type_schema(self, type_ref: str, file: str, path: YamlPath) -> JsonSchema:
        return self.schema(self.refs.type_annotation(type_ref), file, path)

    def text_file(self, candidates: Sequence[str], file: str, path: YamlPath, missing: str) -> str:
        found = next((candidate for candidate in candidates if candidate in self.project.texts), None)
        if found is None:
            raise compile_failure(DiagnosticCode.E_PROMPT_MISSING, file, path, missing)
        return found
