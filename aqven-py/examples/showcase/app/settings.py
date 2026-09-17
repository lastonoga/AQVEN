from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from aqven.client import DEFAULT_BASE_URL

BASE_URL_VARIABLE: Final = "LUMEN_AQVEN_URL"
PROJECT_PACKAGE_VARIABLE: Final = "LUMEN_AQVEN_PACKAGE"
DEFAULT_PROJECT_PACKAGE: Final = "lumen"
SAMPLES_DIR: Final = Path(__file__).parent / "samples"


@dataclass(frozen=True, slots=True)
class HostSettings:
    base_url: str
    project_package: str


def load_settings(environ: Mapping[str, str]) -> HostSettings:
    return HostSettings(
        base_url=environ.get(BASE_URL_VARIABLE, DEFAULT_BASE_URL),
        project_package=environ.get(PROJECT_PACKAGE_VARIABLE, DEFAULT_PROJECT_PACKAGE),
    )
