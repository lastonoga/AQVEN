import posixpath
from typing import Final

from aqven.loader.layout import FINDINGS_FILE, FINDINGS_FOLDER

EXPERIMENTS_FOLDER: Final = "experiments"
FINDING_SUFFIX: Final = ".yaml"
FINDING_GLOB: Final = f"{EXPERIMENTS_FOLDER}/*/{FINDINGS_FOLDER}/*{FINDING_SUFFIX}"

__all__ = ["EXPERIMENTS_FOLDER", "FINDINGS_FILE", "FINDINGS_FOLDER", "FINDING_GLOB", "FINDING_SUFFIX", "finding_file"]


def finding_file(experiment_id: str, series_id: str) -> str:
    return posixpath.join(EXPERIMENTS_FOLDER, experiment_id, FINDINGS_FOLDER, f"{series_id}{FINDING_SUFFIX}")
