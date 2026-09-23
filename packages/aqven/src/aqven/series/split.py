import hashlib
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Final, Protocol

from aqven.check import CheckReport
from aqven.spec import DatasetId, SeriesSplit

HOLDOUT_SHARE: Final = 0.5
SPLIT_SALT_PREFIX: Final = "aqven-split-v1:"
UNIT_BYTES: Final = 8
UNIT_ORDER: Final = "big"
UNIT_SCALE: Final = 2**64
PART_SEPARATOR: Final = b"\x00"


class SplitUnavailable(RuntimeError):
    def __init__(self) -> None:
        super().__init__("the project does not load, so its package and the case split are unknown: run aqven check")


class PackageSource(Protocol):
    async def package(self) -> str: ...


class ReportState(Protocol):
    @property
    def report(self) -> CheckReport: ...


class ReportSource(Protocol):
    async def state(self) -> ReportState: ...


def split_salt(package: str) -> str:
    return hashlib.sha256(f"{SPLIT_SALT_PREFIX}{package}".encode()).hexdigest()


def split_unit(salt: str, dataset_id: DatasetId, case_name: str) -> float:
    digest = hashlib.sha256(PART_SEPARATOR.join((salt.encode(), dataset_id.encode(), case_name.encode()))).digest()
    return int.from_bytes(digest[:UNIT_BYTES], UNIT_ORDER) / UNIT_SCALE


def split_of(salt: str, dataset_id: DatasetId, case_name: str, holdout_share: float = HOLDOUT_SHARE) -> SeriesSplit:
    if split_unit(salt, dataset_id, case_name) < holdout_share:
        return SeriesSplit.HOLDOUT
    return SeriesSplit.DEV


def splits_of(
    package: str, dataset_id: DatasetId, names: Sequence[str], holdout_share: float = HOLDOUT_SHARE
) -> dict[str, SeriesSplit]:
    salt = split_salt(package)
    return {name: split_of(salt, dataset_id, name, holdout_share) for name in names}


@dataclass(frozen=True, slots=True)
class FixedPackage:
    name: str

    async def package(self) -> str:
        return self.name


@dataclass(frozen=True, slots=True)
class WorkspacePackage:
    workspace: ReportSource

    async def package(self) -> str:
        project = (await self.workspace.state()).report.project
        if project is None:
            raise SplitUnavailable()
        return project.project.spec.package


@dataclass(frozen=True, slots=True)
class SplitAssigner:
    packages: PackageSource
    holdout_share: float = HOLDOUT_SHARE

    async def assign(self, dataset_id: DatasetId, names: Sequence[str]) -> Mapping[str, SeriesSplit]:
        return splits_of(await self.packages.package(), dataset_id, names, self.holdout_share)
