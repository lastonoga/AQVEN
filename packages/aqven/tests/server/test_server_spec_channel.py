import asyncio
import json
from collections.abc import AsyncGenerator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from server_fakes import copy_fixture
from sse_frames import parse_frames
from watchfiles import Change

from aqven.loader import project as loader_project
from aqven.server import ProjectWorkspace, ServerOptions, SpecEventHub, server_context, spec_channel
from aqven.server.app import spec_watcher
from aqven.server.spec_channel import (
    DiagnosticsChanged,
    FilesChanged,
    SpecEvent,
    SpecResync,
    supervise_watcher,
    watch_project,
)


def edit_prompt(root: Path) -> Path:
    prompt = root / "flows/intake/nodes/reply/reply.prompt.md"
    prompt.write_text(prompt.read_text(encoding="utf-8") + "\nAnd more.\n", encoding="utf-8")
    return prompt


def test_hub_publishes_file_changes(tmp_path: Path) -> None:
    root = copy_fixture("standard_shop", tmp_path)

    async def scenario() -> None:
        hub = SpecEventHub(ProjectWorkspace(root))
        await hub.prime()
        before = hub.snapshot.get("flows/intake/nodes/reply/reply.prompt.md")
        edit_prompt(root)
        (root / "fragments/extra.md").write_text("New fragment", encoding="utf-8")
        (root / "fragments/tone.md").unlink()
        event, *rest = await hub.refresh()
        assert isinstance(event, FilesChanged)
        assert [item.type for item in rest] == ["diagnostics_changed"]
        changes = {change.path: change for change in event.changes}
        modified = changes["flows/intake/nodes/reply/reply.prompt.md"]
        assert modified.change == "modified"
        assert before is not None and modified.file_hash_before == before.file_hash
        assert changes["fragments/extra.md"].change == "added"
        assert changes["fragments/tone.md"].change == "deleted"
        assert event.seq == 1
        assert event.tree_hash == hub.snapshot.tree_hash
        assert await hub.refresh() == ()

    asyncio.run(scenario())


def test_hub_reports_diagnostics_changes(tmp_path: Path) -> None:
    root = copy_fixture("standard_shop", tmp_path)

    async def scenario() -> None:
        hub = SpecEventHub(ProjectWorkspace(root))
        await hub.prime()
        node = root / "flows/intake/nodes/clean/clean.node.yaml"
        node.write_text(node.read_text(encoding="utf-8").replace('node: "code"', 'node: "cod"'), encoding="utf-8")
        events = await hub.refresh()
        diagnostics = [event for event in events if isinstance(event, DiagnosticsChanged)]
        assert [event.compile_status for event in diagnostics] == ["invalid"]
        assert [event.seq for event in events] == [1, 2]

    asyncio.run(scenario())


def test_follow_replays_after_cursor_and_detects_window(tmp_path: Path) -> None:
    root = copy_fixture("standard_shop", tmp_path)

    async def scenario() -> None:
        hub = SpecEventHub(ProjectWorkspace(root), window=1)
        await hub.prime()
        edit_prompt(root)
        await hub.refresh()
        edit_prompt(root)
        await hub.refresh()
        await hub.close()
        replay = [event async for event in hub.follow(1)]
        stale = [event async for event in hub.follow(0)]
        assert [event.seq for event in replay] == [2]
        assert isinstance(stale[0], SpecResync)
        assert stale[0].reason == "window_exceeded"
        assert [event.seq for event in stale[1:]] == []
        ahead = [event async for event in hub.follow(99)]
        assert isinstance(ahead[0], SpecResync)
        assert ahead[0].reason == "watcher_restarted"

    asyncio.run(scenario())


def test_follow_waits_for_new_events(tmp_path: Path) -> None:
    root = copy_fixture("standard_shop", tmp_path)

    async def scenario() -> None:
        hub = SpecEventHub(ProjectWorkspace(root))
        await hub.prime()
        received: list[int] = []

        async def reader() -> None:
            async for event in hub.follow(0):
                received.append(event.seq)
                return

        task = asyncio.create_task(reader())
        await asyncio.sleep(0.05)
        edit_prompt(root)
        await hub.refresh()
        await asyncio.wait_for(task, 5)
        assert received == [1]

    asyncio.run(scenario())


def test_watcher_picks_up_external_edit(tmp_path: Path) -> None:
    root = copy_fixture("standard_shop", tmp_path)

    async def scenario() -> None:
        hub = SpecEventHub(ProjectWorkspace(root))
        stop = asyncio.Event()
        watcher = asyncio.create_task(watch_project(hub, root, stop, debounce_ms=50))
        await asyncio.sleep(0.5)
        edit_prompt(root)
        hidden = root / ".aqven"
        hidden.mkdir()
        (hidden / "server.json").write_text("{}", encoding="utf-8")
        first = await asyncio.wait_for(anext(aiter(hub.follow(0))), 10)
        stop.set()
        await hub.close()
        await asyncio.wait_for(watcher, 10)
        assert isinstance(first, FilesChanged)
        assert [change.path for change in first.changes] == ["flows/intake/nodes/reply/reply.prompt.md"]

    asyncio.run(scenario())


def test_spec_watcher_closes_the_hub_as_soon_as_the_shutdown_signal_fires(tmp_path: Path) -> None:
    root = copy_fixture("standard_shop", tmp_path)

    async def scenario() -> None:
        hub = SpecEventHub(ProjectWorkspace(root))
        shutdown_signal = asyncio.Event()
        options = ServerOptions(shutdown_signal=shutdown_signal)
        received: list[int] = []

        async def reader() -> None:
            async for event in hub.follow(0):
                received.append(event.seq)

        async with spec_watcher(hub, root, options):
            task = asyncio.create_task(reader())
            await asyncio.sleep(0.05)
            assert not task.done()
            shutdown_signal.set()
            await asyncio.wait_for(task, 1)
        assert received == []

    asyncio.run(scenario())


def test_spec_sse_replays_with_last_event_id(
    server_app: FastAPI, server_client: TestClient, server_project: Path
) -> None:
    hub = server_context(server_app).hub
    edit_prompt(server_project)
    asyncio.run(hub.refresh())
    edit_prompt(server_project)
    asyncio.run(hub.refresh())
    asyncio.run(hub.close())
    frames = parse_frames(server_client.get("/api/events/spec", headers={"Last-Event-ID": "1"}).text)
    assert [frame.id for frame in frames] == ["2"]
    assert frames[0].event == "files_changed"
    assert json.loads(frames[0].data or "{}")["tree_hash"].startswith("sha256-")
    assert server_client.get("/api/project").json()["spec_seq"] == 2


def test_spec_channel_events_are_published_with_their_schemas(server_client: TestClient) -> None:
    schemas = server_client.get("/api/schemas/events").json()["schemas"]["spec"]

    assert set(schemas) == {
        "files_changed",
        "diagnostics_changed",
        "resync",
        "series_started",
        "series_progress",
        "series_status_changed",
        "finding_written",
        "experiment_changed",
    }
    assert schemas["series_status_changed"]["properties"]["status"]["$ref"].endswith("SeriesStatus")
    assert schemas["files_changed"]["properties"]["changes"]["items"]["$ref"].endswith("FileChange")


def test_hub_refresh_survives_a_file_deleted_mid_rebuild(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = copy_fixture("standard_shop", tmp_path)
    ghost = root / "fragments/ghost.md"
    listed = loader_project.project_files

    def listing_then_delete(folder: Path) -> tuple[str, ...]:
        files = listed(folder)
        ghost.unlink(missing_ok=True)
        return files

    async def scenario() -> None:
        hub = SpecEventHub(ProjectWorkspace(root))
        await hub.prime()
        ghost.write_text("appears and vanishes", encoding="utf-8")
        edit_prompt(root)
        monkeypatch.setattr(loader_project, "project_files", listing_then_delete)
        event, *_ = await hub.refresh()
        monkeypatch.undo()
        assert isinstance(event, FilesChanged)
        assert "flows/intake/nodes/reply/reply.prompt.md" in {change.path for change in event.changes}
        edit_prompt(root)
        assert await hub.refresh() != ()

    asyncio.run(scenario())


def test_watcher_keeps_watching_after_a_refresh_fails(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = copy_fixture("standard_shop", tmp_path)
    calls: list[int] = []

    async def refresh(self: SpecEventHub) -> tuple[SpecEvent, ...]:
        calls.append(len(calls))
        if len(calls) == 2:
            raise FileNotFoundError("datasets/zz_perf_probe.yaml")
        return ()

    async def batches(*paths: Path | str, **options: object) -> AsyncGenerator[set[tuple[Change, str]]]:
        for index in range(3):
            yield {(Change.modified, f"{paths[0]}/file-{index}.yaml")}

    monkeypatch.setattr(SpecEventHub, "refresh", refresh)
    monkeypatch.setattr(spec_channel, "AWATCH", batches)
    hub = SpecEventHub(ProjectWorkspace(root))
    asyncio.run(watch_project(hub, root, asyncio.Event(), simulate=False))
    assert calls == [0, 1, 2, 3]


def test_supervisor_restarts_a_watcher_that_died(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = copy_fixture("standard_shop", tmp_path)
    started: list[int] = []

    async def dying_watch(hub: SpecEventHub, folder: Path, stop: asyncio.Event, debounce_ms: int) -> None:
        started.append(debounce_ms)
        if len(started) == 1:
            raise OSError("watch backend lost the root")
        stop.set()

    monkeypatch.setattr(spec_channel, "watch_project", dying_watch)
    hub = SpecEventHub(ProjectWorkspace(root))
    asyncio.run(supervise_watcher(hub, root, asyncio.Event(), debounce_ms=50, restart_seconds=0.0))
    assert started == [50, 50]
