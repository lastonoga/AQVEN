from dataclasses import dataclass
from pathlib import Path
from typing import Final

import pytest

from aqven.check import CheckReport
from aqven.series import (
    HOLDOUT_SHARE,
    FixedPackage,
    SplitAssigner,
    SplitUnavailable,
    WorkspacePackage,
    split_of,
    split_salt,
    splits_of,
)
from aqven.server.workspace import ProjectWorkspace
from aqven.spec import DatasetId, SeriesSplit

LUMEN: Final = Path(__file__).parents[4] / "examples" / "lumen"
DATASET: Final = DatasetId("support_case_cases")
ZERO_SALT: Final = "0" * 32
DEV: Final = SeriesSplit.DEV
HOLDOUT: Final = SeriesSplit.HOLDOUT
LUMEN_SPLIT: Final = {
    "strip_flicker_credit": DEV,
    "bulb_app_offline_advice": DEV,
    "lamp_crushed_box_reship": DEV,
    "nova_runtime_advice": DEV,
    "nova_no_charge_replacement": HOLDOUT,
    "zigbee_pairing_advice": DEV,
    "strip_dead_segment_replacement": HOLDOUT,
    "dimmer_buzz_advice": DEV,
    "hub_missing_mount_reship": HOLDOUT,
    "candle_flicker_credit": HOLDOUT,
    "arc_floor_burning_smell_replacement": HOLDOUT,
    "nova_gift_warranty_question": HOLDOUT,
}


@dataclass(frozen=True, slots=True)
class BrokenState:
    report: CheckReport


@dataclass(frozen=True, slots=True)
class BrokenWorkspace:
    async def state(self) -> BrokenState:
        return BrokenState(CheckReport(diagnostics=(), project=None))


@pytest.mark.parametrize(
    ("name", "split"),
    [
        ("strip_flicker_credit", DEV),
        ("bulb_app_offline_advice", DEV),
        ("lamp_crushed_box_reship", HOLDOUT),
        ("nova_runtime_advice", DEV),
        ("nova_no_charge_replacement", HOLDOUT),
        ("zigbee_pairing_advice", DEV),
    ],
)
def test_split_of_matches_the_reference_salt(name: str, split: SeriesSplit) -> None:
    assert split_of(ZERO_SALT, DATASET, name) is split


def test_split_salt_is_derived_from_the_package() -> None:
    assert split_salt("lumen") == "430fad274b257e045eb12ab2e921fd735ca30727dc2188b8740474e18c69da9f"
    assert split_salt("lumen") != split_salt("shop")


def test_lumen_cases_split_evenly_on_the_package_salt() -> None:
    assert splits_of("lumen", DATASET, tuple(LUMEN_SPLIT)) == LUMEN_SPLIT


def test_holdout_share_moves_the_cut() -> None:
    names = tuple(LUMEN_SPLIT)

    assert set(splits_of("lumen", DATASET, names, 0.0).values()) == {DEV}
    assert set(splits_of("lumen", DATASET, names, 1.0).values()) == {HOLDOUT}
    assert HOLDOUT_SHARE == 0.5


@pytest.mark.asyncio
async def test_assigner_reads_the_package_of_the_workspace() -> None:
    fixed = await SplitAssigner(FixedPackage("lumen")).assign(DATASET, tuple(LUMEN_SPLIT))
    live = await SplitAssigner(WorkspacePackage(ProjectWorkspace(LUMEN))).assign(DATASET, ("hub_missing_mount_reship",))

    assert dict(fixed) == LUMEN_SPLIT
    assert dict(live) == {"hub_missing_mount_reship": HOLDOUT}


@pytest.mark.asyncio
async def test_assigner_refuses_a_project_that_does_not_load() -> None:
    with pytest.raises(SplitUnavailable):
        await SplitAssigner(WorkspacePackage(BrokenWorkspace())).assign(DATASET, ("any",))
