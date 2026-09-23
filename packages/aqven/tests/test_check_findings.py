from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Final

import pytest
from test_check_experiments import PROJECT_FILES, TRIAGE_EXPERIMENT, write

from aqven.check import check_project
from aqven.check.findings import findings_diagnostics
from aqven.codegen import generate_types
from aqven.diagnostics import DiagnosticCode, Severity
from aqven.loader import LoadedProject, load_project
from aqven.loader.aliases import AliasScope
from aqven.series.findings import finding_hash, render_findings_md
from aqven.server.views.files import declared_kinds
from aqven.spec import (
    AgentId,
    CellVerdict,
    DatasetId,
    ExperimentId,
    FindingCell,
    FindingEstimate,
    FindingInputs,
    FindingScope,
    FindingSpec,
    FindingVariant,
    MetricDirection,
    NodeId,
    VariantId,
    VerdictState,
)
from aqven.testing import copy_project
from aqven.write import canonical_yaml

FIXTURE: Final = Path(__file__).parent / "fixtures" / "fixture_shop"
SERIES: Final = "01999f2e-4b1c-7a3d-9e21-5c7d8f0a1b2c"
OTHER_SERIES: Final = "01999f2e-4b1c-7a3d-9e21-5c7d8f0a1b2d"
FINDINGS_FOLDER: Final = "experiments/triage_agents/findings"
FINDING_FILE: Final = f"{FINDINGS_FOLDER}/{SERIES}.yaml"
DIGEST: Final = "sha256-" + "a" * 64
MOMENT: Final = datetime(2026, 9, 23, 12, 0, tzinfo=UTC)
SCOPE: Final = AliasScope("fixture_shop", ())


@dataclass(slots=True)
class ListedCodec:
    edited: frozenset[str] = frozenset()
    rendered: list[tuple[str, ...]] = field(default_factory=list[tuple[str, ...]])

    def digest(self, spec: FindingSpec) -> str:
        return "sha256-" + "b" * 64 if spec.series in self.edited else spec.self_sha256

    def render(self, findings: Sequence[FindingSpec], paths: Mapping[str, str]) -> str:
        listed = tuple(sorted(f"{finding.series} {paths[finding.series]}" for finding in findings))
        self.rendered.append(listed)
        return "".join(f"{line}\n" for line in listed)


def finding(series: str = SERIES, experiment: str = "triage_agents") -> FindingSpec:
    estimate = FindingEstimate(value=0.0, low=-0.02, high=0.03, method="paired_t", cases=2, attempts=12)
    cell = FindingCell(
        metric="category_matches",
        role="primary",
        variant=VariantId("cheap"),
        baseline=VariantId("writer"),
        direction=MetricDirection.HIGHER_IS_BETTER,
        margin=0.05,
        estimate=estimate,
        verdict=CellVerdict.PASS,
    )
    variant = FindingVariant(
        id=VariantId("cheap"),
        agents={NodeId("classify"): AgentId("cheap")},
        models=["openai:gpt-5.4-mini"],
        flow_hash="sha256-" + "1" * 64,
        metrics={"category_matches": estimate},
    )
    baseline = FindingVariant(
        id=VariantId("writer"), agents={}, models=["openai:gpt-5.4-mini"], flow_hash="sha256-" + "7" * 64, metrics={}
    )
    scope = FindingScope(
        split="holdout",
        dataset=DatasetId("triage_cases"),
        cases=2,
        repeats=3,
        attempts=12,
        infra_errors=0,
        holdout_looks=1,
        case_names_sha256="sha256-" + "2" * 64,
        started_at=MOMENT,
        finished_at=MOMENT,
        engine_version="0.0.0",
    )
    inputs = FindingInputs(
        experiment_sha256="sha256-" + "3" * 64,
        dataset_sha256="sha256-" + "4" * 64,
        cases_sha256="sha256-" + "5" * 64,
        code_sha256="sha256-" + "6" * 64,
    )
    return FindingSpec.model_validate(
        {
            "apiVersion": "aqven/v1",
            "kind": "Finding",
            "experiment": ExperimentId(experiment),
            "series": series,
            "description": "The cheap agent sorts tickets as well as the writer",
            "failure_mode": "triage",
            "question": "noninferior",
            "state": VerdictState.CONFIRMED,
            "statement": "cheap vs writer on category_matches: +0.00 (95% CI -0.02 to 0.03): not worse.",
            "cells": [cell.model_dump(mode="json", by_alias=True)],
            "variants": [
                variant.model_dump(mode="json", by_alias=True),
                baseline.model_dump(mode="json", by_alias=True),
            ],
            "scope": scope.model_dump(mode="json", by_alias=True),
            "inputs": inputs.model_dump(mode="json", by_alias=True),
            "spend_usd": str(Decimal("0.0123")),
            "self_sha256": DIGEST,
        }
    )


def put_finding(root: Path, relative: str, spec: FindingSpec) -> None:
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(canonical_yaml(relative, spec.model_dump(mode="json", by_alias=True), SCOPE))


def loaded(root: Path) -> LoadedProject:
    result = load_project(root)
    assert result.project is not None, result.diagnostics
    return result.project


@pytest.fixture
def lab(tmp_path: Path) -> Path:
    root = copy_project(FIXTURE, tmp_path)
    for relative, text in PROJECT_FILES.items():
        write(root, relative, text)
    generate_types(root)
    return root


def test_the_loader_attaches_a_finding_to_its_experiment_by_series(lab: Path) -> None:
    put_finding(lab, FINDING_FILE, finding())

    result = load_project(lab)

    assert result.diagnostics == ()
    assert result.project is not None
    experiment = result.project.experiments[ExperimentId("triage_agents")]
    assert list(experiment.findings) == [SERIES]
    assert experiment.findings[SERIES].path == FINDING_FILE
    assert declared_kinds(result.project)[FINDING_FILE] == "Finding"


def test_a_finding_outside_the_findings_of_an_experiment_is_an_orphan(lab: Path) -> None:
    stray = f"notes/{SERIES}.yaml"
    put_finding(lab, stray, finding())

    result = load_project(lab)

    assert [(item.code, item.file) for item in result.diagnostics] == [(DiagnosticCode.E_ORPHAN_FILE, stray)]


def test_an_intact_finding_with_a_current_findings_file_is_clean(lab: Path) -> None:
    put_finding(lab, FINDING_FILE, finding())
    codec = ListedCodec()
    write(lab, "FINDINGS.md", f"{SERIES} {FINDING_FILE}\n")

    assert findings_diagnostics(loaded(lab), codec) == ()
    assert codec.rendered == [(f"{SERIES} {FINDING_FILE}",)]


@pytest.mark.parametrize(
    ("relative", "spec", "edited", "path", "problem"),
    [
        (
            f"{FINDINGS_FOLDER}/{OTHER_SERIES}.yaml",
            finding(),
            frozenset[str](),
            ("series",),
            f"the file is named {OTHER_SERIES}, but it holds series {SERIES}",
        ),
        (
            FINDING_FILE,
            finding(experiment="judge_check"),
            frozenset[str](),
            ("experiment",),
            "it names experiment judge_check, but lies in the findings of experiment triage_agents",
        ),
        (
            FINDING_FILE,
            finding(),
            frozenset({SERIES}),
            ("self_sha256",),
            f"self_sha256 is {DIGEST}, but the body hashes to sha256-{'b' * 64}: the file was edited",
        ),
    ],
    ids=["stem", "experiment", "body"],
)
def test_a_tampered_finding_is_an_error_and_leaves_the_findings_file(
    lab: Path, relative: str, spec: FindingSpec, edited: frozenset[str], path: tuple[str, ...], problem: str
) -> None:
    put_finding(lab, relative, spec)
    codec = ListedCodec(edited=edited)

    tampered, *rest = findings_diagnostics(loaded(lab), codec)

    assert (tampered.code, tampered.severity, tampered.file, tampered.path) == (
        DiagnosticCode.E_FINDING_TAMPERED,
        Severity.ERROR,
        relative,
        path,
    )
    assert tampered.message == f"finding {Path(relative).name} of experiment triage_agents: {problem}"
    assert codec.rendered == [()]
    assert rest == []


def test_a_missing_findings_file_is_stale(lab: Path) -> None:
    put_finding(lab, FINDING_FILE, finding())

    (stale,) = findings_diagnostics(loaded(lab), ListedCodec())

    assert (stale.code, stale.severity, stale.file) == (
        DiagnosticCode.W_FINDINGS_STALE,
        Severity.WARNING,
        "FINDINGS.md",
    )
    assert stale.message == "FINDINGS.md does not match the finding files: FINDINGS.md is missing"


def test_an_edited_findings_file_is_stale(lab: Path) -> None:
    put_finding(lab, FINDING_FILE, finding())
    write(lab, "FINDINGS.md", f"{SERIES} {FINDING_FILE}\nno risk at all\n")

    (stale,) = findings_diagnostics(loaded(lab), ListedCodec())

    assert stale.code is DiagnosticCode.W_FINDINGS_STALE
    assert stale.message.endswith("FINDINGS.md differs from the text generated from the finding files")


def test_a_project_without_findings_leaves_its_findings_file_alone(lab: Path) -> None:
    write(lab, "FINDINGS.md", "# Notes written by hand\n")
    codec = ListedCodec()

    assert findings_diagnostics(loaded(lab), codec) == ()
    assert codec.rendered == []


def test_aqven_check_recomputes_the_hash_and_the_findings_file_of_the_series(lab: Path) -> None:
    draft = finding()
    spec = draft.model_copy(update={"self_sha256": finding_hash(draft)})
    put_finding(lab, FINDING_FILE, spec)
    write(lab, "FINDINGS.md", render_findings_md((spec,), {SERIES: FINDING_FILE}))

    clean = check_project(lab)
    edited = spec.model_copy(update={"statement": "cheap is better than the writer in every way."})
    put_finding(lab, FINDING_FILE, edited)
    tampered = check_project(lab)

    assert clean.diagnostics == ()
    assert {(item.code, item.path) for item in tampered.diagnostics} == {
        (DiagnosticCode.E_FINDING_TAMPERED, ("self_sha256",)),
        (DiagnosticCode.W_FINDINGS_STALE, ()),
    }
    (error,) = tampered.errors
    assert error.line is not None


def test_the_experiment_stays_valid_next_to_its_findings(lab: Path) -> None:
    draft = finding()
    put_finding(lab, FINDING_FILE, draft.model_copy(update={"self_sha256": finding_hash(draft)}))

    report = check_project(lab)

    assert TRIAGE_EXPERIMENT not in {item.file for item in report.diagnostics}
    assert [item.code for item in report.diagnostics] == [DiagnosticCode.W_FINDINGS_STALE]
