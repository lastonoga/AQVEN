import logging
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from types import TracebackType
from typing import Final, Self, TextIO

from aqven.app.console_log.jsonl import DevLogHandler, dev_log_path
from aqven.app.console_log.levels import DBOS_LOGGER, OWN_LOGGER, PROFILES, ConsoleLevel, LevelProfile
from aqven.app.console_log.python_warnings import WarningsBridge
from aqven.app.console_log.render import ConsoleHandler, terminal_console
from aqven.app.console_log.rules import AccessLineRule, DemoteRule, ShutdownInterruptionRule
from aqven.app.locations import ProjectState
from aqven.log_support import RecordRule, RuleChain

ROOT_LOGGER: Final = ""
RUN_TELEMETRY_LOGGERS: Final = ("aqven.engine.llm",)


@dataclass(frozen=True, slots=True)
class ConsoleSetup:
    level: ConsoleLevel = ConsoleLevel.INFO
    log_file: Path | None = None
    stream: TextIO | None = None
    width: int | None = None
    demoted: tuple[str, ...] = ()


@dataclass(slots=True)
class InstalledConsole:
    profile: LevelProfile
    handlers: tuple[logging.Handler, ...]
    bridge: WarningsBridge
    previous_levels: Mapping[str, int] = field(default_factory=dict[str, int])
    closed: bool = False

    def close(self) -> None:
        if self.closed:
            return
        self.closed = True
        root = logging.getLogger()
        for handler in self.handlers:
            root.removeHandler(handler)
            handler.close()
        for name, level in self.previous_levels.items():
            logging.getLogger(name).setLevel(level)
        self.bridge.uninstall()

    def __enter__(self) -> Self:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        self.close()


def console_rules(setup: ConsoleSetup) -> tuple[RecordRule, ...]:
    demote: tuple[RecordRule, ...] = (DemoteRule(setup.demoted),) if setup.demoted else ()
    return (AccessLineRule(), ShutdownInterruptionRule(), *demote)


def level_table(profile: LevelProfile) -> Mapping[str, int]:
    return {ROOT_LOGGER: profile.root, OWN_LOGGER: profile.own, DBOS_LOGGER: profile.dbos, **profile.libraries}


def apply_levels(table: Mapping[str, int]) -> Mapping[str, int]:
    previous = {name: logging.getLogger(name).level for name in table}
    for name, level in table.items():
        logging.getLogger(name).setLevel(level)
    return previous


def remove_installed(root: logging.Logger) -> None:
    for handler in [item for item in root.handlers if isinstance(item, ConsoleHandler | DevLogHandler)]:
        root.removeHandler(handler)
        handler.close()


def file_handlers(setup: ConsoleSetup, profile: LevelProfile) -> tuple[logging.Handler, ...]:
    if setup.log_file is None:
        return ()
    return (DevLogHandler(setup.log_file, profile.file),)


def install_console(setup: ConsoleSetup) -> InstalledConsole:
    profile = PROFILES[setup.level]
    root = logging.getLogger()
    remove_installed(root)
    console = ConsoleHandler(terminal_console(setup.stream, setup.width), profile.console, verbose=profile.verbose)
    console.addFilter(RuleChain(console_rules(setup)))
    handlers = (console, *file_handlers(setup, profile))
    for handler in handlers:
        root.addHandler(handler)
    previous = apply_levels(level_table(profile))
    bridge = WarningsBridge()
    bridge.install()
    return InstalledConsole(profile=profile, handlers=handlers, bridge=bridge, previous_levels=previous)


def dev_console_setup(project_root: Path, level: ConsoleLevel) -> ConsoleSetup:
    return ConsoleSetup(
        level=level,
        log_file=dev_log_path(ProjectState(project_root).folder),
        demoted=RUN_TELEMETRY_LOGGERS,
    )


def check_console_setup() -> ConsoleSetup:
    return ConsoleSetup(level=ConsoleLevel.WARNING)
