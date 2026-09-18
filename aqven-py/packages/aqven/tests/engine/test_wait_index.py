import asyncio
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Final

from aqven.engine.human.index import SqliteWaitIndex, WaitIndexEntry, WaitQuery, open_wait_query, run_order
from aqven.runtime.address import RunId, node_address
from aqven.runtime.human import OpenWaitFilter
from aqven.spec import TypeId

NOW: Final = datetime(2026, 9, 18, 12, 0, tzinfo=UTC)
LEAD: Final = "support_lead"
EDITOR: Final = "brand_editor"
WAITS: Final = 60
PAGE_LIMIT: Final = 5


def run_id(number: int) -> RunId:
    return RunId(f"01a0aa21-b9a7-74fb-b1f3-{number:012d}")


def entry(number: int, assignee: str, deadline: datetime, node: str = "review") -> WaitIndexEntry:
    return WaitIndexEntry(
        run_id=run_id(number),
        workflow_id=run_id(number),
        address=node_address(node),
        wait_kind="form",
        attempt=1,
        state="waiting",
        assignee=assignee,
        waiting_since=NOW,
        deadline_at=deadline,
        on_timeout="fail",
        form_type_id=TypeId("ReviewDecision"),
    )


def filled_index(path: Path) -> SqliteWaitIndex:
    index = SqliteWaitIndex.open(path / "waits.sqlite")

    async def fill() -> None:
        for number in range(WAITS):
            place = (number * 13) % WAITS
            assignee = LEAD if number % 2 == 0 else EDITOR
            await index.record(entry(number, assignee, NOW + timedelta(hours=place - WAITS // 2)))

    asyncio.run(fill())
    return index


def deadlines(entries: tuple[WaitIndexEntry, ...]) -> list[datetime]:
    return [item.deadline_at for item in entries]


def test_the_store_orders_every_open_wait_by_deadline(tmp_path: Path) -> None:
    index = filled_index(tmp_path)

    found = asyncio.run(index.search(WaitQuery()))
    limited = asyncio.run(index.search(WaitQuery(limit=PAGE_LIMIT)))

    assert len(found) == WAITS
    assert deadlines(found) == sorted(deadlines(found))
    assert deadlines(limited) == sorted(deadlines(found))[:PAGE_LIMIT]


def test_assignee_matches_exactly_and_me_is_no_longer_a_wildcard(tmp_path: Path) -> None:
    index = filled_index(tmp_path)

    lead = asyncio.run(index.search(WaitQuery(assignee=LEAD)))
    named_me = asyncio.run(index.search(WaitQuery(assignee="me")))

    assert len(lead) == WAITS // 2
    assert {item.assignee for item in lead} == {LEAD}
    assert named_me == ()


def test_overdue_and_upcoming_split_the_open_waits(tmp_path: Path) -> None:
    index = filled_index(tmp_path)

    overdue = asyncio.run(index.search(WaitQuery(overdue_at=NOW)))
    upcoming = asyncio.run(index.search(WaitQuery(upcoming_at=NOW)))
    before = asyncio.run(index.search(WaitQuery(deadline_before=NOW + timedelta(hours=1))))

    assert all(item.deadline_at < NOW for item in overdue)
    assert all(item.deadline_at >= NOW for item in upcoming)
    assert len(overdue) + len(upcoming) == WAITS
    assert len(before) == len(overdue) + 1


def test_open_wait_filter_becomes_a_waiting_query() -> None:
    query = open_wait_query(OpenWaitFilter(assignee=LEAD, overdue_at=NOW))

    assert (query.state, query.assignee, query.overdue_at, query.run_id) == ("waiting", LEAD, NOW, None)


def test_run_order_keeps_the_earliest_deadline_of_a_run_once(tmp_path: Path) -> None:
    index = SqliteWaitIndex.open(tmp_path / "waits.sqlite")

    async def fill() -> None:
        await index.record(entry(1, LEAD, NOW + timedelta(hours=3), node="late"))
        await index.record(entry(1, EDITOR, NOW + timedelta(hours=1), node="early"))
        await index.record(entry(2, LEAD, NOW + timedelta(hours=2)))

    asyncio.run(fill())
    order = run_order(asyncio.run(index.search(WaitQuery())))

    assert order == (run_id(1), run_id(2))
