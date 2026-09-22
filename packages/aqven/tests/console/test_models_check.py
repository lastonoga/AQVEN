import json
from collections.abc import AsyncIterator
from io import StringIO
from pathlib import Path
from typing import Final

import httpx2
import pytest
from pydantic import JsonValue, SecretStr
from pydantic_ai import models
from pydantic_ai.messages import ModelMessage
from pydantic_ai.models import Model
from pydantic_ai.models.function import AgentInfo, DeltaToolCall, FunctionModel

from aqven.cli import main
from aqven.console.command import OutputFormat
from aqven.console.models import ModelsCheckRequest, check_models
from aqven.engine.llm import OUTPUT_TOOL_NAME
from aqven.testing import copy_project
from aqven_llm import ProviderModelFactory

FIXTURE: Final = Path(__file__).parent.parent / "fixtures" / "fixture_shop"
CHEAP: Final = "shared/cheap.yaml"
QWEN: Final = "openrouter:qwen/qwen3.8-max-0902"
GPT_OSS: Final = "openrouter:openai/gpt-oss-20b"
LLAMA: Final = "together:meta-llama/Llama-3.3-70B-Instruct-Turbo"
ANSWER: Final = '{"label": "refund", "rating": 4}'
OPENROUTER_PROVIDER: Final = """- id: "openrouter"
  api_key: "ref:env/OPENROUTER_API_KEY"
  data_policy:
    allows_pii: false
    allows_sensitive: false
    retention: "unknown"
"""


@pytest.fixture
def shop(tmp_path: Path) -> Path:
    root = copy_project(FIXTURE, tmp_path)
    cheap = root / CHEAP
    cheap.write_text(cheap.read_text(encoding="utf-8").replace(LLAMA, QWEN), encoding="utf-8")
    project_file = root / "aqven.yaml"
    project_file.write_text(project_file.read_text(encoding="utf-8") + OPENROUTER_PROVIDER, encoding="utf-8")
    return root


async def text_answer_model(model: str) -> Model:
    async def stream(messages: list[ModelMessage], info: AgentInfo) -> AsyncIterator[str | dict[int, DeltaToolCall]]:
        yield ANSWER

    return FunctionModel(stream_function=stream, model_name=model)


async def tool_answer_model(model: str) -> Model:
    async def stream(messages: list[ModelMessage], info: AgentInfo) -> AsyncIterator[str | dict[int, DeltaToolCall]]:
        if info.model_request_parameters.output_mode == "tool":
            yield {0: DeltaToolCall(name=OUTPUT_TOOL_NAME, json_args=ANSWER, tool_call_id="call-1")}
            return
        yield "I think the label is refund"

    return FunctionModel(stream_function=stream, model_name=model)


def request(
    root: Path, target: str | None, *, live: bool, output: OutputFormat = OutputFormat.TEXT
) -> ModelsCheckRequest:
    return ModelsCheckRequest(root=root, output=output, target=target, live=live)


def test_offline_report_shows_profile_support_and_the_auto_resolution(shop: Path) -> None:
    out = StringIO()

    assert check_models(request(shop, "cheap", live=False), out=out) == 0

    text = out.getvalue()
    assert text.splitlines()[:3] == [
        f"agent cheap ({CHEAP})",
        "  output.mode: auto -> prompted (known_model: qwen models via OpenRouter write the JSON as text instead of "
        "calling the output tool)",
        f"  model {QWEN} (auto: prompted)",
    ]
    assert "    native    unsupported" in text
    assert text.endswith("  YAML for the agent file:\n    output:\n      mode: prompted\n")


def test_live_probe_marks_the_tool_mode_that_answers_with_text(shop: Path) -> None:
    out = StringIO()

    assert check_models(request(shop, GPT_OSS, live=True), text_answer_model, out) == 1

    text = out.getvalue()
    assert "    tool      supported    failed MODEL_NO_STRUCTURED_OUTPUT: model" in text
    assert "    native    supported    ok" in text
    assert "    prompted  supported    ok" in text
    assert text.endswith("output:\n      mode: native\n")


def test_live_probe_as_json_suggests_the_first_working_mode(shop: Path) -> None:
    out = StringIO()

    assert check_models(request(shop, GPT_OSS, live=True, output=OutputFormat.JSON), tool_answer_model, out) == 0

    report = json.loads(out.getvalue())
    (target,) = report["targets"]
    rows = {row["mode"]: row for row in target["models"][0]["modes"]}
    assert (rows["tool"]["live"], rows["native"]["code"], rows["prompted"]["code"]) == (
        "ok",
        "MODEL_INVALID_JSON",
        "MODEL_INVALID_JSON",
    )
    assert (target["suggested_mode"], target["snippet"], report["ok"]) == ("tool", "output:\n  mode: tool", True)


def openrouter_reply(request: httpx2.Request) -> httpx2.Response:
    body = json.loads(request.content)
    content = ANSWER if "tools" in body else f"Here is the answer: {ANSWER}"
    chunks: list[JsonValue] = [
        {
            "id": "gen-1",
            "object": "chat.completion.chunk",
            "created": 1,
            "model": "qwen/qwen3.8-max-0902",
            "provider": "Test",
            "choices": [{"index": 0, "delta": {"role": "assistant", "content": content}, "finish_reason": None}],
        },
        {
            "id": "gen-1",
            "object": "chat.completion.chunk",
            "created": 1,
            "model": "qwen/qwen3.8-max-0902",
            "provider": "Test",
            "choices": [{"index": 0, "delta": {"content": ""}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
        },
    ]
    stream = "".join(f"data: {json.dumps(chunk)}\n\n" for chunk in chunks) + "data: [DONE]\n\n"
    return httpx2.Response(200, content=stream.encode(), headers={"content-type": "text/event-stream"})


def test_openrouter_wire_answers_are_classified_per_mode(shop: Path) -> None:
    factory = ProviderModelFactory(
        http_client=lambda: httpx2.AsyncClient(transport=httpx2.MockTransport(openrouter_reply))
    )

    async def build(model: str) -> Model:
        return factory.build(model, settings=None, api_key=SecretStr("sk-test"))

    out = StringIO()
    with models.override_allow_model_requests(True):
        code = check_models(request(shop, QWEN, live=True, output=OutputFormat.JSON), build, out)

    report = json.loads(out.getvalue())
    rows = {row["mode"]: row for row in report["targets"][0]["models"][0]["modes"]}
    assert rows["tool"]["code"] == "MODEL_NO_STRUCTURED_OUTPUT"
    assert rows["tool"]["excerpt"] == ANSWER
    assert rows["prompted"]["code"] == "MODEL_INVALID_JSON"
    assert (report["targets"][0]["resolved_mode"], code) == ("prompted", 1)


def test_unknown_agent_is_reported(shop: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["models", "check", "author", "--project", str(shop)]) == 1

    assert (
        "aqven models check: author is neither an agent of the project nor a provider:model" in capsys.readouterr().err
    )


def test_models_check_without_a_project_prints_the_diagnostic(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert main(["models", "check", "--project", str(tmp_path), "--json"]) == 1

    assert json.loads(capsys.readouterr().out)["diagnostics"][0]["code"] == "E_PROJECT_NOT_FOUND"
