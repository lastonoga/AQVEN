from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

import pytest
from finding_fixtures import CASES, FindingCase, attempts_of, noninferior_case, threshold_case

from aqven.loader import read_strict_yaml
from aqven.loader.aliases import AliasScope
from aqven.runtime.address import ClientOpId
from aqven.series import SeriesId, SeriesVerdict
from aqven.series.feed import FindingNotice, ResearchNotice
from aqven.series.findings import (
    FINDINGS_FILE,
    FileFindings,
    FindingNotWritten,
    finding_hash,
    finding_op_id,
    finding_path,
    publishable_experiment,
    render_findings_md,
)
from aqven.spec import ExperimentId, FindingSpec, SeriesSplit, VerdictReason, VerdictState
from aqven.write import (
    CollectingSink,
    FilesChanged,
    MemoryIntentJournal,
    ProjectLock,
    ShadowCheckValidator,
    TreeValidator,
    Validation,
    WriteResult,
    WriteService,
    canonical_yaml,
)

PROJECT_YAML: Final = """apiVersion: "aqven/v1"
kind: "Project"
description: "Findings fixture"
package: "finding_shop"
providers:
- id: "openai"
  api_key: "ref:env/OPENAI_API_KEY"
  data_policy:
    allows_pii: true
    allows_sensitive: false
    retention: "zero"
"""
LOCK_TIMEOUT_SECONDS: Final = 0.2
HAND_EDIT: Final = "# edited by hand\n"
OTHER_LOOK: Final = SeriesId("01999f50-3333-7444-8555-966677778888")


@dataclass(frozen=True, slots=True)
class PassingValidator:
    def validate(self, root: Path, changes: Mapping[str, bytes | None]) -> Validation:
        return Validation(problems=(), blocking=(), derived={})


@dataclass(slots=True)
class ConcurrentEdit:
    root: Path
    inner: MemoryIntentJournal = field(default_factory=MemoryIntentJournal)
    edits: int = 0

    def find(self, client_op_id: ClientOpId) -> WriteResult | None:
        if self.edits == 0:
            self.edits += 1
            (self.root / FINDINGS_FILE).write_text(HAND_EDIT, encoding="utf-8")
        return self.inner.find(client_op_id)

    def record(self, client_op_id: ClientOpId, result: WriteResult) -> None:
        self.inner.record(client_op_id, result)


def write_experiment(root: Path, case: FindingCase, experiment_id: str) -> None:
    relative = f"experiments/{experiment_id}/experiment.yaml"
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    document = case.experiment.model_dump(mode="json", by_alias=True, exclude_none=True)
    target.write_bytes(canonical_yaml(relative, document, AliasScope(root.name, ())))


@pytest.fixture
def project(tmp_path: Path) -> Path:
    root = tmp_path / "finding_shop"
    root.mkdir()
    (root / "aqven.yaml").write_text(PROJECT_YAML, encoding="utf-8")
    write_experiment(root, noninferior_case(), "reply_noninferior_mistral")
    write_experiment(root, threshold_case(), "reply_overpromise_risk")
    return root


@dataclass(slots=True)
class RecordingFeed:
    notices: list[ResearchNotice] = field(default_factory=list[ResearchNotice])

    def publish(self, notice: ResearchNotice) -> None:
        self.notices.append(notice)


def writer(root: Path, sink: CollectingSink | None = None, validator: TreeValidator | None = None) -> WriteService:
    return WriteService(
        root,
        validator=validator or PassingValidator(),
        intents=MemoryIntentJournal(),
        sink=sink or CollectingSink(),
        lock=ProjectLock(root, timeout_seconds=LOCK_TIMEOUT_SECONDS),
    )


def stored(root: Path, path: str) -> FindingSpec:
    document, diagnostics = read_strict_yaml((root / path).read_text(encoding="utf-8"), path)
    assert document is not None, diagnostics
    return FindingSpec.model_validate(document.data)


@pytest.mark.asyncio
async def test_a_holdout_series_writes_its_finding_and_the_summary_in_one_transaction(project: Path) -> None:
    case = noninferior_case()
    sink = CollectingSink()

    path = await FileFindings(writer(project, sink), project).publish(case.record, case.attempts)

    assert path == finding_path(ExperimentId("reply_noninferior_mistral"), case.record.series_id)
    assert path is not None
    spec = stored(project, path)
    assert finding_hash(spec) == spec.self_sha256
    assert (project / FINDINGS_FILE).read_text(encoding="utf-8") == render_findings_md((spec,), {})
    [notice] = [notice for notice in sink.notices if isinstance(notice, FilesChanged)]
    assert {change.path for change in notice.changes} == {path, FINDINGS_FILE}
    assert notice.actor.kind == "system"


@pytest.mark.asyncio
async def test_publishing_again_is_idempotent_within_the_process_and_after_a_restart(project: Path) -> None:
    case = noninferior_case()
    sink = CollectingSink()
    findings = FileFindings(writer(project, sink), project)

    first = await findings.publish(case.record, case.attempts)
    again = await findings.publish(case.record, case.attempts)
    restarted = await FileFindings(writer(project), project).publish(case.record, case.attempts)

    assert first == again == restarted
    assert len([notice for notice in sink.notices if isinstance(notice, FilesChanged)]) == 1


@pytest.mark.asyncio
async def test_a_finding_is_written_once_and_a_different_file_in_its_place_is_an_error(project: Path) -> None:
    case = noninferior_case()
    path = await FileFindings(writer(project), project).publish(case.record, case.attempts)
    assert path is not None
    (project / path).write_text("tampered: true\n", encoding="utf-8")

    with pytest.raises(FindingNotWritten):
        await FileFindings(writer(project), project).publish(case.record, case.attempts)


@pytest.mark.asyncio
async def test_a_stale_summary_is_reread_and_regenerated(project: Path) -> None:
    case = noninferior_case()
    service = writer(project)
    journal = ConcurrentEdit(project)
    service.intents = journal

    path = await FileFindings(service, project).publish(case.record, case.attempts)

    assert path is not None
    assert journal.edits == 1
    summary = (project / FINDINGS_FILE).read_text(encoding="utf-8")
    assert summary == render_findings_md((stored(project, path),), {})


@pytest.mark.asyncio
async def test_a_second_holdout_look_on_the_same_cases_is_counted(project: Path) -> None:
    first = threshold_case()
    second = threshold_case(OTHER_LOOK, VerdictState.CONFIRMED)
    findings = FileFindings(writer(project), project)

    await findings.publish(first.record, first.attempts)
    path = await findings.publish(second.record, attempts_of(OTHER_LOOK))

    assert path is not None
    assert stored(project, path).scope.holdout_looks == 2
    assert "Confirmed in 2 of 2 holdout looks." in (project / FINDINGS_FILE).read_text(encoding="utf-8")


@pytest.mark.asyncio
async def test_dev_invalid_and_unfinished_series_write_nothing(project: Path) -> None:
    case = noninferior_case()
    invalid = SeriesVerdict(state=VerdictState.INVALID, reason=VerdictReason.INFRA_ERRORS, text="No finding.")
    records = (
        case.record.model_copy(update={"on": SeriesSplit.DEV}),
        case.record.model_copy(update={"verdict": invalid}),
        case.record.model_copy(update={"verdict": None}),
    )
    findings = FileFindings(writer(project), project)

    written = [await findings.publish(record, case.attempts) for record in records]

    assert written == [None, None, None]
    assert all(publishable_experiment(record) is None for record in records)
    assert not (project / FINDINGS_FILE).exists()


def test_the_write_id_is_a_ulid_derived_from_the_series() -> None:
    series = noninferior_case().record.series_id

    assert finding_op_id(series) == finding_op_id(series)
    assert finding_op_id(series) != finding_op_id(OTHER_LOOK)
    assert len(finding_op_id(series)) == 26
    assert len(CASES) == 12


@pytest.mark.asyncio
async def test_the_shadow_check_accepts_a_finding_file(project: Path) -> None:
    case = noninferior_case()

    path = await FileFindings(writer(project, validator=ShadowCheckValidator()), project).publish(
        case.record, case.attempts
    )

    assert path is not None
    assert (project / path).is_file()


@pytest.mark.asyncio
async def test_a_written_finding_is_announced_with_its_file_and_the_summary(project: Path) -> None:
    case = noninferior_case()
    feed = RecordingFeed()

    path = await FileFindings(writer(project), project, feed).publish(case.record, case.attempts)

    assert path is not None
    assert feed.notices == [
        FindingNotice(
            experiment_id=ExperimentId("reply_noninferior_mistral"),
            series_id=case.record.series_id,
            paths=(path, FINDINGS_FILE),
        )
    ]


@pytest.mark.asyncio
async def test_a_series_that_writes_no_finding_announces_nothing(project: Path) -> None:
    case = noninferior_case()
    feed = RecordingFeed()
    dev = case.record.model_copy(update={"on": SeriesSplit.DEV})

    written = await FileFindings(writer(project), project, feed).publish(dev, case.attempts)

    assert written is None
    assert feed.notices == []
