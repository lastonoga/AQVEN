from collections.abc import Callable
from pathlib import Path
from typing import Final

import pytest

from .transcript_parity import FIXTURES, OWNER_FIXTURE, ParityFixture, fixture_text, read_fixture

REGENERATE: Final[str] = "uv run python packages/aqven/tests/chat/transcript_parity.py"


@pytest.mark.parametrize(("path", "build"), FIXTURES, ids=[path.name for path, _ in FIXTURES])
def test_the_studio_parity_fixtures_are_what_the_projector_folds_today(
    tmp_path: Path, path: Path, build: Callable[[Path], ParityFixture]
) -> None:
    generated = fixture_text(build(tmp_path))

    assert generated == path.read_text(), REGENERATE


def test_the_owner_journal_fixture_walks_pages_for_every_cut() -> None:
    fixture = read_fixture(OWNER_FIXTURE)

    assert {journal.name for journal in fixture.journals} == {
        "owner-continuations",
        "owner-interrupted",
        "owner-queued",
    }
    assert all(cut.pages for journal in fixture.journals for cut in journal.cuts), REGENERATE
    assert any(event.turn_id is None for journal in fixture.journals for event in journal.events)
