from pathlib import Path
from typing import Final

import pytest

from aqven.codegen import generate_types

LUMEN: Final = Path(__file__).parents[3] / "examples" / "lumen"


@pytest.fixture(scope="session", autouse=True)
def generated_lumen_types() -> None:
    loaded = generate_types(LUMEN)
    assert loaded.project is not None, loaded.diagnostics
