import secrets
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Final, Literal
from urllib.parse import parse_qsl, urlencode, urlsplit

from pydantic import JsonValue
from starlette.datastructures import Headers, MutableHeaders
from starlette.requests import cookie_parser
from starlette.responses import JSONResponse, RedirectResponse, Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send
from starlette.websockets import WebSocketClose

ACCESS_TOKEN_PARAMETER: Final = "access_token"
BEARER_SCHEME: Final = "bearer"
COOKIE_PREFIX: Final = "aqven_access"
TOKEN_BYTES: Final = 32
LOOPBACK_HOSTS: Final = frozenset({"127.0.0.1", "localhost", "::1"})
LOOPBACK_ORIGIN_HOSTS: Final = ("127.0.0.1", "localhost", "[::1]")
PROTECTED_PREFIXES: Final = ("/api", "/mcp")
OPEN_PATHS: Final = frozenset({"/api/ready"})
PAGE_METHODS: Final = frozenset({"GET", "HEAD"})
PREFLIGHT_METHOD: Final = "OPTIONS"
PREFLIGHT_HEADER: Final = "access-control-request-method"
ACCESS_OPERATION: Final = "access"
POLICY_VIOLATION_CLOSE: Final = 1008
SEE_OTHER: Final = 303
NO_STORE: Final = {"Cache-Control": "no-store"}
DEFAULT_PORTS: Final[Mapping[str, int]] = {"http": 80, "https": 443}

type AccessFailure = Literal["HOST_NOT_ALLOWED", "FORBIDDEN", "UNAUTHORIZED"]

ACCESS_STATUS: Final[Mapping[AccessFailure, int]] = {
    "HOST_NOT_ALLOWED": 400,
    "FORBIDDEN": 403,
    "UNAUTHORIZED": 401,
}


def new_access_token() -> str:
    return secrets.token_urlsafe(TOKEN_BYTES)


def access_cookie_name(port: int) -> str:
    return f"{COOKIE_PREFIX}_{port}"


def normalized_origin(origin: str) -> str:
    text = origin.strip()
    try:
        parts = urlsplit(text)
        explicit_port = parts.port
    except ValueError:
        return text.lower()
    scheme = parts.scheme.lower()
    host = (parts.hostname or "").lower()
    bracketed = f"[{host}]" if ":" in host else host
    port = explicit_port if explicit_port is not None else DEFAULT_PORTS.get(scheme)
    return f"{scheme}://{bracketed}" if port is None else f"{scheme}://{bracketed}:{port}"


def host_name(host_header: str) -> str:
    if host_header.startswith("["):
        return host_header[1:].partition("]")[0].lower()
    return host_header.partition(":")[0].lower()


@dataclass(frozen=True, slots=True)
class AccessPolicy:
    token: str = field(repr=False)
    port: int
    trusted_origins: frozenset[str] = field(default_factory=frozenset[str])
    allowed_hosts: frozenset[str] = LOOPBACK_HOSTS
    protected_prefixes: tuple[str, ...] = PROTECTED_PREFIXES
    open_paths: frozenset[str] = OPEN_PATHS

    @property
    def cookie_name(self) -> str:
        return access_cookie_name(self.port)

    def accepts(self, candidate: str | None) -> bool:
        if not candidate:
            return False
        return secrets.compare_digest(candidate.encode(), self.token.encode())

    def protects(self, path: str) -> bool:
        if path in self.open_paths:
            return False
        return any(path == prefix or path.startswith(f"{prefix}/") for prefix in self.protected_prefixes)

    def host_allowed(self, host_header: str) -> bool:
        return host_name(host_header) in self.allowed_hosts

    def origin_allowed(self, origin: str, scheme: str, host_header: str) -> bool:
        candidate = normalized_origin(origin)
        same_origin = normalized_origin(f"{scheme}://{host_header}")
        return candidate == same_origin or candidate in self.trusted_origins

    def set_cookie(self) -> str:
        return f"{self.cookie_name}={self.token}; HttpOnly; SameSite=Strict; Path=/"


def local_access_policy(port: int, *, token: str | None = None, dev_origins: Sequence[str] = ()) -> AccessPolicy:
    loopback = frozenset(normalized_origin(f"http://{host}:{port}") for host in LOOPBACK_ORIGIN_HOSTS)
    development = frozenset(normalized_origin(origin) for origin in dev_origins if origin)
    return AccessPolicy(
        token=new_access_token() if token is None else token,
        port=port,
        trusted_origins=loopback | development,
    )


@dataclass(frozen=True, slots=True)
class AccessRequest:
    scope: Scope
    headers: Headers
    query: tuple[tuple[str, str], ...]

    @classmethod
    def of(cls, scope: Scope) -> AccessRequest:
        raw_query = scope.get("query_string", b"")
        query_text = raw_query.decode("latin-1") if isinstance(raw_query, bytes) else ""
        return cls(scope, Headers(scope=scope), tuple(parse_qsl(query_text, keep_blank_values=True)))

    @property
    def kind(self) -> str:
        return str(self.scope["type"])

    @property
    def path(self) -> str:
        return str(self.scope.get("path", ""))

    @property
    def method(self) -> str:
        return str(self.scope.get("method", "GET")).upper()

    @property
    def scheme(self) -> str:
        return str(self.scope.get("scheme", "http"))

    def bearer(self) -> str | None:
        scheme, _, credentials = self.headers.get("authorization", "").partition(" ")
        if scheme.lower() != BEARER_SCHEME:
            return None
        return credentials.strip()

    def cookie(self, name: str) -> str | None:
        return cookie_parser(self.headers.get("cookie", "")).get(name)

    def query_token(self) -> str | None:
        return next((value for key, value in self.query if key == ACCESS_TOKEN_PARAMETER), None)

    def location_without_token(self) -> str:
        remaining = urlencode([(key, value) for key, value in self.query if key != ACCESS_TOKEN_PARAMETER])
        local_path = f"/{self.path.lstrip('/')}"
        return f"{local_path}?{remaining}" if remaining else local_path


@dataclass(frozen=True, slots=True)
class Denied:
    code: AccessFailure
    message: str


@dataclass(frozen=True, slots=True)
class RedirectToPage:
    location: str


@dataclass(frozen=True, slots=True)
class Admitted:
    issue_cookie: bool


type AccessDecision = Denied | RedirectToPage | Admitted
type AccessCheck = Callable[[AccessPolicy, AccessRequest], AccessDecision | None]


def check_host(policy: AccessPolicy, request: AccessRequest) -> AccessDecision | None:
    if policy.host_allowed(request.headers.get("host", "")):
        return None
    return Denied("HOST_NOT_ALLOWED", "Host header does not point to the local aqven server")


def check_origin(policy: AccessPolicy, request: AccessRequest) -> AccessDecision | None:
    origin = request.headers.get("origin")
    if origin is None:
        return None
    if policy.origin_allowed(origin, request.scheme, request.headers.get("host", "")):
        return None
    return Denied("FORBIDDEN", "request from a foreign Origin rejected")


def check_preflight(policy: AccessPolicy, request: AccessRequest) -> AccessDecision | None:
    is_preflight = request.method == PREFLIGHT_METHOD and PREFLIGHT_HEADER in request.headers
    if request.kind != "http" or not is_preflight or request.headers.get("origin") is None:
        return None
    return Admitted(issue_cookie=False)


def check_page_token(policy: AccessPolicy, request: AccessRequest) -> AccessDecision | None:
    if request.kind != "http" or policy.protects(request.path) or request.method not in PAGE_METHODS:
        return None
    if not policy.accepts(request.query_token()):
        return None
    return RedirectToPage(request.location_without_token())


def check_open_path(policy: AccessPolicy, request: AccessRequest) -> AccessDecision | None:
    if policy.protects(request.path):
        return None
    return Admitted(issue_cookie=False)


def check_credentials(policy: AccessPolicy, request: AccessRequest) -> AccessDecision | None:
    if policy.accepts(request.bearer()) or policy.accepts(request.cookie(policy.cookie_name)):
        return Admitted(issue_cookie=False)
    if policy.accepts(request.query_token()):
        return Admitted(issue_cookie=True)
    return Denied("UNAUTHORIZED", "access token required: Authorization: Bearer, session cookie or access_token")


ACCESS_CHECKS: Final[tuple[AccessCheck, ...]] = (
    check_host,
    check_origin,
    check_preflight,
    check_page_token,
    check_open_path,
    check_credentials,
)


def decide(policy: AccessPolicy, request: AccessRequest) -> AccessDecision:
    decisions = (check(policy, request) for check in ACCESS_CHECKS)
    return next((decision for decision in decisions if decision is not None), Admitted(issue_cookie=False))


def envelope_rejection(denied: Denied) -> Response:
    body: dict[str, JsonValue] = {
        "ok": False,
        "op": ACCESS_OPERATION,
        "code": denied.code,
        "message": denied.message,
        "problems": [],
        "candidates": [],
        "conflict": None,
        "retry_after_ms": None,
    }
    headers = {**NO_STORE, "WWW-Authenticate": "Bearer"} if denied.code == "UNAUTHORIZED" else NO_STORE
    return JSONResponse(body, status_code=ACCESS_STATUS[denied.code], headers=headers)


type Rejection = Callable[[Denied], Response]


class AccessGuard:
    def __init__(self, app: ASGIApp, policy: AccessPolicy, rejection: Rejection = envelope_rejection) -> None:
        self.app = app
        self.policy = policy
        self.rejection = rejection

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return
        request = AccessRequest.of(scope)
        decision = decide(self.policy, request)
        match decision:
            case Admitted(issue_cookie=issue_cookie):
                await self.app(scope, receive, self._with_cookie(send) if issue_cookie else send)
            case RedirectToPage(location=location):
                await self._redirect(location, scope, receive, send)
            case Denied():
                await self._deny(request, decision, receive, send)

    async def _redirect(self, location: str, scope: Scope, receive: Receive, send: Send) -> None:
        response = RedirectResponse(location, status_code=SEE_OTHER, headers=NO_STORE)
        response.headers.append("set-cookie", self.policy.set_cookie())
        await response(scope, receive, send)

    async def _deny(self, request: AccessRequest, denied: Denied, receive: Receive, send: Send) -> None:
        if request.kind == "websocket":
            await WebSocketClose(POLICY_VIOLATION_CLOSE, denied.code)(request.scope, receive, send)
            return
        await self.rejection(denied)(request.scope, receive, send)

    def _with_cookie(self, send: Send) -> Send:
        cookie = self.policy.set_cookie()

        async def send_with_cookie(message: Message) -> None:
            if message["type"] == "http.response.start":
                MutableHeaders(scope=message).append("set-cookie", cookie)
            await send(message)

        return send_with_cookie
