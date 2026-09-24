import asyncio
from pathlib import Path

import pytest
from engine_core_harness import launched_facade

from aqven.engine.errors import EngineNotLaunched
from aqven.engine.status_probe import DbosStatusProbe


def test_dbos_probe_answers_while_the_engine_runs_and_fails_after_shutdown(tmp_path: Path) -> None:
    probe = DbosStatusProbe()

    with launched_facade(tmp_path / "state"):
        asyncio.run(probe.ping())

    with pytest.raises(EngineNotLaunched):
        asyncio.run(probe.ping())
