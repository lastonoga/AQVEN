from collections.abc import Callable, Iterator, Mapping
from dataclasses import dataclass

from aqven.check.context import CheckContext
from aqven.check.subjects import subject_flow, subject_label
from aqven.diagnostics import Diagnostic, DiagnosticCode, templated_diagnostic
from aqven.loader import LoadedExperiment, LoadedFlow, YamlPath
from aqven.spec import ExperimentSpec, VariantId


@dataclass(frozen=True, slots=True)
class ExperimentSite:
    context: CheckContext
    loaded: LoadedExperiment

    @property
    def spec(self) -> ExperimentSpec:
        return self.loaded.source.spec

    @property
    def file(self) -> str:
        return self.loaded.source.path

    @property
    def subject(self) -> LoadedFlow | None:
        return subject_flow(self.context, self.loaded)

    @property
    def label(self) -> str:
        return subject_label(self.spec.subject)

    @property
    def variant_ids(self) -> tuple[VariantId, ...]:
        return tuple(variant.id for variant in self.spec.variants)

    @property
    def check_ids(self) -> tuple[str, ...]:
        return tuple(check.id for check in self.spec.checks or ())

    def values(self, **values: str) -> Mapping[str, str]:
        return {"experiment": self.loaded.experiment_id, **values}

    def problem(self, code: DiagnosticCode, path: YamlPath, problem: str, fix: str) -> Diagnostic:
        return templated_diagnostic(code, self.file, path, self.values(problem=problem, fix=fix))

    def templated(self, code: DiagnosticCode, path: YamlPath, **values: str) -> Diagnostic:
        return templated_diagnostic(code, self.file, path, self.values(**values))

    def templated_at(self, code: DiagnosticCode, at: str, **values: str) -> Diagnostic:
        return templated_diagnostic(code, at, (), self.values(**values))


type ExperimentRule = Callable[[ExperimentSite], Iterator[Diagnostic]]
