from pathlib import Path

from risk_warnings import diagnostics
from series_fixture import write_project

from aqven.check import check_project

CODE = "W_DATASET_INPUT_REUSED"


def test_known_series_fixture_duplicates_warn_without_failing_or_variant_duplication(tmp_path: Path) -> None:
    root = write_project(tmp_path)

    first = check_project(root)
    second = check_project(root)
    found = diagnostics(first, CODE)

    assert first.ok
    assert first.diagnostics == second.diagnostics
    assert any("triage_cases/always_1" in item.message and "triage_cases/always_3" in item.message for item in found)
    assert any("triage_cases/plain_2" in item.message and "triage_cases/plain_1" in item.message for item in found)
    assert len({(item.file, item.path, item.message) for item in found}) == len(found)
