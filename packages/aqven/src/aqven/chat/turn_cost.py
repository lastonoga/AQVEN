from dataclasses import dataclass, field
from decimal import Decimal
from typing import Final

ZERO_COST: Final = Decimal(0)


@dataclass(slots=True)
class TurnCostMeter:
    reported: Decimal = field(default=ZERO_COST)

    def restart(self) -> None:
        self.reported = ZERO_COST

    def turn_cost(self, cumulative_usd: float | None) -> Decimal | None:
        if cumulative_usd is None:
            return None
        cumulative = Decimal(str(cumulative_usd))
        if cumulative == ZERO_COST:
            return ZERO_COST
        baseline = self.reported if cumulative >= self.reported else ZERO_COST
        self.reported = cumulative
        return cumulative - baseline
