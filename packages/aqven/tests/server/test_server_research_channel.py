import asyncio
import json
import shutil
import threading
import time
from collections.abc import Iterator
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Final

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from server_fakes import AUTH, SERVER_BASE, FakeEngine, MemorySettings, copy_fixture
from sse_frames import parse_frames

from aqven.series.feed import (
    FindingNotice,
    ResearchNotice,
    SeriesKey,
    SeriesProgressNotice,
    SeriesStartedNotice,
    SeriesStatusNotice,
)
from aqven.series.model import SeriesId, SeriesStatus
from aqven.server import ProjectWorkspace, ServerExtensions, ServerOptions, SpecEventHub, create_app, server_context
from aqven.server.research_events import ExperimentChanged, FindingWritten, SeriesStartedEvent
from aqven.server.research_relay import ProgressThrottle, ResearchRelay, research_lifespan
from aqven.server.spec_channel import FilesChanged, SpecEvent
from aqven.spec import ExperimentId, FlowId

SERIES: Final = SeriesId("01999f2e-4b1c-7a3d-9e21-5c7d8f0a1b2c")
OTHER: Final = SeriesId("01999f2f-0000-7000-8000-000000000001")
EXPERIMENT: Final = ExperimentId("reply_quality")
KEY: Final = SeriesKey(series_id=SERIES, experiment_id=EXPERIMENT, flow_id=FlowId("intake"))
OTHER_KEY: Final = SeriesKey(series_id=OTHER, experiment_id=None, flow_id=FlowId("intake"))
INTERVAL: Final = 0.05
SETTLE: Final = 0.2
DELIVERY_SECONDS: Final = 5.0
PROBE_EXPERIMENT: Final = 'apiVersion: "aqven/v1"\nkind: "Experiment"\ndescription: "probe"\n'
FINDING_PATH: Final = f"experiments/{EXPERIMENT}/findings/{SERIES}.yaml"

type Events = tuple[SpecEvent, ...]


def progress(done: int, key: SeriesKey = KEY, total: int = 4) -> SeriesProgressNotice:
    return SeriesProgressNotice(series=key, done=done, total=total, spend_usd=Decimal(done) / 100)


@dataclass(slots=True)
class RecordingSink:
    notices: list[ResearchNotice] = field(default_factory=list[ResearchNotice])
    threads: list[int] = field(default_factory=list[int])

    async def announce(self, notice: ResearchNotice) -> object:
        self.notices.append(notice)
        self.threads.append(threading.get_ident())
        return None


def test_the_hub_stamps_a_research_notice_as_the_next_project_event(tmp_path: Path) -> None:
    root = copy_fixture("standard_shop", tmp_path)

    async def scenario() -> None:
        hub = SpecEventHub(ProjectWorkspace(root))
        await hub.prime()
        notice = SeriesStartedNotice(series=KEY, status=SeriesStatus.RUNNING, total=16)
        [event] = await hub.announce(notice)
        assert isinstance(event, SeriesStartedEvent)
        assert (event.seq, event.tree_hash) == (1, hub.snapshot.tree_hash)
        assert (event.series_id, event.experiment_id, event.flow_id) == (SERIES, EXPERIMENT, "intake")
        assert (event.status, event.total) == (SeriesStatus.RUNNING, 16)
        [finding] = await hub.announce(
            FindingNotice(experiment_id=EXPERIMENT, series_id=SERIES, paths=(FINDING_PATH, "FINDINGS.md"))
        )
        assert isinstance(finding, FindingWritten)
        assert (finding.seq, finding.paths) == (2, (FINDING_PATH, "FINDINGS.md"))

    asyncio.run(scenario())


def test_the_watcher_names_the_experiment_whose_files_changed(tmp_path: Path) -> None:
    root = copy_fixture("standard_shop", tmp_path)
    folder = root / "experiments" / "probe"

    async def scenario() -> tuple[Events, Events, Events]:
        hub = SpecEventHub(ProjectWorkspace(root))
        await hub.prime()
        folder.mkdir(parents=True)
        (folder / "experiment.yaml").write_text(PROBE_EXPERIMENT, encoding="utf-8")
        added = await hub.refresh()
        (folder / "experiment.md").write_text("Why we probe.\n", encoding="utf-8")
        modified = await hub.refresh()
        shutil.rmtree(folder)
        deleted = await hub.refresh()
        return added, modified, deleted

    added, modified, deleted = asyncio.run(scenario())

    assert touches(added) == [("probe", "added", ("experiments/probe/experiment.yaml",))]
    assert touches(modified) == [("probe", "modified", ("experiments/probe/experiment.md",))]
    assert touches(deleted) == [
        ("probe", "deleted", ("experiments/probe/experiment.md", "experiments/probe/experiment.yaml"))
    ]
    files, experiment = modified[0], modified[1]
    assert isinstance(files, FilesChanged) and isinstance(experiment, ExperimentChanged)
    assert (experiment.seq, experiment.tree_hash) == (files.seq + 1, files.tree_hash)


def touches(events: Events) -> list[tuple[str, str, tuple[str, ...]]]:
    return [
        (event.experiment_id, event.change, event.paths) for event in events if isinstance(event, ExperimentChanged)
    ]


def test_a_change_outside_experiments_names_no_experiment(tmp_path: Path) -> None:
    root = copy_fixture("standard_shop", tmp_path)

    async def scenario() -> None:
        hub = SpecEventHub(ProjectWorkspace(root))
        await hub.prime()
        (root / "fragments/extra.md").write_text("New fragment", encoding="utf-8")
        events = await hub.refresh()
        assert touches(events) == []

    asyncio.run(scenario())


def test_progress_is_held_to_one_per_interval_per_series_and_the_latest_arrives() -> None:
    async def scenario() -> list[ResearchNotice]:
        sink = RecordingSink()
        throttle = ProgressThrottle(sink, interval=INTERVAL)
        await throttle.announce(progress(1))
        await throttle.announce(progress(2))
        await throttle.announce(progress(3))
        await throttle.announce(progress(1, OTHER_KEY))
        await asyncio.sleep(SETTLE)
        await throttle.announce(progress(4))
        return sink.notices

    assert asyncio.run(scenario()) == [progress(1), progress(1, OTHER_KEY), progress(3), progress(4)]


def test_a_status_change_drops_the_progress_held_for_its_series() -> None:
    status = SeriesStatusNotice(series=KEY, status=SeriesStatus.DONE, previous=SeriesStatus.RUNNING)

    async def scenario() -> list[ResearchNotice]:
        sink = RecordingSink()
        throttle = ProgressThrottle(sink, interval=INTERVAL)
        await throttle.announce(progress(1))
        await throttle.announce(progress(2))
        await throttle.announce(status)
        await asyncio.sleep(SETTLE)
        return sink.notices

    assert asyncio.run(scenario()) == [progress(1), status]


def test_the_relay_hands_notices_from_any_thread_to_the_loop_it_was_attached_on() -> None:
    relay = ResearchRelay()
    early = SeriesStartedNotice(series=KEY, status=SeriesStatus.RUNNING, total=4)
    relay.publish(early)

    async def scenario() -> tuple[RecordingSink, int]:
        sink = RecordingSink()
        relay.attach(sink)
        publisher = threading.Thread(target=relay.publish, args=(progress(4),))
        publisher.start()
        publisher.join()
        deadline = time.monotonic() + DELIVERY_SECONDS
        while not sink.notices and time.monotonic() < deadline:
            await asyncio.sleep(0.01)
        relay.detach()
        relay.publish(progress(4))
        await asyncio.sleep(0.05)
        return sink, threading.get_ident()

    sink, loop_thread = asyncio.run(scenario())
    assert sink.notices == [progress(4)]
    assert sink.threads == [loop_thread]


@pytest.fixture
def relay() -> ResearchRelay:
    return ResearchRelay()


@pytest.fixture
def relayed_app(server_project: Path, server_options: ServerOptions, relay: ResearchRelay) -> FastAPI:
    extensions = ServerExtensions(lifespans=(research_lifespan(relay),))
    return create_app(server_project, FakeEngine(), MemorySettings(), options=server_options, extensions=extensions)


@pytest.fixture
def relayed_client(relayed_app: FastAPI) -> Iterator[TestClient]:
    with TestClient(relayed_app, base_url=SERVER_BASE, headers=AUTH) as client:
        yield client


def test_a_notice_published_from_the_series_layer_lands_on_the_project_channel(
    relayed_app: FastAPI, relayed_client: TestClient, relay: ResearchRelay
) -> None:
    hub = server_context(relayed_app).hub

    relay.publish(SeriesStartedNotice(series=KEY, status=SeriesStatus.AWAITING_APPROVAL, total=16))
    deadline = time.monotonic() + DELIVERY_SECONDS
    while not hub.events and time.monotonic() < deadline:
        time.sleep(0.01)

    [event] = list(hub.events)
    assert isinstance(event, SeriesStartedEvent)
    assert (event.series_id, event.status) == (SERIES, SeriesStatus.AWAITING_APPROVAL)
    assert relayed_client.get("/api/project").json()["spec_seq"] == 1


def test_research_frames_stream_on_the_spec_channel_by_type(server_app: FastAPI, server_client: TestClient) -> None:
    hub = server_context(server_app).hub
    asyncio.run(hub.announce(SeriesStartedNotice(series=KEY, status=SeriesStatus.RUNNING, total=16)))
    asyncio.run(hub.announce(progress(2)))
    asyncio.run(hub.announce(SeriesStatusNotice(series=KEY, status=SeriesStatus.DONE, previous=SeriesStatus.RUNNING)))
    asyncio.run(hub.close())

    frames = parse_frames(server_client.get("/api/events/spec").text)

    assert [(frame.event, frame.id) for frame in frames] == [
        ("series_started", "1"),
        ("series_progress", "2"),
        ("series_status_changed", "3"),
    ]
    progressed = json.loads(frames[1].data or "{}")
    assert (progressed["series_id"], progressed["experiment_id"], progressed["flow_id"]) == (
        SERIES,
        EXPERIMENT,
        "intake",
    )
    assert (progressed["done"], progressed["total"], progressed["spend_usd"]) == (2, 4, "0.02")
    changed = json.loads(frames[2].data or "{}")
    assert (changed["status"], changed["previous"]) == ("done", "running")
