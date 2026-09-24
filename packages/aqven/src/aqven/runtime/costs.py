from collections.abc import Iterable, Mapping
from typing import Final

from aqven.runtime.vocabulary import CostSource

EXACT_COST: Final[CostSource] = "provider"
UNKNOWN_COST_SOURCE: Final[CostSource] = "unknown"
COST_SOURCE_RANK: Final[Mapping[CostSource, int]] = {"provider": 0, "prices": 1, "genai": 2, "unknown": 3}


def cost_source_rank(source: CostSource) -> int:
    return COST_SOURCE_RANK[source]


def weakest_cost_source(sources: Iterable[CostSource]) -> CostSource:
    ranked: list[CostSource] = [EXACT_COST, *sources]
    return max(ranked, key=cost_source_rank)
