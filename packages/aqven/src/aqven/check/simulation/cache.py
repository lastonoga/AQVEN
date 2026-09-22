import hashlib
from collections.abc import Sequence
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Final, Literal

from pydantic import BaseModel, ConfigDict, ValidationError

from aqven.diagnostics import Diagnostic
from aqven.engine.protocol import STATE_DIRECTORY
from aqven.ir import CompiledProject, flow_hash
from aqven.loader import file_hash, project_files
from aqven.spec import FlowId

CACHE_DIRECTORY: Final = "cache"
CACHE_FILE: Final = "simulation.json"
CACHE_VERSION: Final = "aqven/simulation-cache/v1"
CODE_SUFFIX: Final = ".py"
DISTRIBUTION: Final = "aqven"
UNKNOWN_VERSION: Final = "0"


class FlowEntry(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    key: str
    diagnostics: tuple[Diagnostic, ...] = ()


class SimulationCache(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    version: Literal["aqven/simulation-cache/v1"] = CACHE_VERSION
    flows: dict[str, FlowEntry] = {}


EMPTY_CACHE: Final = SimulationCache()


def cache_file(root: Path) -> Path:
    return root / STATE_DIRECTORY / CACHE_DIRECTORY / CACHE_FILE


def read_cache(path: Path) -> SimulationCache:
    try:
        return SimulationCache.model_validate_json(path.read_bytes())
    except OSError, ValidationError:
        return EMPTY_CACHE


def write_cache(path: Path, cache: SimulationCache) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(cache.model_dump_json(indent=2), encoding="utf-8")


def aqven_version() -> str:
    try:
        return version(DISTRIBUTION)
    except PackageNotFoundError:
        return UNKNOWN_VERSION


def code_digest(root: Path) -> str:
    digest = hashlib.sha256()
    for relative in project_files(root):
        if not relative.endswith(CODE_SUFFIX):
            continue
        digest.update(relative.encode())
        digest.update(_content_hash(root / relative).encode())
    return digest.hexdigest()


def flow_key(plan: CompiledProject, flow_id: FlowId, digest: str, release: str) -> str:
    parts: Sequence[str] = (flow_hash(plan, flow_id), digest, release)
    return hashlib.sha256("\n".join(parts).encode()).hexdigest()


def _content_hash(path: Path) -> str:
    try:
        return file_hash(path.read_bytes())
    except OSError:
        return ""
