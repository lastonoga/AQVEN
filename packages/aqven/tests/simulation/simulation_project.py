import shutil
from pathlib import Path
from typing import Final

from aqven.check import CheckReport, check_project
from aqven.codegen import generate_types
from aqven.compiler import compile_project
from aqven.ir import CompiledProject

FIXTURE: Final = Path(__file__).parent.parent / "fixtures" / "standard_shop"
ORIGINAL_PACKAGE: Final = "standard_shop"
IGNORED: Final = ("__pycache__", "*.pyc", ".aqven")
TRIM_NODE: Final = "flows/intake/nodes/review/trim.py"
REVIEW_NODE: Final = "flows/intake/nodes/review/review.node.yaml"


def simulation_project(destination: Path, package: str) -> Path:
    root = destination / package
    shutil.copytree(FIXTURE, root, ignore=shutil.ignore_patterns(*IGNORED))
    for path in (*root.rglob("*.py"), root / "aqven.yaml"):
        path.write_text(path.read_text(encoding="utf-8").replace(ORIGINAL_PACKAGE, package), encoding="utf-8")
    generate_types(root)
    return root


def project_report(root: Path) -> CheckReport:
    return check_project(root)


def project_plan(root: Path) -> CompiledProject:
    return compile_project(check_project(root))


def break_code(root: Path) -> None:
    path = root / TRIM_NODE
    body = path.read_text(encoding="utf-8")
    path.write_text(body.replace("return Note(text=squash(text))", "raise ValueError('broken node')"), "utf-8")
