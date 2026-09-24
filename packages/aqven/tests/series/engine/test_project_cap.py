import asyncio
from decimal import Decimal
from pathlib import Path
from typing import Final

from series_fixture import write_project
from series_harness import MemorySettings, RecordingFindings, StubAnalyst
from series_prices import FIXTURE_PRICES, FixedPrices

from aqven.loader import PROJECT_FILE
from aqven.series.jobs import SeriesService
from aqven.series.model import SeriesEstimate
from aqven.series.services import build_series_services
from aqven.series.settings import RESEARCH_SCOPE, SPEND_CAP_KEY
from aqven.series.views import LaunchRequest
from aqven.server.workspace import ProjectWorkspace
from aqven.spec import ExperimentId

TINY_PROJECT_CAP: Final = "0.000001"
LOCAL_OVERRIDE: Final = "5.00"


def with_project_cap(root: Path, cap: str) -> Path:
    project = root / PROJECT_FILE
    project.write_text(f"{project.read_text(encoding='utf-8')}research:\n  spend_cap_usd: {cap}\n", encoding="utf-8")
    return root


def estimated(root: Path, settings: MemorySettings) -> SeriesEstimate:
    services = build_series_services(
        root, ProjectWorkspace(root), settings, StubAnalyst(), RecordingFindings(), FixedPrices(FIXTURE_PRICES), "test"
    )
    return asyncio.run(SeriesService(services).estimate(ExperimentId("triage_agents"), LaunchRequest()))


def test_the_series_reads_its_cap_from_aqven_yaml(tmp_path: Path) -> None:
    root = with_project_cap(write_project(tmp_path), TINY_PROJECT_CAP)

    estimate = estimated(root, MemorySettings())

    assert (estimate.project_cap_usd, estimate.project_cap_source) == (Decimal(TINY_PROJECT_CAP), "project")
    assert (estimate.cap_usd, estimate.needs_approval) == (Decimal(TINY_PROJECT_CAP), False)


def test_a_local_override_beats_aqven_yaml(tmp_path: Path) -> None:
    root = with_project_cap(write_project(tmp_path), TINY_PROJECT_CAP)
    settings = MemorySettings()
    asyncio.run(settings.set_value(RESEARCH_SCOPE, SPEND_CAP_KEY, LOCAL_OVERRIDE))

    estimate = estimated(root, settings)

    assert (estimate.project_cap_usd, estimate.project_cap_source) == (Decimal(LOCAL_OVERRIDE), "override")
    assert (estimate.cap_usd, estimate.needs_approval) == (Decimal(LOCAL_OVERRIDE), False)


def test_a_project_without_a_research_block_keeps_one_dollar(tmp_path: Path) -> None:
    estimate = estimated(write_project(tmp_path), MemorySettings())

    assert (estimate.project_cap_usd, estimate.project_cap_source) == (Decimal("1.00"), "default")
