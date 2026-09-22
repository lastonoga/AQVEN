from decimal import Decimal

from aqven.chat.turn_cost import TurnCostMeter


def test_meter_turns_cumulative_totals_into_turn_costs() -> None:
    meter = TurnCostMeter()

    costs = [meter.turn_cost(total) for total in (0.0044, 0.0101, None, 0.0, 0.0150)]

    assert costs == [Decimal("0.0044"), Decimal("0.0057"), None, Decimal(0), Decimal("0.0049")]


def test_meter_restarts_for_a_new_cli_process_and_after_a_reset_total() -> None:
    meter = TurnCostMeter()
    meter.turn_cost(0.0300)

    after_reset = meter.turn_cost(0.0010)
    meter.restart()
    after_restart = meter.turn_cost(0.0025)

    assert (after_reset, after_restart) == (Decimal("0.0010"), Decimal("0.0025"))
