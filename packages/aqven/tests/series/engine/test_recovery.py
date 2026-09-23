import json
import os
import subprocess
import sys
from collections import Counter
from decimal import Decimal
from pathlib import Path
from typing import Final

from series_fixture import write_project

WORKER: Final = Path(__file__).parent / "series_recovery_worker.py"
RESULT_PREFIX: Final = "RESULT "
CRASH_CODE: Final = 1
PHASE_SECONDS: Final = 240
MAX_CALLS_PER_ATTEMPT: Final = 2
REPEATS: Final = 3


def worker(mode: str, root: Path, series_file: Path, log: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(WORKER), mode, str(root), str(series_file), str(log)],
        env=dict(os.environ),
        capture_output=True,
        text=True,
        timeout=PHASE_SECONDS,
        check=False,
    )


def test_a_killed_server_recovers_the_series_without_rerunning_finished_attempts(tmp_path: Path) -> None:
    root = write_project(tmp_path)
    series_file = tmp_path / "series_id"
    log = tmp_path / "model_calls.txt"

    crashed = worker("start", root, series_file, log)
    calls_before = len(log.read_text(encoding="utf-8").splitlines())
    recovered = worker("recover", root, series_file, log)

    assert crashed.returncode == CRASH_CODE, crashed.stderr[-4000:]
    assert recovered.returncode == 0, recovered.stderr[-4000:]
    line = next(line for line in recovered.stdout.splitlines() if line.startswith(RESULT_PREFIX))
    report = json.loads(line.removeprefix(RESULT_PREFIX))
    calls = Counter(log.read_text(encoding="utf-8").splitlines())
    assert report["status"] == "done"
    assert len(report["attempts"]) == report["planned"] == 24
    assert len(set(report["attempts"])) == len(report["attempts"])
    assert set(report["states"]) == {"finished"}
    assert set(report["outcomes"]) == {"ok"}
    assert Decimal(report["spend"]) == Decimal(report["rows_spend"])
    assert calls_before < sum(calls.values())
    assert sum(calls.values()) <= MAX_CALLS_PER_ATTEMPT * 24
    assert max(calls.values()) <= MAX_CALLS_PER_ATTEMPT * REPEATS
