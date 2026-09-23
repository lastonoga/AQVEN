from decimal import Decimal, InvalidOperation
from typing import Final

from pydantic import JsonValue

from aqven.ports.settings import SettingKey, SettingScope, SettingsStore, setting_key

SPEND_CAP_KEY: Final[SettingKey] = setting_key("research.spend_cap_usd")
RESEARCH_SCOPE: Final[SettingScope] = "project"
DEFAULT_SPEND_CAP: Final = Decimal("1.00")


class InvalidSpendCap(ValueError):
    def __init__(self, value: object) -> None:
        super().__init__(
            f"project setting {SPEND_CAP_KEY} must be a decimal number of dollars of at least 0, got {value!r}"
        )
        self.value = value


def decimal_of(value: JsonValue) -> Decimal | None:
    if isinstance(value, bool) or not isinstance(value, int | float | str):
        return None
    try:
        return Decimal(str(value).strip())
    except InvalidOperation:
        return None


def spend_cap_of(value: JsonValue) -> Decimal:
    amount = decimal_of(value)
    if amount is None or not amount.is_finite() or amount < 0:
        raise InvalidSpendCap(value)
    return amount


async def project_spend_cap(settings: SettingsStore) -> Decimal:
    setting = await settings.get_setting(RESEARCH_SCOPE, SPEND_CAP_KEY)
    if setting is None or setting.value is None:
        return DEFAULT_SPEND_CAP
    return spend_cap_of(setting.value)
