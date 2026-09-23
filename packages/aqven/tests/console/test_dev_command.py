import webbrowser
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final
from urllib.parse import parse_qs, urlsplit

import pytest

from aqven.app.access import ACCESS_TOKEN_PARAMETER
from aqven.app.composition import SeriesEngineHost, StudioFeatures, studio_server
from aqven.app.engine_host import DbosEngineHost
from aqven.app.instance import bind_loopback, bound_port
from aqven.app.locations import ProjectState
from aqven.app.runtime import LocalServer
from aqven.app.runtime_file import ServerRecord, read_server_record
from aqven.cli import main
from aqven.console import serve as serve_module
from aqven.console.new import NewProjectRequest, create_project

LOOPBACK: Final = "127.0.0.1"
NEW_TAB: Final = 2


def free_port() -> int:
    listener = bind_loopback(LOOPBACK, 0)
    port = bound_port(listener)
    listener.close()
    return port


@dataclass(slots=True)
class CapturedServer:
    features: list[StudioFeatures | None] = field(default_factory=list[StudioFeatures | None])
    servers: list[LocalServer] = field(default_factory=list[LocalServer])

    def __call__(self, *, features: StudioFeatures | None = None) -> LocalServer:
        server = studio_server(features=features)
        self.features.append(features)
        self.servers.append(server)
        return server


@dataclass(slots=True)
class StoppingBrowser:
    root: Path
    captured: CapturedServer
    opened: list[tuple[str, int]] = field(default_factory=list[tuple[str, int]])
    records: list[ServerRecord | None] = field(default_factory=list[ServerRecord | None])

    def open(self, url: str, new: int = 0, autoraise: bool = True) -> bool:
        self.opened.append((url, new))
        self.records.append(read_server_record(ProjectState(self.root)))
        self.captured.servers[-1].request_stop()
        return True


@pytest.fixture
def project_root(tmp_path: Path) -> Path:
    target = tmp_path / "studio_shop"
    assert create_project(NewProjectRequest(target=target, sync=False)) == 0
    return (target / "studio_shop").resolve()


@pytest.mark.parametrize(("extra", "expects_token"), [((), False), (("--require-auth",), True)])
def test_dev_serves_the_project_watches_files_and_opens_studio_at_the_expected_url(
    project_root: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, extra: tuple[str, ...], expects_token: bool
) -> None:
    captured = CapturedServer()
    browser = StoppingBrowser(project_root, captured)
    monkeypatch.setattr(serve_module, "studio_server", captured)
    monkeypatch.setattr(webbrowser, "open", browser.open)

    code = main(["dev", str(project_root), "--port", str(free_port()), "--data-dir", str(tmp_path / "data"), *extra])

    assert code == 0
    [(url, new)] = browser.opened
    [record] = browser.records
    [features] = captured.features
    [server] = captured.servers
    assert record is not None
    assert features is not None and features.watch
    assert isinstance(server.engine, SeriesEngineHost)
    assert isinstance(server.engine.inner, DbosEngineHost)
    parts = urlsplit(url)
    assert (parts.scheme, parts.hostname, parts.port) == ("http", LOOPBACK, record.port)
    if expects_token:
        assert parse_qs(parts.query)[ACCESS_TOKEN_PARAMETER] == [record.token]
        assert url == record.browser_url()
    else:
        assert parts.query == ""
        assert url == f"{record.url}/"
    assert new == NEW_TAB
    assert read_server_record(ProjectState(project_root)) is None
