import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from evals_harness import EVAL_SHOP
from pydantic_ai import models

from aqven.testing import copy_project

os.environ.setdefault("PYDANTIC_AI_NO_BANNER", "1")


@pytest.fixture(scope="session")
def eval_shop(tmp_path_factory: pytest.TempPathFactory) -> Path:
    return copy_project(EVAL_SHOP, tmp_path_factory.mktemp("eval_shop_root"))


@pytest.fixture(autouse=True)
def no_model_requests() -> Iterator[None]:
    with models.override_allow_model_requests(False):
        yield
