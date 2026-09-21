import re
from collections.abc import Iterator
from pathlib import Path
from typing import Final

import pytest

PACKAGES: Final = Path(__file__).resolve().parents[2]
SOURCE_ROOTS: Final = (PACKAGES / "aqven" / "src", PACKAGES / "aqven-llm" / "src")
CYRILLIC: Final = re.compile(r"[\u0400-\u04ff]")


def cyrillic_lines(root: Path) -> Iterator[str]:
    for path in sorted(root.rglob("*.py")):
        lines = path.read_text(encoding="utf-8").splitlines()
        for number, line in enumerate(lines, start=1):
            if CYRILLIC.search(line):
                yield f"{path.relative_to(PACKAGES)}:{number}: {line.strip()}"


@pytest.mark.parametrize("root", SOURCE_ROOTS, ids=[root.parent.name for root in SOURCE_ROOTS])
def test_package_sources_are_english_only(root: Path) -> None:
    assert root.is_dir()
    found = list(cyrillic_lines(root))
    assert found == [], f"{len(found)} source lines contain Cyrillic:\n" + "\n".join(found)
