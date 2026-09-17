from typing import Final

import httpx2
import pytest
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, PlainTextResponse, Response
from starlette.routing import Route, WebSocketRoute
from starlette.testclient import TestClient
from starlette.types import Scope
from starlette.websockets import WebSocket, WebSocketDisconnect

from aqven.app.access import (
    AccessGuard,
    AccessRequest,
    access_cookie_name,
    local_access_policy,
    new_access_token,
    normalized_origin,
)

PORT: Final = 5180
TOKEN: Final = "token-for-tests-0123456789abcdef"
BASE: Final = f"http://127.0.0.1:{PORT}"
COOKIE: Final = access_cookie_name(PORT)
DEV_ORIGIN: Final = "http://localhost:5173"
SOCKET_URL: Final = f"ws://127.0.0.1:{PORT}/api/socket"


async def api(request: Request) -> Response:
    return JSONResponse({"ok": True, "path": request.url.path})


async def page(request: Request) -> Response:
    return PlainTextResponse("studio")


async def socket_echo(websocket: WebSocket) -> None:
    await websocket.accept()
    await websocket.send_text("hello")
    await websocket.close()


def guarded_app() -> AccessGuard:
    inner = Starlette(
        routes=[
            Route("/api/runs", api, methods=["GET", "POST"]),
            Route("/api/ready", api),
            Route("/mcp/", api, methods=["GET", "POST"]),
            WebSocketRoute("/api/socket", socket_echo),
            Route("/{path:path}", page),
        ]
    )
    return AccessGuard(inner, local_access_policy(PORT, token=TOKEN, dev_origins=(DEV_ORIGIN,)))


def client() -> httpx2.AsyncClient:
    return httpx2.AsyncClient(transport=httpx2.ASGITransport(app=guarded_app()), base_url=BASE)


@pytest.mark.asyncio
async def test_api_without_token_is_unauthorized_envelope() -> None:
    async with client() as http:
        response = await http.get("/api/runs")
    body = response.json()
    assert response.status_code == 401
    assert body["ok"] is False
    assert body["code"] == "UNAUTHORIZED"
    assert body["op"] == "access"
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.asyncio
async def test_bearer_token_opens_api_and_mcp() -> None:
    headers = {"Authorization": f"Bearer {TOKEN}"}
    async with client() as http:
        api_response = await http.get("/api/runs", headers=headers)
        mcp_response = await http.post("/mcp/", headers=headers)
    assert api_response.status_code == 200
    assert mcp_response.status_code == 200
    assert "set-cookie" not in api_response.headers


@pytest.mark.asyncio
async def test_wrong_bearer_is_rejected() -> None:
    async with client() as http:
        response = await http.get("/api/runs", headers={"Authorization": "Bearer wrong"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_page_token_is_exchanged_for_strict_http_only_cookie() -> None:
    async with client() as http:
        response = await http.get("/flows/triage", params={"access_token": TOKEN, "tab": "graph"})
    cookie = response.headers["set-cookie"]
    assert response.status_code == 303
    assert response.headers["location"] == "/flows/triage?tab=graph"
    assert cookie.startswith(f"{COOKIE}={TOKEN};")
    assert "HttpOnly" in cookie
    assert "SameSite=Strict" in cookie
    assert "Path=/" in cookie


def test_redirect_never_becomes_protocol_relative() -> None:
    scope: Scope = {
        "type": "http",
        "path": "//evil.example/x",
        "query_string": f"access_token={TOKEN}".encode(),
        "headers": [],
    }
    assert AccessRequest.of(scope).location_without_token() == "/evil.example/x"


@pytest.mark.asyncio
async def test_cookie_opens_api_after_exchange() -> None:
    async with client() as http:
        response = await http.get("/api/runs", headers={"Cookie": f"{COOKIE}={TOKEN}"})
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_cookie_of_another_port_does_not_open_api() -> None:
    async with client() as http:
        response = await http.get("/api/runs", headers={"Cookie": f"{access_cookie_name(PORT + 1)}={TOKEN}"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_query_token_on_api_is_accepted_once_and_sets_cookie() -> None:
    async with client() as http:
        first = await http.get("/api/runs", params={"access_token": TOKEN})
        second = await http.get("/api/runs", params={"access_token": TOKEN}, headers={"Cookie": f"{COOKIE}={TOKEN}"})
    assert first.status_code == 200
    assert first.headers["set-cookie"].startswith(f"{COOKIE}={TOKEN};")
    assert second.status_code == 200
    assert "set-cookie" not in second.headers


@pytest.mark.asyncio
async def test_foreign_host_is_rejected_before_token() -> None:
    headers = {"Host": "attacker.example:5180", "Authorization": f"Bearer {TOKEN}"}
    async with client() as http:
        api_response = await http.get("/api/runs", headers=headers)
        page_response = await http.get("/", headers={"Host": "attacker.example"})
    assert api_response.status_code == 400
    assert api_response.json()["code"] == "HOST_NOT_ALLOWED"
    assert page_response.status_code == 400


@pytest.mark.asyncio
async def test_loopback_host_names_are_allowed() -> None:
    headers = {"Authorization": f"Bearer {TOKEN}"}
    async with client() as http:
        responses = [
            await http.get("/api/runs", headers={**headers, "Host": host})
            for host in (f"localhost:{PORT}", f"[::1]:{PORT}", "127.0.0.1")
        ]
    assert [response.status_code for response in responses] == [200, 200, 200]


@pytest.mark.asyncio
async def test_foreign_origin_is_forbidden_even_with_token() -> None:
    headers = {"Authorization": f"Bearer {TOKEN}", "Origin": "https://attacker.example"}
    async with client() as http:
        response = await http.post("/api/runs", headers=headers)
    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_null_origin_is_forbidden() -> None:
    async with client() as http:
        response = await http.post("/api/runs", headers={"Authorization": f"Bearer {TOKEN}", "Origin": "null"})
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_same_origin_loopback_alias_and_dev_origin_are_allowed() -> None:
    cookie = {"Cookie": f"{COOKIE}={TOKEN}"}
    async with client() as http:
        same = await http.post("/api/runs", headers={**cookie, "Origin": BASE})
        alias = await http.post("/api/runs", headers={**cookie, "Origin": f"http://localhost:{PORT}"})
        dev = await http.post("/api/runs", headers={**cookie, "Origin": f"{DEV_ORIGIN}/"})
    assert [same.status_code, alias.status_code, dev.status_code] == [200, 200, 200]


@pytest.mark.asyncio
async def test_ready_probe_is_open_and_static_page_needs_no_token() -> None:
    async with client() as http:
        ready = await http.get("/api/ready")
        index = await http.get("/")
    assert ready.status_code == 200
    assert index.status_code == 200
    assert index.text == "studio"


@pytest.mark.asyncio
async def test_prefix_lookalike_path_is_not_protected() -> None:
    async with client() as http:
        response = await http.get("/apiary")
    assert response.status_code == 200


def test_websocket_without_token_is_closed_with_policy_violation() -> None:
    with (
        TestClient(guarded_app(), base_url=BASE) as test_client,
        pytest.raises(WebSocketDisconnect) as closed,
        test_client.websocket_connect(SOCKET_URL) as socket,
    ):
        socket.receive_text()
    assert closed.value.code == 1008


def test_websocket_with_bearer_is_accepted() -> None:
    headers = {"Authorization": f"Bearer {TOKEN}"}
    with (
        TestClient(guarded_app(), base_url=BASE) as test_client,
        test_client.websocket_connect(SOCKET_URL, headers=headers) as socket,
    ):
        assert socket.receive_text() == "hello"


def test_tokens_are_random_and_long() -> None:
    tokens = {new_access_token() for _ in range(16)}
    assert len(tokens) == 16
    assert all(len(token) >= 43 for token in tokens)


def test_origin_normalization() -> None:
    assert normalized_origin("HTTP://LocalHost:5173/") == "http://localhost:5173"
    assert normalized_origin("http://127.0.0.1") == "http://127.0.0.1:80"
    assert normalized_origin("http://[::1]:5180") == "http://[::1]:5180"
    assert normalized_origin("http://x:notaport") == "http://x:notaport"


def test_policy_repr_hides_token() -> None:
    assert TOKEN not in repr(local_access_policy(PORT, token=TOKEN))
