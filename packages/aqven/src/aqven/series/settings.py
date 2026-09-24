from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Final

from pydantic import JsonValue

from aqven.loader import LoadedProject
from aqven.ports.settings import SettingKey, SettingScope, SettingsStore, setting_key
from aqven.series.model import CapSource
from aqven.spec import ResearchSettings

SPEND_CAP_KEY: Final[SettingKey] = setting_key("research.spend_cap_usd")
RESEARCH_SCOPE: Final[SettingScope] = "project"
DEFAULT_SPEND_CAP: Final = Decimal("1.00")


@dataclass(frozen=True, slots=True)
class ProjectCap:
    usd: Decimal
    source: CapSource


DEFAULT_CAP: Final = ProjectCap(usd=DEFAULT_SPEND_CAP, source="default")


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


def research_of(project: LoadedProject | None) -> ResearchSettings | None:
    return None if project is None else project.project.spec.research


def resolved_cap(override: JsonValue, research: ResearchSettings | None) -> ProjectCap:
    if override is not None:
        return ProjectCap(usd=spend_cap_of(override), source="override")
    if research is not None:
        return ProjectCap(usd=research.spend_cap_usd, source="project")
    return DEFAULT_CAP


async def cap_override(settings: SettingsStore) -> JsonValue:
    setting = await settings.get_setting(RESEARCH_SCOPE, SPEND_CAP_KEY)
    return None if setting is None else setting.value


async def project_spend_cap(settings: SettingsStore, research: ResearchSettings | None) -> ProjectCap:
    return resolved_cap(await cap_override(settings), research)
