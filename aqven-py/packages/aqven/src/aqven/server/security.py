import secrets
from dataclasses import dataclass, field
from typing import Final
from urllib.parse import parse_qsl, urlencode

from starlette.responses import Response
from starlette.types import ASGIApp, Receive, Scope, Send

from aqven.app.access import (
    ACCESS_TOKEN_PARAMETER,
    LOOPBACK_HOSTS,
    AccessFailure,
    AccessRequest,
    Denied,
    envelope_rejection,
    new_access_token,
)

ACCESS_TOKEN_PARAM: Final = ACCESS_TOKEN_PARAMETER
HTTP_SCOPES: Final = frozenset({"http", "websocket"})
QUERY_ENCODING: Final = "latin-1"

__all__ = [
    "ACCESS_TOKEN_PARAM",
    "LOOPBACK_HOSTS",
    "AccessPolicy",
    "QueryTokenScrubber",
    "guard_request",
    "new_access_token",
    "reject",
    "without_access_token",
]


@dataclass(frozen=True, slots=True)
class AccessPolicy:
    token: str = field(repr=False)

    def token_matches(self, candidate: str | None) -> bool:
        if not candidate:
            return False
        return secrets.compare_digest(candidate.encode(), self.token.encode())


def guard_request(scope: Scope) -> AccessRequest:
    return AccessRequest.of(scope)


def reject(code: AccessFailure, message: str) -> Response:
    return envelope_rejection(Denied(code, message))


def without_access_token(query_string: bytes) -> bytes:
    pairs = parse_qsl(query_string.decode(QUERY_ENCODING), keep_blank_values=True)
    remaining = [(key, value) for key, value in pairs if key != ACCESS_TOKEN_PARAMETER]
    return urlencode(remaining).encode(QUERY_ENCODING)


class QueryTokenScrubber:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        raw = scope.get("query_string", b"")
        carries_token = (
            scope["type"] in HTTP_SCOPES and isinstance(raw, bytes) and ACCESS_TOKEN_PARAMETER.encode() in raw
        )
        if not carries_token:
            await self.app(scope, receive, send)
            return
        await self.app({**scope, "query_string": without_access_token(raw)}, receive, send)
