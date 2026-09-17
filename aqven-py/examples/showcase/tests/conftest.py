import pytest

from app.embedded import read_request
from app.settings import SAMPLES_DIR
from lumen.types import CaseRequest


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
def case_request() -> CaseRequest:
    return read_request(SAMPLES_DIR / "case_request.json")
