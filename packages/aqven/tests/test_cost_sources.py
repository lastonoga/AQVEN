from decimal import Decimal
from typing import Final

import pytest
from pydantic import JsonValue

from aqven.engine.request import RunUsageTotals
from aqven.ports.execution import NodeUsage, combined_usage
from aqven.runtime import RUN_EVENT_ADAPTER, NodeFinished
from aqven.runtime.costs import weakest_cost_source
from aqven.runtime.vocabulary import CostSource

OLD_NODE_FINISHED: Final[dict[str, JsonValue]] = {
    "seq": 5,
    "at": "2026-09-21T19:58:19.343777Z",
    "run_id": "01a0c58c-4491-709c-be6d-395c955d6318",
    "type": "node_finished",
    "address": {"node_id": "triage", "branch_key": None, "iteration": None, "item_index": None},
    "status": "ok",
    "attempt": 1,
    "output_ref": None,
    "cost_usd": "0.0021",
    "tokens_in": 120,
    "tokens_out": 30,
    "latency_ms": 900,
    "model": "openrouter:google/gemini-2.5-flash-lite",
    "cache_hit": False,
    "degraded": False,
    "checks_failed": 0,
}


def test_an_event_written_before_cost_sources_reads_as_provider_priced() -> None:
    event = RUN_EVENT_ADAPTER.validate_python(OLD_NODE_FINISHED)

    assert isinstance(event, NodeFinished)
    assert (event.cost_source, event.unpriced_calls) == ("provider", 0)


def test_a_node_finished_event_keeps_its_cost_source_through_json() -> None:
    event = RUN_EVENT_ADAPTER.validate_python({**OLD_NODE_FINISHED, "cost_source": "unknown", "unpriced_calls": 2})

    dumped = RUN_EVENT_ADAPTER.dump_python(event, mode="json")

    assert (dumped["cost_source"], dumped["unpriced_calls"]) == ("unknown", 2)


@pytest.mark.parametrize(
    ("sources", "weakest"),
    [
        ((), "provider"),
        (("provider", "prices"), "prices"),
        (("genai", "prices", "provider"), "genai"),
        (("prices", "unknown", "genai"), "unknown"),
    ],
)
def test_the_weakest_cost_source_wins(sources: tuple[CostSource, ...], weakest: CostSource) -> None:
    assert weakest_cost_source(sources) == weakest


def test_combined_usage_sums_counts_and_keeps_the_weakest_source() -> None:
    priced = NodeUsage(cost_usd=Decimal("0.01"), tokens_in=10, tokens_out=5, requests=1, cost_source="prices")
    unknown = NodeUsage(tokens_in=3, tokens_out=2, requests=2, tool_calls=1, cost_source="unknown", unpriced_calls=2)

    total = combined_usage((priced, unknown))

    assert total == NodeUsage(
        cost_usd=Decimal("0.01"),
        tokens_in=13,
        tokens_out=7,
        requests=3,
        tool_calls=1,
        cost_source="unknown",
        unpriced_calls=2,
    )
    assert combined_usage(()) == NodeUsage()


def test_run_usage_totals_carry_unpriced_calls() -> None:
    node = NodeUsage(cost_usd=Decimal("0.02"), tokens_in=4, tokens_out=1, cost_source="unknown", unpriced_calls=1)

    total = RunUsageTotals().plus_node(node).plus(RunUsageTotals(unpriced_calls=2))

    assert total == RunUsageTotals(cost_usd=Decimal("0.02"), tokens_in=4, tokens_out=1, unpriced_calls=3)
