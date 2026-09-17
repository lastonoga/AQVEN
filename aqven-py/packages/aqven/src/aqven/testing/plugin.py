from pathlib import Path
from typing import Final

import pytest

from aqven.check import CheckReport, check_project
from aqven.codegen import generate_types
from aqven.runtime import CassetteConfig, Project
from aqven.testing.human import ScriptedHuman
from aqven.testing.offline import replay_cassettes

AQVEN_PROJECT_INI: Final[str] = "aqven_project"
ENGINE_MARKER: Final[str] = "aqven_engine"


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addini(AQVEN_PROJECT_INI, help="aqven project root path relative to rootdir", type="string", default="")


@pytest.hookimpl(tryfirst=True)
def pytest_load_initial_conftests(early_config: pytest.Config) -> None:
    configured = str(early_config.getini(AQVEN_PROJECT_INI))
    if configured:
        generate_types(early_config.rootpath / configured)


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", f"{ENGINE_MARKER}: scenario that runs a flow on the aqven engine")


@pytest.fixture(scope="session")
def aqven_project_root(pytestconfig: pytest.Config) -> Path:
    configured = str(pytestconfig.getini(AQVEN_PROJECT_INI))
    if not configured:
        raise pytest.UsageError(f"ini option {AQVEN_PROJECT_INI} is not set")
    return (pytestconfig.rootpath / configured).resolve()


@pytest.fixture(scope="session")
def aqven_check_report(aqven_project_root: Path) -> CheckReport:
    return check_project(aqven_project_root)


@pytest.fixture(scope="session")
def aqven_project(aqven_check_report: CheckReport) -> Project:
    return Project.from_report(aqven_check_report)


@pytest.fixture
def scripted_human() -> ScriptedHuman:
    return ScriptedHuman()


@pytest.fixture
def cassette_config(request: pytest.FixtureRequest) -> CassetteConfig:
    return replay_cassettes(request.path)
