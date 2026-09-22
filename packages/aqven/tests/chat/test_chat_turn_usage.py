from pathlib import Path
from typing import Final

from pydantic import JsonValue

from aqven.chat.normalizer import ClaudeEventNormalizer
from aqven.ports.chat import ChatEvent, ChatUsageReported

from .fixtures import counting_ids, materialize, stream

ROOT: Final[Path] = Path("/work/lumen-project")


def opened(message_id: str, input_tokens: int, cache_read: int) -> dict[str, JsonValue]:
    return {
        "type": "message_start",
        "message": {
            "id": message_id,
            "usage": {"input_tokens": input_tokens, "cache_read_input_tokens": cache_read, "output_tokens": 0},
        },
    }


def closed(input_tokens: int, output_tokens: int, cache_read: int, thinking: int = 0) -> dict[str, JsonValue]:
    return {
        "type": "message_delta",
        "delta": {"stop_reason": "end_turn"},
        "usage": {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cache_read_input_tokens": cache_read,
            "output_tokens_details": {"thinking_tokens": thinking},
        },
    }


def totals(events: list[ChatEvent]) -> list[tuple[int, int, int]]:
    return [
        (event.usage.tokens_in, event.usage.tokens_out, event.usage.cache_read_tokens)
        for event in events
        if isinstance(event, ChatUsageReported)
    ]


def normalized(*wire: dict[str, JsonValue]) -> list[ChatEvent]:
    normalizer = ClaudeEventNormalizer(ROOT, counting_ids())
    normalizer.begin_turn()
    return materialize(builder for event in wire for builder in normalizer.normalize(stream(event)))


def test_a_turn_reports_what_it_has_spent_as_soon_as_a_message_opens() -> None:
    events = normalized(opened("msg-1", 120, 900))

    assert totals(events) == [(120, 0, 900)]


def test_the_tally_grows_with_every_message_the_turn_takes() -> None:
    events = normalized(
        opened("msg-1", 120, 900),
        closed(120, 48, 900),
        opened("msg-2", 30, 1400),
        closed(30, 16, 1400),
    )

    assert totals(events) == [(120, 0, 900), (120, 48, 900), (150, 48, 2300), (150, 64, 2300)]


def test_a_message_without_a_usage_report_does_not_erase_the_tally() -> None:
    events = normalized(
        opened("msg-1", 120, 900), closed(120, 48, 900), {"type": "message_start", "message": {"id": "msg-2"}}
    )

    assert totals(events)[-1] == (120, 48, 900)


def test_the_price_of_a_turn_is_left_to_the_report_that_knows_it() -> None:
    events = normalized(opened("msg-1", 120, 900), closed(120, 48, 900))

    assert all(isinstance(event, ChatUsageReported) and event.usage.cost_usd is None for event in events)


def thinking_of(events: list[ChatEvent]) -> list[tuple[str | None, int]]:
    return [(event.message_id, event.usage.thinking_tokens) for event in events if isinstance(event, ChatUsageReported)]


def test_each_message_reports_the_thinking_it_did_under_its_own_name() -> None:
    events = normalized(
        opened("msg-1", 120, 900),
        closed(120, 480, 900, thinking=430),
        opened("msg-2", 30, 1400),
        closed(30, 90, 1400, thinking=60),
    )

    assert thinking_of(events) == [("msg-1", 0), ("msg-1", 430), ("msg-2", 0), ("msg-2", 60)]


def test_a_message_that_did_not_think_reports_no_thinking() -> None:
    events = normalized(opened("msg-1", 120, 900), closed(120, 48, 900))

    assert thinking_of(events) == [("msg-1", 0), ("msg-1", 0)]
