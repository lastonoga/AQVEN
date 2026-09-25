from collections.abc import Iterable, Iterator, Sequence
from dataclasses import dataclass, field
from typing import Final, assert_never

from aqven.check.context import CheckContext, CheckRule
from aqven.check.experiment_site import ExperimentSite
from aqven.check.factors import factor_ready
from aqven.check.local_flows import flows_view
from aqven.check.variant_origins import relocated
from aqven.diagnostics import Diagnostic
from aqven.factors import (
    AssembledVariant,
    AssemblyFailure,
    FactorChange,
    VariantSite,
    assemble_changes,
    assemble_subject,
    outside_factor,
    subject_flow,
    variant_changes,
)
from aqven.loader import LoadedExperiment, LoadedProject
from aqven.spec import FactorKind, VariantId, VariantSpec

AS_WRITTEN: Final = VariantId("as_written")
EXPERIMENT_BOUND: Final = frozenset({FactorKind.PROMPT, FactorKind.USE})

type DiagnosticKey = tuple[str, str, tuple[str | int, ...], str]
type AssemblyKey = tuple[str, str | None, tuple[FactorChange, ...]]


def check_variants(
    context: CheckContext, rules: Sequence[CheckRule], known: Iterable[Diagnostic]
) -> Iterator[Diagnostic]:
    checks = VariantChecks(context, rules, frozenset(diagnostic_key(item) for item in known))
    for experiment in context.project.experiments.values():
        yield from checks.experiment(experiment)


def diagnostic_key(item: Diagnostic) -> DiagnosticKey:
    return item.code.value, item.file, item.path, item.message


@dataclass(slots=True)
class VariantChecks:
    context: CheckContext
    rules: Sequence[CheckRule]
    seen: frozenset[DiagnosticKey]
    found: dict[AssemblyKey, tuple[Diagnostic, ...]] = field(default_factory=dict[AssemblyKey, tuple[Diagnostic, ...]])
    baselines: dict[AssemblyKey, frozenset[DiagnosticKey]] = field(
        default_factory=dict[AssemblyKey, frozenset[DiagnosticKey]]
    )

    def experiment(self, experiment: LoadedExperiment) -> Iterator[Diagnostic]:
        if not factor_ready(ExperimentSite(self.context, experiment)):
            return
        for index, variant in enumerate(experiment.source.spec.variants):
            yield from self._variant(experiment, index, variant)

    def _variant(self, experiment: LoadedExperiment, index: int, variant: VariantSpec) -> Iterator[Diagnostic]:
        spec = experiment.source.spec
        changes = variant_changes(spec, variant)
        if not changes or outside_factor(spec, variant):
            return
        site = VariantSite(experiment, variant.id, index)
        assembly = assemble_changes(self.context.project, experiment, site, changes)
        match assembly:
            case AssemblyFailure():
                yield from assembly.diagnostics
            case AssembledVariant():
                found = self._found(experiment, assembly)
                yield from (relocated(self.context.project, site, changes, item) for item in found)
            case _:
                assert_never(assembly)

    def _found(self, experiment: LoadedExperiment, assembled: AssembledVariant) -> tuple[Diagnostic, ...]:
        key = _assembly_key(self.context.project, experiment, assembled.changes)
        cached = self.found.get(key)
        if cached is not None:
            return cached
        known = self.seen | self._baseline(experiment)
        found = tuple(item for item in self._check(assembled.project) if diagnostic_key(item) not in known)
        self.found[key] = found
        return found

    def _baseline(self, experiment: LoadedExperiment) -> frozenset[DiagnosticKey]:
        key = _assembly_key(self.context.project, experiment, ())
        cached = self.baselines.get(key)
        if cached is not None:
            return cached
        assembly = assemble_subject(self.context.project, experiment, AS_WRITTEN)
        found = self._check(assembly.project) if isinstance(assembly, AssembledVariant) else ()
        baseline = frozenset(diagnostic_key(item) for item in found)
        self.baselines[key] = baseline
        return baseline

    def _check(self, project: LoadedProject) -> tuple[Diagnostic, ...]:
        view = flows_view(self.context, project)
        return tuple(item for rule in self.rules for item in rule(view))


def _assembly_key(project: LoadedProject, experiment: LoadedExperiment, changes: Sequence[FactorChange]) -> AssemblyKey:
    subject = subject_flow(project, experiment)
    bound = bool(experiment.flows) or any(change.what in EXPERIMENT_BOUND for change in changes)
    return (subject.folder if subject is not None else "", experiment.folder if bound else None, tuple(sorted(changes)))
