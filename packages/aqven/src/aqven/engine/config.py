import logging
from dataclasses import dataclass
from pathlib import Path

from dbos import DBOSConfig

from aqven.engine.dbos_logs import DBOS_LOGGER_NAME
from aqven.engine.protocol import (
    APPLICATION_NAME,
    BLOBS_DIRECTORY,
    DBOS_DATABASE_FILE,
    DBOS_LOG_LEVEL,
    EXECUTOR_PROTOCOL_VERSION,
    PLANS_DIRECTORY,
    POLLING_INTERVAL_SECONDS,
    STATE_DIRECTORY,
)


@dataclass(frozen=True, slots=True)
class EnginePaths:
    root: Path
    state_dir: Path | None = None

    @property
    def state(self) -> Path:
        return self.state_dir if self.state_dir is not None else self.root / STATE_DIRECTORY

    @property
    def dbos_database(self) -> Path:
        return self.state / DBOS_DATABASE_FILE

    @property
    def plans(self) -> Path:
        return self.state / PLANS_DIRECTORY

    @property
    def blobs(self) -> Path:
        return self.state / BLOBS_DIRECTORY

    def ensure(self) -> None:
        for directory in (self.state, self.plans, self.blobs):
            directory.mkdir(parents=True, exist_ok=True)


def dbos_log_level(configured: str | None = None) -> str:
    if configured is not None:
        return configured
    level = logging.getLogger(DBOS_LOGGER_NAME).level
    return DBOS_LOG_LEVEL if level == logging.NOTSET else logging.getLevelName(level)


def dbos_config(paths: EnginePaths, *, log_level: str = DBOS_LOG_LEVEL) -> DBOSConfig:
    return {
        "name": APPLICATION_NAME,
        "system_database_url": f"sqlite:///{paths.dbos_database.resolve()}",
        "application_version": EXECUTOR_PROTOCOL_VERSION,
        "use_listen_notify": False,
        "notification_listener_polling_interval_sec": POLLING_INTERVAL_SECONDS,
        "log_level": log_level,
        "run_admin_server": False,
    }
