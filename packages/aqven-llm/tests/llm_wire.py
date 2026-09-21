import json
import threading
from collections.abc import Generator, Mapping, Sequence
from contextlib import contextmanager
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Final

import httpx2
from pydantic import JsonValue, SecretStr
from pydantic_ai.messages import ModelMessage, ModelRequest, UserPromptPart

API_KEY: Final = SecretStr("sk-test-0000000000000000")
SSE_HEADERS: Final = {"content-type": "text/event-stream"}
LOOPBACK: Final = "127.0.0.1"


@dataclass(frozen=True, slots=True)
class Reply:
    status: int
    body: bytes
    content_type: str = "application/json"


def sse_reply(body: bytes) -> Reply:
    return Reply(200, body, "text/event-stream")


def json_reply(status: int, payload: JsonValue) -> Reply:
    return Reply(status, json.dumps(payload).encode())


def data_stream(chunks: Sequence[JsonValue]) -> bytes:
    return ("".join(f"data: {json.dumps(chunk)}\n\n" for chunk in chunks) + "data: [DONE]\n\n").encode()


def event_stream(events: Sequence[tuple[str, JsonValue]]) -> bytes:
    return "".join(f"event: {name}\ndata: {json.dumps(payload)}\n\n" for name, payload in events).encode()


def plain_data_stream(chunks: Sequence[JsonValue]) -> bytes:
    return "".join(f"data: {json.dumps(chunk)}\n\n" for chunk in chunks).encode()


class Recorder:
    def __init__(self, replies: Sequence[Reply]) -> None:
        self.replies = list(replies)
        self.requests: list[httpx2.Request] = []

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        self.requests.append(request)
        reply = self.replies[min(len(self.requests), len(self.replies)) - 1]
        return httpx2.Response(reply.status, content=reply.body, headers={"content-type": reply.content_type})

    def bodies(self) -> list[dict[str, JsonValue]]:
        return [json.loads(request.content) for request in self.requests]

    def client(self) -> httpx2.AsyncClient:
        return httpx2.AsyncClient(transport=httpx2.MockTransport(self))


@dataclass
class ServerLog:
    replies: Sequence[Reply]
    paths: list[str] = field(default_factory=list[str])
    bodies: list[bytes] = field(default_factory=list[bytes])


def handler_for(log: ServerLog) -> type[BaseHTTPRequestHandler]:
    class ScriptedHandler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:
            length = int(self.headers.get("content-length") or 0)
            log.bodies.append(self.rfile.read(length))
            log.paths.append(self.path)
            reply = log.replies[min(len(log.paths), len(log.replies)) - 1]
            self.send_response(reply.status)
            self.send_header("content-type", reply.content_type)
            self.send_header("content-length", str(len(reply.body)))
            self.end_headers()
            self.wfile.write(reply.body)

        def log_message(self, format: str, *args: object) -> None:
            return None

    return ScriptedHandler


@contextmanager
def local_server(replies: Sequence[Reply]) -> Generator[tuple[str, ServerLog]]:
    log = ServerLog(replies)
    server = ThreadingHTTPServer((LOOPBACK, 0), handler_for(log))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://{LOOPBACK}:{server.server_address[1]}", log
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def prompt(text: str) -> list[ModelMessage]:
    return [ModelRequest(parts=[UserPromptPart(text)])]


def chat_chunk(delta: Mapping[str, JsonValue], finish: str | None = None, **extra: JsonValue) -> dict[str, JsonValue]:
    return {
        "id": "gen-1",
        "object": "chat.completion.chunk",
        "created": 1_790_000_000,
        "model": "mock-model",
        "choices": [{"index": 0, "delta": dict(delta), "finish_reason": finish}],
        **extra,
    }


def chat_tool_stream(usage_extra: Mapping[str, JsonValue] | None = None) -> list[JsonValue]:
    call: dict[str, JsonValue] = {
        "index": 0,
        "id": "call_1",
        "type": "function",
        "function": {"name": "final_result", "arguments": '{"answer": "Pa'},
    }
    more: dict[str, JsonValue] = {"index": 0, "function": {"arguments": 'ris", "score": 9}'}}
    usage: dict[str, JsonValue] = {
        "prompt_tokens": 40,
        "completion_tokens": 12,
        "total_tokens": 52,
        **(usage_extra or {}),
    }
    return [
        chat_chunk({"role": "assistant", "tool_calls": [call]}),
        chat_chunk({"tool_calls": [more]}),
        chat_chunk({}, "tool_calls", usage=usage),
    ]
