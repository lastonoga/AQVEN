from typing import Final

from pydantic import TypeAdapter, ValidationError

from aqven.engine.throttle import MINIMUM_WORKERS
from aqven.ports.settings import SettingKey, SettingScope, SettingsStore, setting_key

MAX_PARALLEL_KEY: Final[SettingKey] = setting_key("runtime.max_parallel")
MAX_PARALLEL_SCOPE: Final[SettingScope] = "project"
WORKERS: Final[TypeAdapter[int]] = TypeAdapter(int)


class InvalidWorkerCount(ValueError):
    def __init__(self, value: object) -> None:
        super().__init__(
            f"project setting {MAX_PARALLEL_KEY} must be a whole number of at least {MINIMUM_WORKERS}, got {value!r}"
        )
        self.value = value


async def configured_workers(settings: SettingsStore) -> int | None:
    setting = await settings.get_setting(MAX_PARALLEL_SCOPE, MAX_PARALLEL_KEY)
    if setting is None or setting.value is None:
        return None
    try:
        workers = WORKERS.validate_python(setting.value, strict=True)
    except ValidationError as error:
        raise InvalidWorkerCount(setting.value) from error
    if workers < MINIMUM_WORKERS:
        raise InvalidWorkerCount(setting.value)
    return workers
