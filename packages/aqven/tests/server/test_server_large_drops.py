import asyncio
import os
from collections.abc import AsyncGenerator, Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

import pytest
from fastapi.testclient import TestClient
from watchfiles import Change

from aqven.check import CheckReport
from aqven.diagnostics import Diagnostic, DiagnosticCode
from aqven.loader import file_hash
from aqven.server import ProjectWorkspace, SpecEventHub, spec_channel
from aqven.server import workspace as workspace_module
from aqven.server.spec_channel import (
    GIT_BATCH_LIMIT,
    BurstPolicy,
    ChangeBatch,
    DiagnosticsChanged,
    FilesChanged,
    SimulationFeed,
    SpecEvent,
    SpecResync,
    file_changes,
    watch_project,
)
from aqven.server.workspace import ASSET_FINGERPRINT_PREFIX, EMPTY_SNAPSHOT, TreeSnapshot, take_snapshot
from aqven.testing import copy_project

FIXTURE: Final = Path(__file__).parents[1] / "fixtures" / "fixture_shop"
FRAGMENT: Final = "shared/tone.md"
DATASET_FILE: Final = "datasets/photos.yaml"
PHOTO_FILE: Final = "datasets/photos/parcel.jpg"
BURST_FOLDER: Final = "samples/raw"
BURST: Final = GIT_BATCH_LIMIT + 50
PHOTO_DATASET: Final = """apiVersion: "aqven/v1"
kind: "Dataset"
flow: "triage"
cases:
- name: "late_parcel"
  inputs:
    subject: "Where is my parcel"
    body: "The order did not arrive in time"
    customer:
      name: "Anna"
      email: null
    photo:
      $media: "image/jpeg"
      file: "parcel.jpg"
  expected_output:
    category: "delivery"
    summary: "The parcel is late"
"""


def write_bytes(root: Path, relative: str, data: bytes) -> None:
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)


def drop_media(root: Path, count: int, folder: str = BURST_FOLDER) -> None:
    suffixes = (".jpg", ".png", ".wav", ".mp4")
    for index in range(count):
        write_bytes(root, f"{folder}/item_{index:04d}{suffixes[index % 4]}", os.urandom(256))


def edit_fragment(root: Path, text: str) -> None:
    (root / FRAGMENT).write_text(text, encoding="utf-8")


@dataclass(slots=True)
class CountedChecks:
    real: Callable[[Path], CheckReport]
    calls: list[Path] = field(default_factory=list[Path])

    def __call__(self, root: Path) -> CheckReport:
        self.calls.append(root)
        return self.real(root)


@dataclass(slots=True)
class CountedSimulation:
    starts: int = 0

    async def __call__(self) -> tuple[Diagnostic, ...]:
        self.starts += 1
        return ()


@pytest.fixture
def shop(tmp_path: Path) -> Path:
    root = copy_project(FIXTURE, tmp_path)
    write_bytes(root, PHOTO_FILE, b"jpeg bytes")
    (root / DATASET_FILE).write_text(PHOTO_DATASET, encoding="utf-8")
    return root


@pytest.fixture
def checks(monkeypatch: pytest.MonkeyPatch) -> CountedChecks:
    counted = CountedChecks(workspace_module.check_project)
    monkeypatch.setattr(workspace_module, "check_project", counted)
    return counted


def test_media_files_are_fingerprinted_by_size_and_time_and_specs_by_content(shop: Path) -> None:
    write_bytes(shop, "samples/clip.mp4", b"x" * 64)

    snapshot = take_snapshot(shop)

    clip = snapshot.get("samples/clip.mp4")
    project = snapshot.get("aqven.yaml")
    assert clip is not None and project is not None
    assert clip.file_hash is None
    assert clip.fingerprint == f"{ASSET_FINGERPRINT_PREFIX}64-{(shop / 'samples/clip.mp4').stat().st_mtime_ns}"
    assert project.file_hash == file_hash((shop / "aqven.yaml").read_bytes())


def test_a_replaced_media_file_is_a_change_without_a_content_hash(shop: Path) -> None:
    write_bytes(shop, "samples/clip.mp4", b"first")
    before = take_snapshot(shop)
    write_bytes(shop, "samples/clip.mp4", b"a longer second take")

    after = take_snapshot(shop, before)

    [change] = file_changes(before, after)
    assert (change.path, change.change) == ("samples/clip.mp4", "modified")
    assert (change.file_hash_before, change.file_hash_after) == (None, None)
    assert after.tree_hash != before.tree_hash


def test_a_burst_of_media_files_changes_the_tree_without_a_reindex(shop: Path, checks: CountedChecks) -> None:
    simulation = CountedSimulation()

    async def scenario() -> tuple[tuple[object, ...], tuple[object, ...], int]:
        feed = SimulationFeed(simulation, delay_seconds=0.0)
        workspace = ProjectWorkspace(shop)
        hub = SpecEventHub(workspace, simulation=feed)
        await hub.prime()
        assert feed.task is not None
        await feed.task
        drop_media(shop, BURST)
        burst = await hub.refresh()
        drop_media(shop, 3, "samples/more")
        small = await hub.refresh()
        return burst, small, (await workspace.state()).generation

    burst, small, generation = asyncio.run(scenario())

    assert [type(event) for event in burst] == [SpecResync]
    assert [type(event) for event in small] == [FilesChanged]
    assert len(checks.calls) == 1
    assert generation == 1
    assert simulation.starts == 1


def test_a_spec_edit_inside_a_media_burst_is_reindexed(shop: Path, checks: CountedChecks) -> None:
    async def scenario() -> tuple[tuple[object, ...], str]:
        workspace = ProjectWorkspace(shop)
        hub = SpecEventHub(workspace)
        await hub.prime()
        drop_media(shop, 40)
        edit_fragment(shop, "Answer in a warm and very short tone.")
        drop_media(shop, 40, "samples/later")
        events = await hub.refresh()
        project = (await workspace.state()).report.project
        assert project is not None
        return events, project.texts[FRAGMENT]

    events, text = asyncio.run(scenario())

    [files] = [event for event in events if isinstance(event, FilesChanged)]
    assert FRAGMENT in {change.path for change in files.changes}
    assert len(checks.calls) == 2
    assert text == "Answer in a warm and very short tone."


def test_a_referenced_media_file_that_goes_missing_is_reindexed(shop: Path, checks: CountedChecks) -> None:
    async def scenario() -> tuple[set[DiagnosticCode], set[DiagnosticCode], int]:
        workspace = ProjectWorkspace(shop)
        clean = await workspace.state()
        write_bytes(shop, "datasets/photos/unused.jpg", b"not referenced")
        unreferenced = await workspace.state()
        (shop / PHOTO_FILE).unlink()
        missing = await workspace.state()
        assert unreferenced.generation == clean.generation
        return (
            {item.code for item in clean.report.diagnostics},
            {item.code for item in missing.report.diagnostics},
            missing.generation,
        )

    clean, missing, generation = asyncio.run(scenario())

    assert DiagnosticCode.E_MEDIA_FILE_MISSING not in clean
    assert DiagnosticCode.E_MEDIA_FILE_MISSING in missing
    assert generation == 2
    assert len(checks.calls) == 2


def test_a_simulation_survives_media_changes_and_is_redone_after_a_spec_change(shop: Path) -> None:
    simulation = CountedSimulation()

    async def scenario() -> tuple[int, int]:
        feed = SimulationFeed(simulation, delay_seconds=0.0)
        hub = SpecEventHub(ProjectWorkspace(shop), simulation=feed)
        await hub.prime()
        assert feed.task is not None
        await feed.task
        drop_media(shop, 5)
        await hub.refresh()
        after_media = simulation.starts
        edit_fragment(shop, "A new tone.")
        await hub.refresh()
        assert feed.task is not None
        await feed.task
        return after_media, simulation.starts

    after_media, after_spec = asyncio.run(scenario())

    assert (after_media, after_spec) == (1, 2)


def test_the_watcher_sees_a_spec_edit_made_during_a_media_burst(shop: Path) -> None:
    async def scenario() -> tuple[str, list[object]]:
        workspace = ProjectWorkspace(shop)
        hub = SpecEventHub(workspace)
        stop = asyncio.Event()
        watcher = asyncio.create_task(watch_project(hub, shop, stop, debounce_ms=50, simulate=False))
        while not hub.primed:
            await asyncio.sleep(0.01)
        primed = hub.spec_key
        for batch in range(6):
            await asyncio.to_thread(drop_media, shop, 60, f"samples/batch_{batch}")
            if batch == 2:
                edit_fragment(shop, "Edited while files were landing.")
        async with asyncio.timeout(20):
            while hub.spec_key == primed:
                await asyncio.sleep(0.05)
        project = (await workspace.state()).report.project
        stop.set()
        await hub.close()
        await asyncio.wait_for(watcher, 10)
        assert project is not None
        return project.texts[FRAGMENT], list(hub.events)

    text, events = asyncio.run(scenario())

    assert text == "Edited while files were landing."
    assert not any(isinstance(event, DiagnosticsChanged) and event.problems.error for event in events)


def test_the_file_listing_hashes_a_media_file_only_when_it_is_listed(
    server_client: TestClient, server_project: Path
) -> None:
    data = os.urandom(4096)
    write_bytes(server_project, "samples/photo.jpg", data)

    listed = server_client.get("/api/files", params={"prefix": "samples/"}).json()["items"]
    detail = server_client.get("/api/files/samples/photo.jpg").json()

    assert [(item["path"], item["file_hash"]) for item in listed] == [("samples/photo.jpg", file_hash(data))]
    assert detail["file_hash"] == file_hash(data)
    assert detail["size_bytes"] == len(data)


type Script = Sequence[tuple[float, int]]


def scripted_watch(script: Script) -> Callable[..., AsyncGenerator[ChangeBatch]]:
    async def batches(*paths: Path | str, **options: object) -> AsyncGenerator[ChangeBatch]:
        for index, (pause, size) in enumerate(script):
            await asyncio.sleep(pause)
            yield {(Change.added, f"{paths[0]}/samples/{index}_{item}.jpg") for item in range(size)}

    return batches


def counted_refreshes(monkeypatch: pytest.MonkeyPatch, script: Script, burst: BurstPolicy, root: Path) -> int:
    calls: list[int] = []

    async def refresh(self: SpecEventHub) -> tuple[SpecEvent, ...]:
        calls.append(len(calls))
        return ()

    monkeypatch.setattr(SpecEventHub, "refresh", refresh)
    monkeypatch.setattr(spec_channel, "AWATCH", scripted_watch(script))
    hub = SpecEventHub(ProjectWorkspace(root))
    asyncio.run(watch_project(hub, root, asyncio.Event(), simulate=False, burst=burst))
    return len(calls)


def test_the_batches_of_one_burst_are_folded_into_one_refresh(shop: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    burst = BurstPolicy(paths=3, quiet_seconds=0.1, longest_seconds=2.0)
    script = ((0.0, 5), (0.01, 1), (0.01, 4), (0.01, 1), (0.3, 1), (0.3, 1))

    assert counted_refreshes(monkeypatch, script, burst, shop) == 4


def test_a_burst_that_never_settles_is_still_refreshed_on_time(shop: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    burst = BurstPolicy(paths=3, quiet_seconds=0.1, longest_seconds=0.1)
    script = tuple((0.02, 5) for _ in range(30))

    assert counted_refreshes(monkeypatch, script, burst, shop) >= 4


def test_concurrent_readers_share_one_scan_of_the_tree(shop: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    scans: list[int] = []
    real = workspace_module.take_snapshot

    def counted(root: Path, previous: TreeSnapshot = EMPTY_SNAPSHOT) -> TreeSnapshot:
        scans.append(len(scans))
        return real(root, previous)

    async def scenario() -> set[str]:
        workspace = ProjectWorkspace(shop)
        await workspace.state()
        monkeypatch.setattr(workspace_module, "take_snapshot", counted)
        drop_media(shop, 3)
        states = await asyncio.gather(*(workspace.state() for _ in range(8)))
        return {state.snapshot.tree_hash for state in states}

    hashes = asyncio.run(scenario())

    assert len(hashes) == 1
    assert len(scans) <= 2
