import asyncio

import anyio
import pytest
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from aqven.app.stream_guard import StreamDisconnectGuard

SCOPE: Scope = {"type": "http", "path": "/api/events"}


async def receive() -> Message:
    return {"type": "http.disconnect"}


async def send(message: Message) -> None:
    return None


def raising(error: BaseException) -> ASGIApp:
    async def app(scope: Scope, receive: Receive, send: Send) -> None:
        raise error

    return app


def test_a_client_that_went_away_mid_stream_is_not_an_application_error() -> None:
    group = BaseExceptionGroup("unhandled errors in a TaskGroup", [anyio.BrokenResourceError()])

    asyncio.run(StreamDisconnectGuard(raising(group))(SCOPE, receive, send))


def test_nested_disconnect_groups_are_quiet_too() -> None:
    inner = BaseExceptionGroup("inner", [anyio.ClosedResourceError()])
    outer = BaseExceptionGroup("outer", [inner, anyio.BrokenResourceError()])

    asyncio.run(StreamDisconnectGuard(raising(outer))(SCOPE, receive, send))


def test_a_real_error_next_to_a_disconnect_still_surfaces() -> None:
    group = BaseExceptionGroup("mixed", [anyio.BrokenResourceError(), ValueError("boom")])

    with pytest.raises(BaseExceptionGroup):
        asyncio.run(StreamDisconnectGuard(raising(group))(SCOPE, receive, send))


def test_a_plain_error_passes_through() -> None:
    with pytest.raises(ValueError, match="boom"):
        asyncio.run(StreamDisconnectGuard(raising(ValueError("boom")))(SCOPE, receive, send))
