import asyncio
import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.sse import ServerSentEvent
from fastapi.testclient import TestClient
from pydantic import BaseModel
from server_fakes import AUTH, RUN_ID, SERVER_BASE, FakeEngine, MemorySettings
from sse_frames import Frame, parse_frames

from aqven.server import ServerExtensions, ServerOptions, contract_app, create_app, openapi_text, server_context
from aqven.server.event_feeds import Follow, merged, parse_follow


class Echo(BaseModel):
    seq: int
    key: str


@dataclass(frozen=True, slots=True)
class EchoFeed:
    keyed: bool = True

    async def follow(self, key: str | None, after_seq: int) -> AsyncIterator[BaseModel]:
        for seq in range(after_seq + 1, 4):
            yield Echo(seq=seq, key=key or "")


def edit_prompt(root: Path) -> None:
    prompt = root / "flows/intake/nodes/reply/reply.prompt.md"
    prompt.write_text(prompt.read_text(encoding="utf-8") + "\nAnd more.\n", encoding="utf-8")


def closed_hub_with_two_changes(app: FastAPI, root: Path) -> None:
    hub = server_context(app).hub
    edit_prompt(root)
    asyncio.run(hub.refresh())
    edit_prompt(root)
    asyncio.run(hub.refresh())
    asyncio.run(hub.close())


def seqs(frames: tuple[Frame, ...], name: str) -> list[int]:
    return [json.loads(frame.data or "{}")["seq"] for frame in frames if frame.event == name]


def test_one_stream_follows_the_project_and_a_run_from_their_cursors(
    server_app: FastAPI, server_client: TestClient, server_project: Path
) -> None:
    closed_hub_with_two_changes(server_app, server_project)

    response = server_client.get("/api/events", params={"follow": ["spec@1", f"run:{RUN_ID}@1"]})
    frames = parse_frames(response.text)

    assert response.headers["content-type"].startswith("text/event-stream")
    assert seqs(frames, "spec") == [2]
    assert seqs(frames, f"run:{RUN_ID}") == [2, 3]
    assert {frame.event for frame in frames} == {"spec", f"run:{RUN_ID}"}
    assert all(frame.id is None for frame in frames)


def test_an_unknown_key_or_a_feed_this_server_lacks_ends_quietly_and_the_others_go_on(
    server_app: FastAPI, server_client: TestClient, server_project: Path
) -> None:
    closed_hub_with_two_changes(server_app, server_project)

    follows = ["spec", "run:nope", "chat:session", "nope"]
    frames = parse_frames(server_client.get("/api/events", params={"follow": follows}).text)

    assert seqs(frames, "spec") == [1, 2]
    assert {frame.event for frame in frames} == {"spec"}


@pytest.mark.parametrize("token", ["run", "spec:abc", "spec@x", "Spec", "run:a:b", "run:a@"])
def test_a_malformed_follow_or_one_that_misses_its_key_is_rejected(server_client: TestClient, token: str) -> None:
    response = server_client.get("/api/events", params={"follow": token})

    assert response.status_code == 422
    assert response.json()["code"] == "REQUEST_INVALID"
    assert token in response.json()["message"]


def test_follow_tokens_name_a_feed_a_key_and_a_cursor() -> None:
    assert parse_follow("spec") == Follow(feed="spec", key=None, after_seq=0)
    run = Follow(feed="run", key="01a0", after_seq=17)
    assert parse_follow("run:01a0@17") == run
    assert run.name == "run:01a0"
    assert parse_follow("run:a:b") is None


def test_merged_streams_interleave_and_a_failing_feed_fails_the_stream() -> None:
    async def frames(name: str, count: int) -> AsyncIterator[ServerSentEvent]:
        for seq in range(count):
            await asyncio.sleep(0)
            yield ServerSentEvent(data=seq, event=name)

    async def failing() -> AsyncIterator[ServerSentEvent]:
        await asyncio.sleep(0)
        raise RuntimeError("feed broke")
        yield ServerSentEvent(data=0, event="never")

    async def scenario() -> list[str | None]:
        return [frame.event async for frame in merged([frames("a", 2), frames("b", 3)])]

    async def broken() -> None:
        async for _ in merged([frames("a", 50), failing()]):
            pass

    events = asyncio.run(scenario())
    assert sorted(event or "" for event in events) == ["a", "a", "b", "b", "b"]
    with pytest.raises(RuntimeError, match="feed broke"):
        asyncio.run(broken())


def test_the_follow_stream_is_described_as_a_rest_only_stream() -> None:
    operation = json.loads(openapi_text(contract_app()))["paths"]["/api/events"]["get"]

    assert "text/event-stream" in operation["responses"]["200"]["content"]
    assert "x-aqven-rest-only" in operation
    assert "stream" in operation["summary"].lower()
    assert "not a schema document" in operation["description"]
    assert [parameter["name"] for parameter in operation["parameters"]] == ["follow"]


def test_an_extension_feed_is_followed_next_to_the_core_ones(
    server_project: Path, server_engine: FakeEngine, server_settings: MemorySettings, server_options: ServerOptions
) -> None:
    extensions = ServerExtensions(feeds={"echo": EchoFeed()})
    app = create_app(server_project, server_engine, server_settings, options=server_options, extensions=extensions)
    asyncio.run(server_context(app).hub.close())

    with TestClient(app, base_url=SERVER_BASE, headers=AUTH) as client:
        frames = parse_frames(client.get("/api/events", params={"follow": ["echo:k@1", "spec"]}).text)

    assert seqs(frames, "echo:k") == [2, 3]
    assert [json.loads(frame.data or "{}")["key"] for frame in frames if frame.event == "echo:k"] == ["k", "k"]
