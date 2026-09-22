from pathlib import Path

import pytest
from write_helpers import STANDARD_SHOP, make_service

from aqven.testing import copy_project
from aqven.write import CollectingSink, WriteService


@pytest.fixture
def shop(tmp_path: Path) -> Path:
    return copy_project(STANDARD_SHOP, tmp_path)


@pytest.fixture
def sink() -> CollectingSink:
    return CollectingSink()


@pytest.fixture
def service(shop: Path, sink: CollectingSink) -> WriteService:
    return make_service(shop, sink)
