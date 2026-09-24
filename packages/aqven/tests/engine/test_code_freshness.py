import os
import sys
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Final

import pytest

from aqven.engine.loading import CodeLoader

PACKAGE: Final = "fresh_shop"
SECOND_NS: Final = 1_000_000_000


@pytest.fixture
def package(tmp_path: Path) -> Iterator[Path]:
    root = tmp_path / PACKAGE
    root.mkdir()
    (root / "__init__.py").write_text("", encoding="utf-8")
    yield root
    for name in [name for name in sys.modules if name == PACKAGE or name.startswith(f"{PACKAGE}.")]:
        del sys.modules[name]
    location = str(tmp_path.resolve())
    if location in sys.path:
        sys.path.remove(location)


def rewrite(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")
    later = time.time_ns() + SECOND_NS
    os.utime(path, ns=(later, later))


def test_a_changed_module_is_loaded_again(package: Path) -> None:
    source = package / "steps.py"
    source.write_text("def step() -> str:\n    return 'old'\n", encoding="utf-8")
    loader = CodeLoader(package)

    assert loader.function(f"{PACKAGE}.steps:step")() == "old"

    rewrite(source, "def step() -> str:\n    return 'new'\n")

    assert loader.function(f"{PACKAGE}.steps:step")() == "new"


def test_a_class_added_to_the_types_module_reaches_a_new_step(package: Path) -> None:
    types = package / "types.py"
    types.write_text("class Old:\n    pass\n", encoding="utf-8")
    first = package / "first.py"
    first.write_text(
        f"from {PACKAGE}.types import Old\n\n\ndef step() -> str:\n    return Old.__name__\n", encoding="utf-8"
    )
    loader = CodeLoader(package)
    assert loader.function(f"{PACKAGE}.first:step")() == "Old"

    rewrite(types, "class Old:\n    pass\n\n\nclass Added:\n    pass\n")
    second = package / "second.py"
    rewrite(second, f"from {PACKAGE}.types import Added\n\n\ndef step() -> str:\n    return Added.__name__\n")

    assert loader.function(f"{PACKAGE}.second:step")() == "Added"


def test_unchanged_code_keeps_the_loaded_module(package: Path) -> None:
    (package / "steps.py").write_text("def step() -> int:\n    return 1\n", encoding="utf-8")
    loader = CodeLoader(package)

    first = loader.module(f"{PACKAGE}.steps", f"{PACKAGE}.steps:step")
    again = loader.module(f"{PACKAGE}.steps", f"{PACKAGE}.steps:step")

    assert first is again
