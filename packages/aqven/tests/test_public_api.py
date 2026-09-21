import os
import subprocess
import sys
from importlib import import_module
from pathlib import Path
from typing import Final

import pytest

import aqven

FIXTURES: Final = Path(__file__).resolve().parent / "fixtures"
SHOP: Final = FIXTURES / "standard_shop"
HEAVY_MODULES: Final = ("fastapi", "uvicorn", "dbos", "starlette")
IN_PROCESS: Final = (
    "Project",
    "FlowHandle",
    "Run",
    "RunOptions",
    "RunContext",
    "RunResult",
    "RunEvent",
    "HumanWait",
    "ResumeRequest",
    "ResumeResult",
    "CancelRequest",
    "ExecutionAddress",
    "node_address",
)
SERVER_SIDE: Final = ("create_local_app", "LocalAppOptions", "LocalTokenAccess", "AppAccess", "create_mcp_server")
CONTRACT: Final = ("create_app", "ServerOptions", "export_openapi", "openapi_text")
IMPORT_PROBE: Final = f"import sys, aqven; print(','.join(name for name in {HEAVY_MODULES!r} if name in sys.modules))"


def test_public_names_are_documented_by_all() -> None:
    assert set(aqven.__all__) == set(aqven.PUBLIC_MODULES)
    assert list(aqven.__all__) == sorted(aqven.__all__)
    assert set(IN_PROCESS) | set(SERVER_SIDE) | set(CONTRACT) <= set(aqven.__all__)


@pytest.mark.parametrize("name", sorted(aqven.PUBLIC_MODULES))
def test_every_public_name_resolves_to_its_module(name: str) -> None:
    value = getattr(aqven, name)

    assert value is getattr(import_module(aqven.PUBLIC_MODULES[name]), name)


def test_unknown_attribute_raises_attribute_error() -> None:
    with pytest.raises(AttributeError):
        _ = aqven.missing_name  # pyright: ignore[reportAttributeAccessIssue]


def test_importing_aqven_stays_light() -> None:
    environment = {key: value for key, value in os.environ.items() if key != "PYTHONPATH"}
    completed = subprocess.run(
        (sys.executable, "-c", IMPORT_PROBE),
        env=environment,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr
    assert completed.stdout.strip() == ""


def test_in_process_use_needs_only_public_names(tmp_path: Path) -> None:
    from aqven.testing import copy_project

    project = aqven.Project.load(copy_project(SHOP, tmp_path))
    flow = project.flow("intake")
    options = aqven.RunOptions(context=aqven.RunContext())

    assert flow.flow_id == "intake"
    assert flow.input_model.model_json_schema()["properties"]
    assert options.context is not None
    assert issubclass(aqven.Run, object) and callable(aqven.create_local_app)
