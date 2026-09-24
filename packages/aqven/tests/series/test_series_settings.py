from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from pydantic import JsonValue, SecretStr

from aqven.ports.settings import SettingKey, SettingScope, SettingView
from aqven.series import (
    DEFAULT_CAP,
    DEFAULT_SPEND_CAP,
    RESEARCH_SCOPE,
    SPEND_CAP_KEY,
    InvalidSpendCap,
    ProjectCap,
    project_spend_cap,
)
from aqven.spec import ResearchSettings

PROJECT_RESEARCH = ResearchSettings(spend_cap_usd=Decimal("2.50"))


@dataclass(slots=True)
class OneSetting:
    value: JsonValue = None

    async def list_settings(self, scope: SettingScope) -> tuple[SettingView, ...]:
        return ()

    async def get_setting(self, scope: SettingScope, key: SettingKey) -> SettingView | None:
        if (scope, key) != (RESEARCH_SCOPE, SPEND_CAP_KEY) or self.value is None:
            return None
        return SettingView(scope=scope, key=key, kind="value", value=self.value, updated_at=datetime.now(UTC))

    async def set_value(self, scope: SettingScope, key: SettingKey, value: JsonValue) -> SettingView:
        self.value = value
        return SettingView(scope=scope, key=key, kind="value", value=value, updated_at=datetime.now(UTC))

    async def set_secret(self, scope: SettingScope, key: SettingKey, secret: SecretStr) -> SettingView:
        raise NotImplementedError

    async def delete_setting(self, scope: SettingScope, key: SettingKey) -> bool:
        return False

    async def read_secret(self, scope: SettingScope, key: SettingKey) -> SecretStr | None:
        return None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("value", "cap"),
    [(5, Decimal(5)), (2.5, Decimal("2.5")), ("0.40", Decimal("0.40")), (0, Decimal(0))],
)
async def test_a_local_override_wins_over_the_project_file(value: JsonValue, cap: Decimal) -> None:
    assert await project_spend_cap(OneSetting(value), PROJECT_RESEARCH) == ProjectCap(usd=cap, source="override")


@pytest.mark.asyncio
async def test_the_project_file_sets_the_cap_without_an_override() -> None:
    assert await project_spend_cap(OneSetting(), PROJECT_RESEARCH) == ProjectCap(usd=Decimal("2.50"), source="project")


@pytest.mark.asyncio
async def test_the_cap_falls_back_to_one_dollar() -> None:
    assert await project_spend_cap(OneSetting(), None) == DEFAULT_CAP


@pytest.mark.asyncio
@pytest.mark.parametrize("value", [-1, "lots", True, "NaN", "Infinity", [1], {"usd": 1}])
async def test_a_broken_override_is_refused_instead_of_skipped(value: JsonValue) -> None:
    with pytest.raises(InvalidSpendCap):
        await project_spend_cap(OneSetting(value), PROJECT_RESEARCH)


def test_default_cap_is_one_dollar() -> None:
    assert ProjectCap(usd=Decimal("1.00"), source="default") == DEFAULT_CAP
    assert Decimal("1.00") == DEFAULT_SPEND_CAP
