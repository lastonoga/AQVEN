import asyncio
import re
from collections.abc import AsyncIterator, Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Annotated, Final, Protocol

from fastapi import Query
from fastapi.sse import ServerSentEvent
from pydantic import BaseModel

from aqven.ports.engine import EngineError, EngineFacade
from aqven.runtime.address import RunId
from aqven.server.errors import ApiFailure
from aqven.server.spec_channel import SpecEventHub

SPEC_FEED: Final = "spec"
RUN_FEED: Final = "run"
FINAL_RUN_EVENT: Final = "run_finished"
MAX_FOLLOWS: Final = 8
MERGE_BUFFER: Final = 64
FOLLOW_GRAMMAR: Final = "<feed>[:<key>][@<after_seq>]"
FOLLOW_PATTERN: Final = re.compile(r"(?P<feed>[a-z]+)(?::(?P<key>[^@:\s]+))?(?:@(?P<after>\d+))?")


class EventFeed(Protocol):
    @property
    def keyed(self) -> bool: ...

    def follow(self, key: str | None, after_seq: int) -> AsyncIterator[BaseModel]: ...


type EventFeeds = Mapping[str, EventFeed]


@dataclass(frozen=True, slots=True)
class Follow:
    feed: str
    key: str | None
    after_seq: int

    @property
    def name(self) -> str:
        return self.feed if self.key is None else f"{self.feed}:{self.key}"


@dataclass(frozen=True, slots=True)
class SpecFeed:
    hub: SpecEventHub
    keyed: bool = False

    def follow(self, key: str | None, after_seq: int) -> AsyncIterator[BaseModel]:
        return self.hub.follow(after_seq)


@dataclass(frozen=True, slots=True)
class RunFeed:
    facade: EngineFacade
    keyed: bool = True

    async def follow(self, key: str | None, after_seq: int) -> AsyncIterator[BaseModel]:
        if key is None:
            return
        try:
            async for event in self.facade.run_events(RunId(key), after_seq):
                yield event
                if event.type == FINAL_RUN_EVENT:
                    return
        except EngineError as error:
            if error.code != "NOT_FOUND":
                raise


@dataclass(frozen=True, slots=True)
class FeedEnded:
    error: Exception | None = None


type Merged = ServerSentEvent | FeedEnded


def core_feeds(hub: SpecEventHub, facade: EngineFacade) -> EventFeeds:
    return {SPEC_FEED: SpecFeed(hub), RUN_FEED: RunFeed(facade)}


def parse_follow(token: str) -> Follow | None:
    match = FOLLOW_PATTERN.fullmatch(token)
    if match is None:
        return None
    after = match.group("after")
    return Follow(feed=match.group("feed"), key=match.group("key"), after_seq=0 if after is None else int(after))


def invalid_follow(token: str, reason: str) -> ApiFailure:
    return ApiFailure("REQUEST_INVALID", f"follow={token} {reason}")


def checked_follow(feeds: EventFeeds, token: str) -> Follow:
    follow = parse_follow(token)
    if follow is None:
        raise invalid_follow(token, f"is not {FOLLOW_GRAMMAR}")
    feed = feeds.get(follow.feed)
    if feed is not None and feed.keyed != (follow.key is not None):
        raise invalid_follow(token, f"must {'name' if feed.keyed else 'not name'} a key for feed {follow.feed}")
    return follow


def follows_of(feeds: EventFeeds) -> Callable[[list[str]], tuple[Follow, ...]]:
    def follows(follow: Annotated[list[str], Query(min_length=1, max_length=MAX_FOLLOWS)]) -> tuple[Follow, ...]:
        checked = (checked_follow(feeds, token) for token in follow)
        return tuple({item.name: item for item in checked}.values())

    return follows


async def feed_frames(feed: EventFeed, follow: Follow) -> AsyncIterator[ServerSentEvent]:
    async for event in feed.follow(follow.key, follow.after_seq):
        yield ServerSentEvent(data=event, event=follow.name)


async def pump(frames: AsyncIterator[ServerSentEvent], queue: asyncio.Queue[Merged]) -> None:
    try:
        async for frame in frames:
            await queue.put(frame)
    except Exception as error:
        await queue.put(FeedEnded(error))
        return
    await queue.put(FeedEnded())


async def merged(streams: Sequence[AsyncIterator[ServerSentEvent]]) -> AsyncIterator[ServerSentEvent]:
    queue: asyncio.Queue[Merged] = asyncio.Queue(MERGE_BUFFER)
    tasks = [asyncio.create_task(pump(stream, queue)) for stream in streams]
    live = len(tasks)
    try:
        while live > 0:
            item = await queue.get()
            if isinstance(item, ServerSentEvent):
                yield item
                continue
            if item.error is not None:
                raise item.error
            live -= 1
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


def followed(feeds: EventFeeds, follows: Sequence[Follow]) -> AsyncIterator[ServerSentEvent]:
    return merged([feed_frames(feeds[follow.feed], follow) for follow in follows if follow.feed in feeds])
