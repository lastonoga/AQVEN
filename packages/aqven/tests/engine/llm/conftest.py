import os
from collections.abc import Iterator

import pytest
from pydantic_ai import models

os.environ.setdefault("PYDANTIC_AI_NO_BANNER", "1")


@pytest.fixture(autouse=True)
def no_model_requests() -> Iterator[None]:
    with models.override_allow_model_requests(False):
        yield
