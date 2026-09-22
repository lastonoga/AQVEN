import asyncio
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Final

import pytest
from pydantic import JsonValue, SecretStr

from aqven.app.workers import MAX_PARALLEL_KEY, MAX_PARALLEL_SCOPE, InvalidWorkerCount, configured_workers
from aqven.ports.settings import SettingKey, SettingScope, SettingView

MOMENT: Final = datetime(2026, 9, 21, 12, 0, tzinfo=UTC)


@dataclass(slots=True)
class OneSetting:
    stored: dict[tuple[SettingScope, SettingKey], JsonValue] = field(
        default_factory=dict[tuple[SettingScope, SettingKey], JsonValue]
    )

    async def list_settings(self, scope: SettingScope) -> tuple[SettingView, ...]:
        return ()

    async def get_setting(self, scope: SettingScope, key: SettingKey) -> SettingView | None:
        if (scope, key) not in self.stored:
            return None
        return SettingView(scope=scope, key=key, kind="value", value=self.stored[(scope, key)], updated_at=MOMENT)

    async def set_value(self, scope: SettingScope, key: SettingKey, value: JsonValue) -> SettingView:
        self.stored[(scope, key)] = value
        return SettingView(scope=scope, key=key, kind="value", value=value, updated_at=MOMENT)

    async def set_secret(self, scope: SettingScope, key: SettingKey, secret: SecretStr) -> SettingView:
        raise AssertionError("no secret is written")

    async def delete_setting(self, scope: SettingScope, key: SettingKey) -> bool:
        return self.stored.pop((scope, key), None) is not None

    async def read_secret(self, scope: SettingScope, key: SettingKey) -> SecretStr | None:
        return None


def settings_with(value: JsonValue | None) -> OneSetting:
    store = OneSetting()
    if value is not None:
        store.stored[(MAX_PARALLEL_SCOPE, MAX_PARALLEL_KEY)] = value
    return store


def test_an_unset_worker_count_means_no_pool() -> None:
    assert asyncio.run(configured_workers(settings_with(None))) is None


def test_a_configured_worker_count_is_read_from_the_project_scope() -> None:
    assert asyncio.run(configured_workers(settings_with(8))) == 8


def test_a_worker_count_written_as_null_means_no_pool() -> None:
    store = OneSetting()
    store.stored[(MAX_PARALLEL_SCOPE, MAX_PARALLEL_KEY)] = None

    assert asyncio.run(configured_workers(store)) is None


@pytest.mark.parametrize("stored", ["8", 0, -1, 2.5, True])
def test_a_worker_count_that_is_not_a_whole_positive_number_is_refused(stored: JsonValue) -> None:
    store = OneSetting()
    store.stored[(MAX_PARALLEL_SCOPE, MAX_PARALLEL_KEY)] = stored

    with pytest.raises(InvalidWorkerCount):
        asyncio.run(configured_workers(store))
