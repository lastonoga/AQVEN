import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from aqven.loader import find_project_root

DEFAULT_PORT: Final = 5180
LOOPBACK_HOST: Final = "127.0.0.1"
STARTUP_TIMEOUT_SECONDS: Final = 30.0
POLL_SECONDS: Final = 0.1


@dataclass(frozen=True, slots=True)
class ServerOptions:
    root: Path
    port: int = DEFAULT_PORT
    data_dir: Path | None = None
    open_browser: bool = True
    headless: bool = False
    studio_dist: Path | None = None
    dev_origin: str | None = None
    host: str = LOOPBACK_HOST
    startup_timeout_seconds: float = STARTUP_TIMEOUT_SECONDS
    poll_seconds: float = POLL_SECONDS

    @property
    def launches_browser(self) -> bool:
        return self.open_browser and not self.headless


def add_server_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--root", type=Path, default=None, help="project root; searched upward from cwd by default")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="port; if it is busy, the next free one is used")
    parser.add_argument("--data-dir", type=Path, default=None, help="Studio data directory instead of the system one")
    parser.add_argument("--no-browser", action="store_true", help="do not open the browser")
    parser.add_argument("--headless", action="store_true", help="no browser, no Studio static files: API and MCP only")
    parser.add_argument("--studio-dist", type=Path, default=None, help="built Studio directory for development")
    parser.add_argument("--dev-origin", default=None, help="Vite dev server origin, for example http://localhost:5173")


def _path(value: object) -> Path | None:
    return value if isinstance(value, Path) else None


def _text(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def server_options(arguments: argparse.Namespace, cwd: Path) -> ServerOptions:
    root = find_project_root(_path(arguments.root) or cwd)
    return ServerOptions(
        root=root,
        port=int(arguments.port),
        data_dir=_path(arguments.data_dir),
        open_browser=not bool(arguments.no_browser),
        headless=bool(arguments.headless),
        studio_dist=_path(arguments.studio_dist),
        dev_origin=_text(arguments.dev_origin),
    )


def server_arguments(options: ServerOptions) -> tuple[str, ...]:
    data_dir = () if options.data_dir is None else ("--data-dir", str(options.data_dir))
    return ("--root", str(options.root), "--port", str(options.port), *data_dir)
