import contextlib
from dataclasses import dataclass

import anyio
from starlette.types import ASGIApp, Receive, Scope, Send


@dataclass(frozen=True, slots=True)
class StreamDisconnectGuard:
    app: ASGIApp

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        with contextlib.suppress(anyio.BrokenResourceError, anyio.ClosedResourceError):
            await self.app(scope, receive, send)
