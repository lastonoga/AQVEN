import posixpath
from collections.abc import Callable, Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Final, Protocol

from aqven.check.context import CheckContext
from aqven.diagnostics import Diagnostic, DiagnosticCode, templated_diagnostic
from aqven.loader import LoadedExperiment, LoadedProject, SourceSpec, YamlPath
from aqven.loader.layout import FINDINGS_FILE
from aqven.spec import FindingSpec

SELF_HASH_PATH: Final[YamlPath] = ("self_sha256",)
EXPERIMENT_PATH: Final[YamlPath] = ("experiment",)
SERIES_PATH: Final[YamlPath] = ("series",)
MISSING_FINDINGS: Final = f"{FINDINGS_FILE} is missing"
EDITED_FINDINGS: Final = f"{FINDINGS_FILE} differs from the text generated from the finding files"


class FindingsCodec(Protocol):
    def digest(self, spec: FindingSpec) -> str: ...

    def render(self, findings: Sequence[FindingSpec], paths: Mapping[str, str]) -> str: ...


class SeriesFindingsCodec:
    def digest(self, spec: FindingSpec) -> str:
        from aqven.series.findings.summary import finding_hash

        return finding_hash(spec)

    def render(self, findings: Sequence[FindingSpec], paths: Mapping[str, str]) -> str:
        from aqven.series.findings.render import render_findings_md

        return render_findings_md(findings, paths)


SERIES_FINDINGS: Final[FindingsCodec] = SeriesFindingsCodec()


@dataclass(frozen=True, slots=True)
class FindingSite:
    experiment: LoadedExperiment
    source: SourceSpec[FindingSpec]

    @property
    def spec(self) -> FindingSpec:
        return self.source.spec

    @property
    def stem(self) -> str:
        return PurePosixPath(self.source.path).stem


@dataclass(frozen=True, slots=True)
class Tampering:
    path: YamlPath
    problem: str


type TamperRule = Callable[[FindingSite, FindingsCodec], Tampering | None]


def _stem(site: FindingSite, codec: FindingsCodec) -> Tampering | None:
    if site.stem == site.spec.series:
        return None
    return Tampering(SERIES_PATH, f"the file is named {site.stem}, but it holds series {site.spec.series}")


def _experiment(site: FindingSite, codec: FindingsCodec) -> Tampering | None:
    owner = site.experiment.experiment_id
    if site.spec.experiment == owner:
        return None
    problem = f"it names experiment {site.spec.experiment}, but lies in the findings of experiment {owner}"
    return Tampering(EXPERIMENT_PATH, problem)


def _body(site: FindingSite, codec: FindingsCodec) -> Tampering | None:
    digest = codec.digest(site.spec)
    if digest == site.spec.self_sha256:
        return None
    problem = f"self_sha256 is {site.spec.self_sha256}, but the body hashes to {digest}: the file was edited"
    return Tampering(SELF_HASH_PATH, problem)


TAMPER_RULES: Final[tuple[TamperRule, ...]] = (_stem, _experiment, _body)


def check_findings(context: CheckContext) -> Iterable[Diagnostic]:
    return findings_diagnostics(context.project, SERIES_FINDINGS)


def findings_diagnostics(project: LoadedProject, codec: FindingsCodec) -> tuple[Diagnostic, ...]:
    sites = finding_sites(project)
    tampered = {site.source.path: tuple(_tampering(site, codec)) for site in sites}
    intact = tuple(site for site in sites if not tampered[site.source.path])
    diagnostics = (_tampered(site, item) for site in sites for item in tampered[site.source.path])
    return (*diagnostics, *_stale(project, sites, intact, codec))


def finding_sites(project: LoadedProject) -> tuple[FindingSite, ...]:
    return tuple(
        FindingSite(experiment, source)
        for experiment in project.experiments.values()
        for source in experiment.findings.values()
    )


def _tampering(site: FindingSite, codec: FindingsCodec) -> Iterator[Tampering]:
    found = (rule(site, codec) for rule in TAMPER_RULES)
    return (item for item in found if item is not None)


def _tampered(site: FindingSite, tampering: Tampering) -> Diagnostic:
    values = {
        "finding": posixpath.basename(site.source.path),
        "experiment": site.experiment.experiment_id,
        "problem": tampering.problem,
    }
    return templated_diagnostic(DiagnosticCode.E_FINDING_TAMPERED, site.source.path, tampering.path, values)


def _stale(
    project: LoadedProject, sites: Sequence[FindingSite], intact: Sequence[FindingSite], codec: FindingsCodec
) -> Iterator[Diagnostic]:
    if not sites:
        return
    expected = codec.render(
        tuple(site.spec for site in intact), {site.spec.series: site.source.path for site in intact}
    )
    written = project.texts.get(FINDINGS_FILE)
    if written == expected or (written is None and not expected):
        return
    problem = MISSING_FINDINGS if written is None else EDITED_FINDINGS
    yield templated_diagnostic(DiagnosticCode.W_FINDINGS_STALE, FINDINGS_FILE, (), {"problem": problem})
