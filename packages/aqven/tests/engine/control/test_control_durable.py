import json
import subprocess
import sys
from pathlib import Path

import pytest
from pydantic import JsonValue

SCENARIO = Path(__file__).with_name("control_dbos_scenario.py")


@pytest.fixture(scope="module")
def scenario(tmp_path_factory: pytest.TempPathFactory) -> dict[str, JsonValue]:
    database = tmp_path_factory.mktemp("dbos") / "dbos.sqlite"
    completed = subprocess.run(
        [sys.executable, str(SCENARIO), str(database)],
        cwd=SCENARIO.parent,
        capture_output=True,
        text=True,
        timeout=180,
        check=False,
    )
    assert completed.returncode == 0, completed.stderr
    loaded: JsonValue = json.loads(completed.stdout.strip().splitlines()[-1])
    assert isinstance(loaded, dict)
    return loaded


def _numbered(names: list[str]) -> list[JsonValue]:
    return [f"{position}:{name}" for position, name in enumerate(names, start=1)]


def _usage_whether_or_not_the_zero_cost_refusal_was_checkpointed_before_quorum() -> tuple[JsonValue, JsonValue]:
    checkpointed_before_quorum: dict[str, JsonValue] = {
        "cost_usd": "0.002",
        "tokens_in": 2,
        "tokens_out": 2,
        "requests": 3,
        "tool_calls": 0,
        "cost_source": "provider",
        "unpriced_calls": 0,
    }
    checkpointed_after_quorum_cancelled_it: dict[str, JsonValue] = {**checkpointed_before_quorum, "requests": 2}
    return checkpointed_before_quorum, checkpointed_after_quorum_cancelled_it


def test_parallel_children_are_workflows_joined_in_checkpointed_order(scenario: dict[str, JsonValue]) -> None:
    parallel = scenario["parallel"]
    assert isinstance(parallel, dict)
    usage = parallel["usage"]
    assert {key: value for key, value in parallel.items() if key != "usage"} == {
        "status": "ok",
        "output": {"candidates": ["b", "c"]},
        "attempt": 1,
        "model": None,
        "cache_hit": False,
        "degraded": False,
        "checks_failed": 0,
    }
    assert usage in _usage_whether_or_not_the_zero_cost_refusal_was_checkpointed_before_quorum()
    assert scenario["parallel_steps"] == _numbered(
        [*["branch_workflow"] * 4, *["DBOS.waitFirst", "DBOS.getResult"] * 3, "DBOS.cancelWorkflow"]
    )
    assert scenario["slow_status"] == "CANCELLED"


def test_map_children_use_a_sliding_window_of_child_workflows(scenario: dict[str, JsonValue]) -> None:
    mapped = scenario["map"]
    assert isinstance(mapped, dict)
    assert mapped["output"] == {
        "ballots": [{"item": "p0"}, {"item": "p1"}, {"item": "p2"}, {"item": "p4"}],
        "errors": [3],
    }
    assert scenario["map_steps"] == _numbered(
        [
            "item_workflow",
            "item_workflow",
            *["DBOS.waitFirst", "DBOS.getResult", "item_workflow"] * 3,
            *["DBOS.waitFirst", "DBOS.getResult"] * 2,
        ]
    )
    assert scenario["map_peak"] == 2


def test_fork_inside_the_join_section_replays_to_the_same_output(scenario: dict[str, JsonValue]) -> None:
    assert scenario["map_fork"] == scenario["map"]
    assert scenario["parallel_fork"] == scenario["parallel"]
